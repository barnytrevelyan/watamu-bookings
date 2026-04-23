'use client';

/**
 * Kwetu site chatbot widget (Phase 1).
 *
 * Floating button bottom-right; expands into a chat panel. Talks to
 * /api/chat, which runs Claude Haiku with the Kwetu tool set.
 *
 * Visibility: shown to everyone by default. Two client-side kill-switches:
 *   - localStorage.kwetu_chat_disabled_v1 = '1' is flipped automatically
 *     when /api/chat returns 503 (missing API key), so we never show a
 *     perma-broken widget.
 *   - localStorage.kwetu_chat_beta = '0' is a manual opt-out.
 *
 * Conversation is persisted to localStorage so a page navigation doesn't
 * wipe context. We cap history length in both directions (20 turns total)
 * because it's also what the API keeps.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, RotateCcw, Sparkles, ExternalLink } from 'lucide-react';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  // Present on assistant messages — raw JSON preview of tool results so we
  // can show "3 matches found" chips or similar downstream.
  trace?: Array<{ name: string; input: unknown; result_preview: string }>;
}

const STORAGE_KEY = 'kwetu_chat_history_v1';
const BETA_FLAG_KEY = 'kwetu_chat_beta';
const SESSION_KEY = 'kwetu_chat_session_id_v1';
const MAX_HISTORY = 20;

// Cloudflare Turnstile global handle (added by their injected script).
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'invisible';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const DISABLED_FLAG_KEY = 'kwetu_chat_disabled_v1';

function isBotVisible(): boolean {
  if (typeof window === 'undefined') return false;
  // Client-side kill-switch. If the API route ever returns 503 (key not set,
  // bot disabled at the edge), we remember that for the rest of this browser
  // session so we stop showing a broken widget. Also lets future code turn
  // it off manually if needed.
  if (window.localStorage.getItem(DISABLED_FLAG_KEY) === '1') return false;
  // Legacy: honour the old beta flag the other way round. If anyone set
  // kwetu_chat_beta=0 explicitly they can still opt out.
  if (window.localStorage.getItem(BETA_FLAG_KEY) === '0') return false;
  return true;
}

export default function ChatWidget() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileNeeded, setTurnstileNeeded] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const turnstileMountRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  // Gate on mount — avoids SSR mismatch.
  useEffect(() => {
    setEnabled(isBotVisible());
  }, []);

  // Stable per-browser session id so we can correlate turns server-side.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    sessionIdRef.current = id;
  }, [enabled]);

  // Lazy-load the Turnstile script once we know we need it. Also renders
  // the widget into the composer so the user can complete the challenge.
  const ensureTurnstileLoaded = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject();
      if (window.turnstile) return resolve();
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${TURNSTILE_SCRIPT_URL}"]`,
      );
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject());
        return;
      }
      const s = document.createElement('script');
      s.src = TURNSTILE_SCRIPT_URL;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject();
      document.head.appendChild(s);
    });
  }, []);

  // Render Turnstile whenever a sitekey lands AND the mount point is ready.
  useEffect(() => {
    if (!turnstileNeeded || !turnstileSiteKey) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureTurnstileLoaded();
        if (cancelled || !turnstileMountRef.current || !window.turnstile) return;
        // Reset if already rendered.
        if (turnstileWidgetIdRef.current) {
          window.turnstile.remove(turnstileWidgetIdRef.current);
          turnstileWidgetIdRef.current = null;
        }
        turnstileWidgetIdRef.current = window.turnstile.render(
          turnstileMountRef.current,
          {
            sitekey: turnstileSiteKey,
            size: 'normal',
            theme: 'light',
            callback: (token: string) => setTurnstileToken(token),
            'error-callback': () => setTurnstileToken(null),
            'expired-callback': () => setTurnstileToken(null),
          },
        );
      } catch {
        // Cloudflare script failed to load — stay soft, user can still
        // browse the rest of the site.
        setError("Couldn't load the human check. Please try again later.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [turnstileNeeded, turnstileSiteKey, ensureTurnstileLoaded]);

  // Load persisted history on mount.
  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMsg[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_HISTORY));
      }
    } catch {
      // Ignore — fresh session is fine.
    }
  }, [enabled]);

  // Persist history on change.
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {
      // Quota full or private mode — fine, just skip persist.
    }
  }, [messages, enabled]);

  // Scroll to bottom on new message.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  // Focus the input when the panel opens, restore focus to the launcher
  // when it closes. Nice-to-have for keyboard + screen reader users.
  useEffect(() => {
    if (open) {
      // Next tick so the textarea has mounted.
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      launcherRef.current?.focus();
    }
  }, [open]);

  // Escape closes the panel when it's open. Handler only bound while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    // If Turnstile is required but the user hasn't completed the challenge
    // yet, nudge them instead of sending an unverified request.
    if (turnstileNeeded && !turnstileToken) {
      setError('Please complete the human check below before sending.');
      return;
    }
    setError(null);
    const next: ChatMsg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          turnstile_token: turnstileToken ?? undefined,
          session_id: sessionIdRef.current,
        }),
      });

      // 401 with require_turnstile means the server wants a fresh human
      // check — surface the widget in the composer.
      if (res.status === 401) {
        const body = (await res.json().catch(() => ({}))) as {
          require_turnstile?: boolean;
          site_key?: string | null;
          error?: string;
        };
        if (body?.require_turnstile) {
          setTurnstileNeeded(true);
          setTurnstileSiteKey(body.site_key || null);
          setTurnstileToken(null);
          setError(
            body.site_key
              ? 'Please complete the human check below to continue.'
              : 'The human check is not configured on this deployment.',
          );
          // Remove the optimistic user message so they can retry cleanly
          // after completing the challenge.
          setMessages((prev) => prev.slice(0, -1));
          setInput(trimmed);
          return;
        }
      }

      // 503 means the deployment hasn't got an ANTHROPIC_API_KEY. Don't keep
      // showing a broken widget — flip the kill-switch and fade out.
      if (res.status === 503) {
        try {
          localStorage.setItem(DISABLED_FLAG_KEY, '1');
        } catch {
          /* ignore */
        }
        setEnabled(false);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        reply: string;
        tool_trace: ChatMsg['trace'];
      };
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply, trace: data.tool_trace },
      ]);
      // Verified for 24h now — drop the challenge UI and the stale token.
      if (turnstileNeeded) {
        setTurnstileNeeded(false);
        setTurnstileToken(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "Sorry — I'm having trouble replying right now. Please try again in a moment, or browse directly at /properties or /boats.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  if (!enabled) return null;

  return (
    <>
      {/* Floating launcher */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Kwetu assistant' : 'Open Kwetu assistant'}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary-500)] to-[var(--color-primary-700)] text-white shadow-lg ring-4 ring-white/60 transition-transform hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <aside
          className="fixed bottom-24 right-5 z-50 flex h-[min(640px,calc(100vh-120px))] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          role="dialog"
          aria-label="Kwetu assistant"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-br from-[var(--color-primary-50)] to-white px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary-500)] to-[var(--color-primary-700)] text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Kwetu assistant</p>
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-primary-700)]">
                  Beta
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                aria-label="Clear conversation"
                title="Clear conversation"
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Minimise"
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50/50"
            // aria-live="polite" so screen-reader users are told about new
            // assistant replies without interrupting current speech.
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-sm text-gray-600">
                <p className="mb-2 font-medium text-gray-900">
                  Hi — I&rsquo;m Kwetu&rsquo;s assistant.
                </p>
                <p className="mb-3">
                  Ask me things like:
                </p>
                <ul className="space-y-1 text-xs text-gray-600">
                  <li>&ldquo;What&rsquo;s free in Kilifi next weekend for 4 people with a pool?&rdquo;</li>
                  <li>&ldquo;Half-day fishing charters from Watamu?&rdquo;</li>
                  <li>&ldquo;How does Kwetu&rsquo;s commission work?&rdquo;</li>
                </ul>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} msg={m} />
            ))}

            {sending && (
              <div className="flex gap-2">
                <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[var(--color-primary-400)] to-[var(--color-primary-600)]" />
                <div className="flex items-center gap-1 rounded-2xl bg-white border border-gray-200 px-3 py-2">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: '120ms' }}
                  />
                  <span
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: '240ms' }}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-center text-xs text-red-600">{error}</p>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-gray-100 bg-white px-3 py-3"
          >
            {turnstileNeeded && (
              <div className="mb-2 flex justify-center">
                <div ref={turnstileMountRef} />
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask about stays, trips, or how Kwetu works"
                aria-label="Ask the Kwetu assistant"
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary-400)] focus:bg-white focus:ring-2 focus:ring-[var(--color-primary-200)]"
                disabled={sending}
                maxLength={1000}
              />
              <button
                type="submit"
                disabled={
                  sending ||
                  !input.trim() ||
                  (turnstileNeeded && !turnstileToken)
                }
                aria-label="Send message"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-600)] text-white transition-colors hover:bg-[var(--color-primary-700)] disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-gray-400">
              Beta. Answers come from Kwetu&rsquo;s live data — but double-check anything important.
            </p>
          </form>
        </aside>
      )}
    </>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[var(--color-primary-400)] to-[var(--color-primary-600)] text-white flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[var(--color-primary-600)] text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
      >
        <RichText text={msg.content} />
        {!isUser && msg.trace && msg.trace.length > 0 && (
          <div className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
            <span className="font-medium">Used:</span>{' '}
            {msg.trace.map((t) => t.name).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Very light text renderer — converts bare /properties… and https://… URLs
 * into clickable links without pulling in a markdown parser.
 */
function RichText({ text }: { text: string }) {
  const parts = text.split(
    /(\/(?:properties|boats|activities|about|contact|terms|become-a-host)(?:\/[A-Za-z0-9_\-?=&%.]*)?|https?:\/\/[^\s)\]]+)/g,
  );
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('/') || part.startsWith('http')) {
          const external = part.startsWith('http');
          return (
            <a
              key={i}
              href={part}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:opacity-80"
            >
              {part}
              {external && <ExternalLink className="h-3 w-3 ml-0.5" />}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

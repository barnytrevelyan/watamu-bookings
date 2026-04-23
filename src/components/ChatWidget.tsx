'use client';

/**
 * Kwetu site chatbot widget (Phase 1).
 *
 * Floating button bottom-right; expands into a chat panel. Talks to
 * /api/chat, which runs Claude Haiku with the Kwetu tool set.
 *
 * Beta-gated: the widget is only rendered when the user has opted in via
 * either the ?chat=1 query param (sticky — persisted to localStorage) or
 * the `kwetu_chat_beta` localStorage flag manually set. This lets Barny
 * test in production without exposing it to real traffic.
 *
 * Conversation is persisted to localStorage so a page navigation doesn't
 * wipe context. We cap history length in both directions (20 turns total)
 * because it's also what the API keeps.
 */

import { useEffect, useRef, useState } from 'react';
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
const MAX_HISTORY = 20;

function isBetaEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.localStorage.getItem(BETA_FLAG_KEY) === '1') return true;
  const params = new URLSearchParams(window.location.search);
  if (params.get('chat') === '1') {
    window.localStorage.setItem(BETA_FLAG_KEY, '1');
    return true;
  }
  return false;
}

export default function ChatWidget() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Gate on mount — avoids SSR mismatch.
  useEffect(() => {
    setEnabled(isBetaEnabled());
  }, []);

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

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
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
        }),
      });
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Kwetu assistant' : 'Open Kwetu assistant'}
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
            <div className="flex items-end gap-2">
              <textarea
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
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary-400)] focus:bg-white focus:ring-2 focus:ring-[var(--color-primary-200)]"
                disabled={sending}
                maxLength={1000}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
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

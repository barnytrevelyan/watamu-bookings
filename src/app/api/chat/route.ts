import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { TOOLS } from '@/lib/chatbot/tools';
import { dispatchTool } from '@/lib/chatbot/executors';
import { buildSystemPrompt } from '@/lib/chatbot/prompt';
import {
  CHAT_VERIFY_COOKIE,
  VERIFY_COOKIE_OPTIONS,
  isTurnstileEnabled,
  signVerifyCookie,
  validateVerifyCookie,
  verifyTurnstileToken,
} from '@/lib/chatbot/turnstile';
import { checkDailyBudget, logTurnUsage } from '@/lib/chatbot/budget';

/**
 * POST /api/chat — Kwetu site chatbot endpoint (Phase 1).
 *
 * Request body:
 *   {
 *     messages: Array<{role: 'user'|'assistant', content: string}>,
 *     turnstile_token?: string,   // required on first-in-session message
 *     session_id?: string         // client-supplied; for analytics
 *   }
 *
 * Response body on success:
 *   { reply: string, tool_trace: [...] }
 *
 * Abuse controls stacked in order:
 *   1. ANTHROPIC_API_KEY missing → 503 (widget hides).
 *   2. Per-IP in-memory rate limit → 429 on burst.
 *   3. Turnstile verification (when configured) → 401 with
 *      { require_turnstile: true, site_key } until a valid token is
 *      supplied. Signed cookie trusted for 24h on success.
 *   4. Daily USD budget cap → 429 with graceful message when tripped.
 */

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOOL_ITERATIONS = 6;
const MAX_MESSAGES_KEPT = 20;

// Per-IP in-memory rate limit. Good enough for Phase 1; swap to Redis when
// the widget is turned on for real traffic.
const rateBucket = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // messages per minute per IP

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBucket.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBucket.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Chatbot is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429 },
    );
  }

  let body: {
    messages?: ChatMessage[];
    turnstile_token?: string;
    session_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // --- Turnstile verification ---
  // If Turnstile is configured AND the caller doesn't already hold a valid
  // signed cookie, require a fresh token with this request.
  const turnstileNeeded = isTurnstileEnabled();
  const cookie = request.cookies.get(CHAT_VERIFY_COOKIE)?.value;
  const alreadyVerified = validateVerifyCookie(cookie);
  let shouldSetCookie = false;

  if (turnstileNeeded && !alreadyVerified) {
    const ok = await verifyTurnstileToken(body.turnstile_token, ip);
    if (!ok) {
      return NextResponse.json(
        {
          error: 'Please complete the human check to continue.',
          require_turnstile: true,
          site_key: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
        },
        { status: 401 },
      );
    }
    shouldSetCookie = true;
  }

  // --- Daily budget ceiling ---
  const budget = await checkDailyBudget();
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error:
          "Kwetu's assistant has reached its daily limit. Please try again tomorrow, or browse directly at /properties and /boats.",
        budget: { spent_usd: budget.spendUsd, cap_usd: budget.capUsd },
      },
      { status: 429 },
    );
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 });
  }

  // Keep the tail only — long conversations get expensive fast.
  const messages = incoming.slice(-MAX_MESSAGES_KEPT).filter(
    (m) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0,
  );

  const sessionId =
    body.session_id && typeof body.session_id === 'string' && body.session_id.length > 0
      ? body.session_id.slice(0, 128)
      : crypto.randomUUID();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const convo: Anthropic.Messages.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolTrace: Array<{
    name: string;
    input: Record<string, unknown>;
    result_preview: string;
  }> = [];

  let assistantText = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turnCount = 0;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
    let response: Anthropic.Messages.Message;
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages: convo,
      });
    } catch (err) {
      console.error('[chat] Anthropic call failed', err);
      return NextResponse.json(
        { error: 'Assistant is temporarily unavailable.' },
        { status: 502 },
      );
    }

    turnCount += 1;
    totalInputTokens += response.usage?.input_tokens ?? 0;
    totalOutputTokens += response.usage?.output_tokens ?? 0;

    for (const block of response.content) {
      if (block.type === 'text') assistantText += block.text;
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );

    convo.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (tu) => {
        const input = (tu.input ?? {}) as Record<string, unknown>;
        try {
          const result = await dispatchTool(tu.name, input);
          const serialised = JSON.stringify(result);
          toolTrace.push({
            name: tu.name,
            input,
            result_preview: serialised.slice(0, 200),
          });
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: serialised,
          } as Anthropic.Messages.ToolResultBlockParam;
        } catch (err) {
          console.error(`[chat] tool ${tu.name} threw`, err);
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify({ error: 'Tool failed' }),
            is_error: true,
          } as Anthropic.Messages.ToolResultBlockParam;
        }
      }),
    );

    convo.push({ role: 'user', content: toolResults });
    assistantText = '';
  }

  const finalReply = assistantText.trim() ||
    "I'm sorry — I couldn't produce an answer for that. Try asking it a different way, or browse Kwetu directly at /properties or /boats.";

  // Log cost/usage best-effort (never blocks response).
  void logTurnUsage({
    sessionId,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    path: '/api/chat',
    turnCount,
  });

  const res = NextResponse.json({
    reply: finalReply,
    tool_trace: toolTrace,
  });

  if (shouldSetCookie) {
    res.cookies.set(CHAT_VERIFY_COOKIE, signVerifyCookie(), VERIFY_COOKIE_OPTIONS);
  }

  return res;
}

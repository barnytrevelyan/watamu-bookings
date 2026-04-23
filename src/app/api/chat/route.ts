import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { TOOLS } from '@/lib/chatbot/tools';
import { dispatchTool } from '@/lib/chatbot/executors';
import { buildSystemPrompt } from '@/lib/chatbot/prompt';

/**
 * POST /api/chat — Kwetu site chatbot endpoint (Phase 1).
 *
 * Request body:
 *   { messages: Array<{role: 'user'|'assistant', content: string}> }
 *
 * Response body:
 *   { reply: string, tool_trace: Array<{name, input, result_preview}> }
 *
 * Behaviour:
 *   - Runs Claude Haiku with the Kwetu tool set in a tool-use loop.
 *   - Returns the final assistant text plus a tool trace (for debug and
 *     for the client widget to render inline listing cards if it wants).
 *   - Non-streaming in Phase 1. Streaming upgrade is a Phase 3 job.
 *
 * Guardrails:
 *   - Requires ANTHROPIC_API_KEY; otherwise 503 so the widget can hide.
 *   - Hard cap of 6 tool-use iterations per turn so a runaway model
 *     can't loop us into a timeout.
 *   - Tight per-IP rate limit to blunt the worst-case abuse.
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

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Chatbot is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429 },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Anthropic's "messages" format: content is either a string OR an array
  // of content blocks. We start with string content from the client and
  // mutate into block arrays as tool calls happen.
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

    // Gather any plain text in this turn.
    for (const block of response.content) {
      if (block.type === 'text') assistantText += block.text;
    }

    if (response.stop_reason !== 'tool_use') {
      // Model's done — return.
      break;
    }

    // Otherwise: run every tool_use block in parallel, then loop.
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );

    // Append the assistant turn (with tool_use) to the convo.
    convo.push({ role: 'assistant', content: response.content });

    // Run each tool and build a single user message containing all tool_results.
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
    // Reset assistantText for the next iteration — only the final iter
    // returns text we actually show.
    assistantText = '';
  }

  const finalReply = assistantText.trim() ||
    "I'm sorry — I couldn't produce an answer for that. Try asking it a different way, or browse Kwetu directly at /properties or /boats.";

  return NextResponse.json({
    reply: finalReply,
    tool_trace: toolTrace,
  });
}

/**
 * Daily spend cap for the site chatbot.
 *
 * We don't trust any single defensive layer. Turnstile + per-IP rate limits
 * catch most abuse, but if something gets through we still want a hard dollar
 * ceiling so a determined attacker can't burn through the Anthropic credit
 * line overnight. This module owns that ceiling.
 *
 * Storage: we piggyback on `wb_events`. Each Anthropic call logs a
 * `chat_turn` event with `payload = { input_tokens, output_tokens, cost_usd }`.
 * Today's spend is the sum of `payload.cost_usd` over today's UTC day.
 *
 * Failure mode: if the usage query fails (Supabase down, etc.) we fail-open
 * rather than block every request — a chatbot that's down is worse than one
 * slightly over-spending for a few minutes.
 */

import { createClient as createAdminClient } from '@/lib/supabase/admin';

// Claude Haiku 4.5 list prices (USD per token). Update if Anthropic raises
// prices; double-check against https://www.anthropic.com/pricing.
export const HAIKU_INPUT_USD_PER_TOKEN = 1.0 / 1_000_000;
export const HAIKU_OUTPUT_USD_PER_TOKEN = 5.0 / 1_000_000;

/** Dollar cost for a single turn given Anthropic's usage counts. */
export function computeTurnCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    inputTokens * HAIKU_INPUT_USD_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_USD_PER_TOKEN
  );
}

/** Daily ceiling from env, defaulting to $5 so an accidentally-public deploy
 *  can't rack up a huge bill on day one. */
export function getDailyBudgetUsd(): number {
  const raw = Number(process.env.CHAT_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Sum of today's chat cost (in USD). Returns 0 on lookup failure — fail-open
 * so a Supabase blip doesn't take the chatbot offline.
 */
export async function getTodaySpendUsd(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('wb_events')
      .select('payload')
      .eq('event_name', 'chat_turn')
      .gte('created_at', startOfUtcDay().toISOString());
    if (error || !data) return 0;
    let total = 0;
    for (const row of data as Array<{ payload: unknown }>) {
      const p = row.payload as { cost_usd?: unknown } | null;
      const c = Number(p?.cost_usd);
      if (Number.isFinite(c)) total += c;
    }
    return total;
  } catch {
    return 0;
  }
}

interface BudgetCheckResult {
  allowed: boolean;
  spendUsd: number;
  capUsd: number;
}

/** Check whether the chatbot should accept another turn right now. */
export async function checkDailyBudget(): Promise<BudgetCheckResult> {
  const cap = getDailyBudgetUsd();
  const spend = await getTodaySpendUsd();
  return { allowed: spend < cap, spendUsd: spend, capUsd: cap };
}

/**
 * Record one turn's cost + usage to wb_events. Best-effort — logging
 * failures are swallowed so a write blip can't fail the live chat response
 * to the user.
 */
export async function logTurnUsage(params: {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  path?: string | null;
  userId?: string | null;
  turnCount?: number;
}): Promise<void> {
  const cost = computeTurnCostUsd(params.inputTokens, params.outputTokens);
  try {
    const admin = createAdminClient();
    await admin.from('wb_events').insert({
      event_name: 'chat_turn',
      session_id: params.sessionId,
      user_id: params.userId ?? null,
      payload: {
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        cost_usd: cost,
        turn_count: params.turnCount ?? null,
      },
      path: params.path ?? '/api/chat',
    });
  } catch (err) {
    console.error('[chat] failed to log turn usage', err);
  }
}

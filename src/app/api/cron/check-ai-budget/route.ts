import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/check-ai-budget
 *
 * Daily scheduled check on platform-paid OpenAI import spend. Reads the last
 * 30 days of `wb_import_logs` where `source` ends in `:platform`, sums the
 * per-request `cost_usd` we recorded at import time, and emails the admin if
 * trailing spend crosses the configured threshold.
 *
 * A single alert is sent per 7-day window so we don't spam the inbox when
 * multiple imports tip us over the threshold on the same day. The "last sent"
 * timestamp is persisted in `wb_import_logs` itself (source = 'alert:budget')
 * to avoid needing a new migration.
 *
 * Email transport: ZeptoMail (already configured for this project — see env
 * var docs in .env.example). ZeptoMail's Transactional HTTP API is a single
 * JSON POST with an `Authorization: Zoho-enczapikey <TOKEN>` header.
 *
 * Authentication: Vercel Cron sets `Authorization: Bearer $CRON_SECRET` when
 * `CRON_SECRET` is configured; we check for it so the endpoint can't be
 * triggered by anonymous traffic.
 *
 * Env:
 *   CRON_SECRET                       — shared token Vercel Cron sends
 *   WATAMU_AI_MONTHLY_BUDGET_USD      — monthly budget cap (default 50)
 *   WATAMU_AI_ALERT_THRESHOLD_PCT     — percent of budget that triggers alert (default 80)
 *   WATAMU_AI_ALERT_EMAIL             — where to send the alert (default barnytrevelyan@gmail.com)
 *   ZEPTOMAIL_TOKEN                   — the `Zoho-enczapikey …` token string (without the "Zoho-enczapikey " prefix)
 *   ZEPTOMAIL_FROM_EMAIL              — verified sender address (e.g. alerts@watamu-bookings.co.ke)
 *   ZEPTOMAIL_FROM_NAME               — display name (default "Watamu Bookings Alerts")
 *   ZEPTOMAIL_API_URL                 — override for EU/IN regions, default https://api.zeptomail.com/v1.1/email
 */

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const DEFAULT_BUDGET_USD = 50;
const DEFAULT_THRESHOLD_PCT = 80;
const DEFAULT_ALERT_EMAIL = 'barnytrevelyan@gmail.com';
const DEFAULT_FROM_NAME = 'Watamu Bookings Alerts';
const DEFAULT_ZEPTO_URL = 'https://api.zeptomail.com/v1.1/email';
const COOLDOWN_DAYS = 7;

function parsePositiveFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Send a single transactional email via ZeptoMail. Returns null on success or
 * an error string describing what went wrong.
 */
async function sendViaZeptoMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<string | null> {
  const token = process.env.ZEPTOMAIL_TOKEN?.trim();
  const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL?.trim();
  const fromName = process.env.ZEPTOMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  const apiUrl = process.env.ZEPTOMAIL_API_URL?.trim() || DEFAULT_ZEPTO_URL;

  if (!token) {
    return 'ZEPTOMAIL_TOKEN is not configured — cannot send alert.';
  }
  if (!fromEmail) {
    return 'ZEPTOMAIL_FROM_EMAIL is not configured — cannot send alert.';
  }

  // ZeptoMail accepts the api key raw or prefixed with "Zoho-enczapikey ".
  // Normalise so the env var can be pasted either way.
  const authValue = token.toLowerCase().startsWith('zoho-enczapikey')
    ? token
    : `Zoho-enczapikey ${token}`;

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: authValue,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: { address: fromEmail, name: fromName },
        to: [{ email_address: { address: opts.to } }],
        subject: opts.subject,
        htmlbody: opts.html,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return `ZeptoMail failed (${resp.status}): ${body.slice(0, 300)}`;
    }
    return null;
  } catch (err: any) {
    return err?.message || 'Failed to reach ZeptoMail API';
  }
}

export async function GET(request: NextRequest) {
  // Vercel Cron jobs include an Authorization: Bearer CRON_SECRET header.
  // Support the same secret via ?token= so Barny can curl it for a manual
  // test without setting a header.
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    const tokenQuery = request.nextUrl.searchParams.get('token') || '';
    const ok = auth === `Bearer ${cronSecret}` || tokenQuery === cronSecret;
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const budget = parsePositiveFloat(
    process.env.WATAMU_AI_MONTHLY_BUDGET_USD,
    DEFAULT_BUDGET_USD
  );
  const thresholdPct = parsePositiveFloat(
    process.env.WATAMU_AI_ALERT_THRESHOLD_PCT,
    DEFAULT_THRESHOLD_PCT
  );
  const alertEmail = process.env.WATAMU_AI_ALERT_EMAIL || DEFAULT_ALERT_EMAIL;

  const supabase = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Pull trailing-30d platform-paid runs. We store cost_usd inside the
  // imported_data JSON so the whole row comes back; we then sum in JS (a few
  // hundred rows at most — well within memory budget).
  const { data: logs, error: logsErr } = await supabase
    .from('wb_import_logs')
    .select('source, created_at, imported_data')
    .ilike('source', '%:platform')
    .gte('created_at', since)
    .limit(5000);

  if (logsErr) {
    return NextResponse.json(
      { error: `Failed to read import logs: ${logsErr.message}` },
      { status: 500 }
    );
  }

  let totalCostUsd = 0;
  let platformRuns = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const row of logs ?? []) {
    const usage = (row as any)?.imported_data?.usage;
    if (!usage || !usage.platform_paid) continue;
    platformRuns += 1;
    totalCostUsd += Number(usage.cost_usd) || 0;
    totalInputTokens += Number(usage.input_tokens) || 0;
    totalOutputTokens += Number(usage.output_tokens) || 0;
  }

  const percentOfBudget = (totalCostUsd / budget) * 100;
  const overThreshold = percentOfBudget >= thresholdPct;

  // Suppress the email if we already emailed within COOLDOWN_DAYS.
  const cooldownSince = new Date(
    Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: recentAlerts } = await supabase
    .from('wb_import_logs')
    .select('id')
    .eq('source', 'alert:budget')
    .gte('created_at', cooldownSince)
    .limit(1);

  const alreadyAlerted = (recentAlerts?.length ?? 0) > 0;

  let emailSent = false;
  let emailError: string | null = null;

  if (overThreshold && !alreadyAlerted) {
    const subject = `[Watamu Bookings] OpenAI credits at ${percentOfBudget.toFixed(0)}% of monthly budget`;
    const html = `
      <p>Heads up — the OpenAI platform key that powers free "paste any URL"
      imports has consumed <strong>${percentOfBudget.toFixed(1)}%</strong>
      of its configured monthly budget.</p>
      <table cellpadding="6" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;margin:16px 0;">
        <tr><td style="color:#666">Trailing 30-day spend</td>
            <td><strong>$${totalCostUsd.toFixed(2)}</strong></td></tr>
        <tr><td style="color:#666">Monthly budget</td>
            <td>$${budget.toFixed(2)}</td></tr>
        <tr><td style="color:#666">% consumed</td>
            <td>${percentOfBudget.toFixed(1)}%</td></tr>
        <tr><td style="color:#666">Platform-paid imports</td>
            <td>${platformRuns}</td></tr>
        <tr><td style="color:#666">Input tokens</td>
            <td>${totalInputTokens.toLocaleString()}</td></tr>
        <tr><td style="color:#666">Output tokens</td>
            <td>${totalOutputTokens.toLocaleString()}</td></tr>
      </table>
      <p>Top up your OpenAI balance at
      <a href="https://platform.openai.com/settings/organization/billing">platform.openai.com/settings/organization/billing</a>,
      or raise the monthly cap via the <code>WATAMU_AI_MONTHLY_BUDGET_USD</code>
      env var on Vercel.</p>
      <p style="color:#999;font-size:12px">You will not receive another budget
      alert for ${COOLDOWN_DAYS} days.</p>
    `;

    emailError = await sendViaZeptoMail({ to: alertEmail, subject, html });
    if (!emailError) {
      emailSent = true;
      // Persist the "sent" marker so we don't re-alert for COOLDOWN_DAYS.
      await supabase.from('wb_import_logs').insert({
        owner_id: null,
        source: 'alert:budget',
        source_url: null,
        listing_type: 'property', // unused here; column is NOT NULL in some deploys
        status: 'completed',
        imported_data: {
          total_cost_usd: totalCostUsd,
          budget_usd: budget,
          percent_of_budget: percentOfBudget,
          threshold_pct: thresholdPct,
          platform_runs: platformRuns,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          sent_to: alertEmail,
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    budget_usd: budget,
    total_cost_usd: Number(totalCostUsd.toFixed(4)),
    percent_of_budget: Number(percentOfBudget.toFixed(2)),
    threshold_pct: thresholdPct,
    platform_runs: platformRuns,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    over_threshold: overThreshold,
    already_alerted_this_week: alreadyAlerted,
    email_sent: emailSent,
    email_error: emailError,
  });
}

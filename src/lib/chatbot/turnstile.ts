/**
 * Cloudflare Turnstile verification for the site chatbot.
 *
 * Challenge-once-per-session pattern: the client completes a Turnstile
 * challenge, sends the token with the first message, the server verifies
 * it, and we set a signed cookie that's trusted for 24 hours. Subsequent
 * messages in the same browser session skip the challenge entirely.
 *
 * Fail-soft in dev: if TURNSTILE_SECRET_KEY is unset, verification is
 * skipped so local development doesn't need Cloudflare credentials.
 */

import crypto from 'crypto';

export const CHAT_VERIFY_COOKIE = 'kwetu_chat_verify';
const COOKIE_TTL_SECONDS = 24 * 60 * 60;

/** Returns the HMAC secret. Falls back to a derived secret in dev so things
 *  still work without explicit configuration; you MUST set one in prod. */
function getSigningSecret(): string {
  const explicit = process.env.CHAT_SIGN_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  // Fallback: derive from the service role key so every deployment that has
  // Supabase configured automatically has a stable chatbot signing secret.
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (srk && srk.length >= 32) return `kwetu-chat:${srk.slice(0, 32)}`;
  // Last resort (dev only).
  return 'kwetu-chat-dev-secret';
}

interface VerifyPayload {
  ts: number;
}

/** Produce a signed cookie value (body.sig). */
export function signVerifyCookie(): string {
  const payload: VerifyPayload = { ts: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

/** Validate a signed cookie — returns true if it parses, matches signature,
 *  and hasn't expired. */
export function validateVerifyCookie(cookie: string | undefined | null): boolean {
  if (!cookie) return false;
  const parts = cookie.split('.');
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', getSigningSecret())
    .update(body!)
    .digest('base64url');
  // Use timingSafeEqual to avoid leaking info via comparison time.
  try {
    const a = Buffer.from(sig!);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    if (!crypto.timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(body!, 'base64url').toString()) as VerifyPayload;
    if (typeof payload.ts !== 'number') return false;
    if (Date.now() - payload.ts > COOKIE_TTL_SECONDS * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

export const VERIFY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: COOKIE_TTL_SECONDS,
};

/**
 * Verify a Turnstile client token against Cloudflare's siteverify endpoint.
 * Returns true on success. In dev (no secret configured) returns true
 * without calling Cloudflare.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp: string | undefined,
): Promise<boolean> {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    // Dev mode — Turnstile not configured.
    return true;
  }
  if (!token) return false;
  const form = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (remoteIp) form.set('remoteip', remoteIp);
  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        // Small timeout — Cloudflare should answer fast; we'd rather reject
        // than hang the whole request.
        signal: AbortSignal.timeout(4000),
      },
    );
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: unknown };
    return Boolean(data.success);
  } catch (err) {
    console.error('[turnstile] siteverify failed', err);
    return false;
  }
}

/** True when Turnstile is configured for this environment. */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

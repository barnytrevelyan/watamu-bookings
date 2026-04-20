import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/import/ai
 *
 * "Paste any URL" importer. The host supplies their own website URL and their
 * own Anthropic / OpenAI API key; we fetch the page server-side, hand the
 * cleaned HTML to an LLM with a strict-JSON schema, and return a pre-filled
 * property / boat object for review.
 *
 * Client-supplied key so we don't carry token costs, and so hosts can use the
 * account they already have. Keys are used once per request and never stored.
 *
 * Body: { url: string; apiKey: string; provider?: 'anthropic' | 'openai'; kind?: 'property' | 'boat' }
 * Returns: { data: Imported{Property|Boat} } or { error: string }
 */

type Provider = 'anthropic' | 'openai';
type ListingKind = 'property' | 'boat';

const MAX_HTML_BYTES = 750_000; // ~750KB cap before handing to LLM
const LLM_TIMEOUT_MS = 45_000;

/**
 * SSRF guard — block private / link-local / loopback ranges even though hosts
 * can paste any public URL. We resolve the hostname client-side via URL parsing
 * only and reject obviously private destinations; the fetch itself is subject
 * to the runtime's network policy.
 */
function isSafeExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (!host) return false;
    // Block localhost + loopback / metadata endpoints by literal match.
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    // Block common private IPv4 ranges by literal-prefix match.
    if (
      /^10\./.test(host) ||
      /^127\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Quick-and-dirty HTML → text. Good enough for an LLM to read the content. */
function htmlToText(html: string): string {
  return html
    // drop scripts and styles
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    // keep alt text so the LLM can see image descriptions
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, ' [image: $1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract image URLs from the raw HTML. */
function extractImageUrls(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const base = new URL(baseUrl);

  function push(raw: string) {
    try {
      const resolved = new URL(raw, base).toString();
      if (!out.includes(resolved) && out.length < 20) out.push(resolved);
    } catch {
      /* noop */
    }
  }

  // Open Graph image
  const og = html.match(/property="og:image(?::url)?"\s+content="([^"]+)"/i);
  if (og) push(og[1]);

  // Common <img src="...">
  const imgMatches = html.matchAll(/<img[^>]+src="([^"]+)"/gi);
  for (const m of imgMatches) push(m[1]);

  // Filter out tiny tracking pixels, svg logos, favicon/etc.
  return out.filter(
    (u) => !/\.(svg|ico)(\?|$)/i.test(u) && !/pixel|analytics|tracking/i.test(u)
  );
}

const PROPERTY_SCHEMA = `{
  "name": "string — title of the property (required)",
  "description": "string — 2-5 sentence description",
  "property_type": "villa | apartment | cottage | house | hotel | banda | bungalow | studio | penthouse | beach_house",
  "address": "string — street address if available, else empty",
  "city": "string — city / town name",
  "latitude": "number or null",
  "longitude": "number or null",
  "price_per_night": "number or null — nightly rate (main currency)",
  "currency": "string — ISO 4217 code, default KES",
  "max_guests": "number or null",
  "bedrooms": "number or null",
  "bathrooms": "number or null",
  "amenities": "string[] — short names like 'WiFi', 'Pool'",
  "rating": "number or null — 0-5",
  "review_count": "number or null"
}`;

const BOAT_SCHEMA = `{
  "name": "string — boat / charter name (required)",
  "description": "string — 2-5 sentence description",
  "boat_type": "sport_fisher | dhow | catamaran | speedboat | sailing_yacht | fishing_boat",
  "length_ft": "number or null",
  "capacity": "number or null — total passengers",
  "crew_size": "number or null",
  "captain_name": "string or null",
  "captain_bio": "string or null",
  "target_species": "string[] — e.g. ['marlin','sailfish']",
  "fishing_techniques": "string[] — e.g. ['trolling','popping']",
  "trips": "Array<{ name: string, trip_type: 'half_day' | 'full_day' | 'multi_day', duration_hours: number, price_total: number, price_per_person: number | null, departure_time: string | null, includes: string[], target_species: string[] }>",
  "rating": "number or null — 0-5",
  "review_count": "number or null"
}`;

function buildPrompt(kind: ListingKind, pageText: string, url: string): string {
  const schema = kind === 'boat' ? BOAT_SCHEMA : PROPERTY_SCHEMA;
  return `You are extracting structured listing data from a web page for a Kenyan
vacation-rental / charter marketplace called Watamu Bookings.

The host has pasted their own ${kind === 'boat' ? 'boat charter' : 'property'} page:
${url}

Below is the page text content. Read it carefully and return a SINGLE JSON
object that matches this schema — no prose, no code fences, just JSON:

${schema}

Rules:
- If a field is not clearly stated, use null for numbers or "" for strings,
  and [] for arrays. Do not guess.
- Currency: if you see prices in KES / Ksh / KSh / Kenya shilling, use "KES".
  USD is "USD". EUR is "EUR". If unclear, default "KES".
- Price should be per night (properties) or total trip price (boats).
- Keep the description faithful to the source, 2-5 sentences max.

Page content:
${pageText.slice(0, 80_000)}
`;
}

async function callAnthropic(
  apiKey: string,
  prompt: string
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `Anthropic request failed (${resp.status}). ${body.slice(0, 200)}`
      );
    }
    const json: any = await resp.json();
    const text = json?.content?.[0]?.text;
    if (!text) throw new Error('Anthropic returned an empty response');
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract structured listing data from web pages and return ONLY JSON.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `OpenAI request failed (${resp.status}). ${body.slice(0, 200)}`
      );
    }
    const json: any = await resp.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI returned an empty response');
    return text;
  } finally {
    clearTimeout(t);
  }
}

/** Accept LLM output that may be wrapped in ```json fences or have preamble. */
function parseJsonLoose(raw: string): any {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('LLM did not return JSON');
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Use getSession() rather than getUser(): we've hit repeated issues
    // where getUser()'s network call + silent refresh-cookie-write races
    // against the route handler's cookie lifecycle in Vercel and returns
    // a spurious "Auth session missing!" error. Cookies are httpOnly +
    // secure + signed, and every write below is still scoped by owner_id
    // (Supabase RLS enforces it regardless of what we pass), so this is
    // a safe trade-off for this endpoint.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json(
        {
          error:
            'Your session has expired. Please sign out, sign back in, and try again.',
        },
        { status: 401 }
      );
    }
    const user = session.user;

    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const clientApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const clientProvider: Provider | null =
      body.provider === 'openai'
        ? 'openai'
        : body.provider === 'anthropic'
          ? 'anthropic'
          : null;
    const kind: ListingKind = body.kind === 'boat' ? 'boat' : 'property';

    if (!url || !isSafeExternalUrl(url)) {
      return NextResponse.json(
        { error: 'Please provide a valid public https URL.' },
        { status: 400 }
      );
    }

    // Resolve the credentials: prefer the client-supplied key if present
    // (so power-users can bring their own), otherwise fall back to the
    // platform-provided key in env. WATAMU_AI_PROVIDER defaults to 'openai'
    // (gpt-4o-mini is ~$0.0002 per import — the cheapest reliable option).
    const serverApiKey = process.env.WATAMU_AI_API_KEY?.trim() || '';
    const serverProvider: Provider =
      process.env.WATAMU_AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';

    const apiKey = clientApiKey || serverApiKey;
    const provider: Provider = clientApiKey
      ? clientProvider ?? 'anthropic'
      : serverProvider;
    const usingPlatformKey = !clientApiKey && !!serverApiKey;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'AI import is not configured. Ask the site admin to set WATAMU_AI_API_KEY, or paste your own Anthropic / OpenAI key.',
        },
        { status: 400 }
      );
    }

    // Light rate-limit when using the platform key so a rogue account can't
    // spam the shared budget: cap at 15 platform-paid imports per user per
    // 24h. Users who bring their own key are unrestricted.
    if (usingPlatformKey) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('wb_import_logs')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .ilike('source', 'ai:%:platform')
        .gte('created_at', since);
      if ((count ?? 0) >= 15) {
        return NextResponse.json(
          {
            error:
              'You have hit the daily limit for free AI imports (15/day). Try again tomorrow, or paste your own Anthropic / OpenAI key.',
          },
          { status: 429 }
        );
      }
    }

    // 1. Fetch the page
    const fetchCtrl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtrl.abort(), 15_000);
    let html = '';
    try {
      const resp = await fetch(url, {
        signal: fetchCtrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WatamuBookingsImport/1.0',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!resp.ok) {
        return NextResponse.json(
          { error: `That page returned ${resp.status}. Check the URL and try again.` },
          { status: 400 }
        );
      }
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > MAX_HTML_BYTES) {
        html = new TextDecoder().decode(buf.slice(0, MAX_HTML_BYTES));
      } else {
        html = new TextDecoder().decode(buf);
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: `Could not fetch that URL: ${e?.message || 'unknown error'}` },
        { status: 400 }
      );
    } finally {
      clearTimeout(fetchTimer);
    }

    const pageText = htmlToText(html);
    const imageCandidates = extractImageUrls(html, url);

    // 2. Ask the LLM for structured JSON
    const prompt = buildPrompt(kind, pageText, url);
    let rawLlm = '';
    try {
      rawLlm =
        provider === 'openai'
          ? await callOpenAI(apiKey, prompt)
          : await callAnthropic(apiKey, prompt);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || `LLM request to ${provider} failed` },
        { status: 502 }
      );
    }

    let parsed: any;
    try {
      parsed = parseJsonLoose(rawLlm);
    } catch (e: any) {
      return NextResponse.json(
        {
          error:
            'Could not parse the LLM response as JSON. Try another URL or switch AI provider.',
        },
        { status: 502 }
      );
    }

    // 3. Coerce into the existing importer payload shape and attach images.
    const data: any = {
      ...parsed,
      images: imageCandidates,
      source_url: url,
      source: 'ai',
    };
    if (kind === 'property') {
      data.property_type = data.property_type || 'house';
      data.city = data.city || 'Watamu';
      data.currency = data.currency || 'KES';
    } else {
      data.boat_type = data.boat_type || 'sport_fisher';
      data.trips = Array.isArray(data.trips) ? data.trips : [];
      data.target_species = Array.isArray(data.target_species)
        ? data.target_species
        : [];
      data.fishing_techniques = Array.isArray(data.fishing_techniques)
        ? data.fishing_techniques
        : [];
    }

    // Log the import attempt — we never persist the API key.
    // Tag platform-paid runs separately so we can track cost later.
    await supabase.from('wb_import_logs').insert({
      owner_id: user.id,
      source: `ai:${provider}${usingPlatformKey ? ':platform' : ''}`,
      source_url: url,
      listing_type: kind,
      status: 'completed',
      imported_data: data as any,
    });

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Import failed' },
      { status: 500 }
    );
  }
}

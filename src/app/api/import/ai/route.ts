import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { resolveImportUser } from '@/lib/import-auth';

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
type ListingKind = 'property' | 'boat' | 'mixed';

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

/**
 * Extract any obvious video URLs embedded in the page so the LLM can preserve
 * them. `htmlToText` strips tags, so without this the LLM never sees the
 * iframe src. We look at <iframe>, <video>, <source>, and plain anchor hrefs.
 */
function extractVideoUrls(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out: string[] = [];

  function push(raw: string) {
    if (!raw) return;
    try {
      const resolved = new URL(raw, base).toString();
      const host = new URL(resolved).hostname.toLowerCase();
      const isYouTube =
        /(^|\.)youtube(-nocookie)?\.com$|(^|\.)youtu\.be$/.test(host);
      const isVimeo = /(^|\.)vimeo\.com$|(^|\.)player\.vimeo\.com$/.test(host);
      const isFile = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(resolved);
      if (!isYouTube && !isVimeo && !isFile) return;
      if (!out.includes(resolved) && out.length < 5) out.push(resolved);
    } catch {
      /* noop */
    }
  }

  for (const m of html.matchAll(/<iframe[^>]+src="([^"]+)"/gi)) push(m[1]);
  for (const m of html.matchAll(/<video[^>]+src="([^"]+)"/gi)) push(m[1]);
  for (const m of html.matchAll(/<source[^>]+src="([^"]+)"/gi)) push(m[1]);
  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"/gi)) push(m[1]);

  return out;
}

/**
 * Scan the homepage HTML for links that look like individual property / charter
 * detail pages (e.g. /villas/sunset, /deep-sea-charter, /boats/blue-marlin).
 * Filter out the usual navigation chrome (about, contact, blog, etc.) and
 * external domains, then rank the remaining URLs by how listing-like they look.
 *
 * Returns up to 8 internal URLs, sorted from most-likely to least.
 *
 * We intentionally cast a wide net — a property-only site may still have a
 * /boats or /fishing page for a related charter, and a charter site may host
 * on-land accommodation. The LLM decides per-page what it's looking at.
 */
function extractDetailLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/$/, '') || '/';

  // Property-side keywords.
  const propertyKeywords =
    /villa|propert|house|stay|listing|accommod|room|apartment|bungalow|cottage|cabin|penthouse|banda|beach[ -]?house|suite|rental|lodge|retreat|hideaway|guesthouse/i;
  // Boat / charter / experience keywords — critical for mixed-use sites like
  // fishing lodges that also run charters, or villa websites with "dhow sunset
  // sails" pages.
  const boatKeywords =
    /boat|charter|fish(ing)?|deep[ -]?sea|creek|reef|trolling|marlin|sailfish|dhow|catamaran|yacht|sail(ing)?|cruise|dive|diving|snorkel|excursion|safari|tour|trip|experienc|adventur|expedition|day[ -]?out/i;
  const rejectPath =
    /\/(about|contact|blog|news|privacy|terms|faq|legal|login|sign[ -]?in|sign[ -]?up|register|auth|book(ing)?|checkout|cart|rss|sitemap|feed|tag|category|author|search|pricing|rates|gallery|reviews?|testimonials?|press|media|careers?|jobs|our[- ]story|partners?|affiliate)(\/|$|#|\?)/i;
  const rejectFile =
    /\.(pdf|jpe?g|png|gif|webp|svg|ico|mp4|mov|avi|mp3|zip|css|js|xml|txt|json)(\?|$)/i;

  const candidates = new Map<string, number>(); // normalized URL -> best score

  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const rawHref = m[1];
    const linkText = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let resolved: URL;
    try {
      resolved = new URL(rawHref, base);
    } catch {
      continue;
    }

    if (resolved.hostname !== base.hostname) continue;
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') continue;
    if (rejectFile.test(resolved.pathname)) continue;
    if (rejectPath.test(resolved.pathname)) continue;

    const normalizedPath = resolved.pathname.replace(/\/$/, '') || '/';
    if (normalizedPath === basePath) continue; // skip the page we started on
    const normalized = `${resolved.origin}${normalizedPath}`;

    let score = 0;
    if (propertyKeywords.test(resolved.pathname)) score += 3;
    if (propertyKeywords.test(linkText)) score += 2;
    if (boatKeywords.test(resolved.pathname)) score += 3;
    if (boatKeywords.test(linkText)) score += 2;

    // Detail pages are usually at depth 1+ from the site root. A pure top-level
    // nav link (e.g. /accommodation, /charters) is still a likely hub page, so
    // any depth ≥ 1 gets credit; deeper pages get a small additional bonus.
    const depth = normalizedPath.split('/').filter(Boolean).length;
    if (depth >= 1) score += 1;
    if (depth >= 3) score += 1;

    // Penalise obviously generic "home", "index", "/all", "/list" landing pages.
    if (/\/(home|index|all|list)(\/|$)/i.test(normalizedPath)) score -= 2;

    if (score <= 0) continue;

    const prev = candidates.get(normalized) ?? -Infinity;
    if (score > prev) candidates.set(normalized, score);
  }

  return Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([url]) => url);
}

/** Fetch a single page with a 15s timeout and return cleaned text + images. */
async function fetchPage(url: string): Promise<{
  html: string;
  text: string;
  images: string[];
  videos: string[];
} | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WatamuBookingsImport/1.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const html =
      buf.byteLength > MAX_HTML_BYTES
        ? new TextDecoder().decode(buf.slice(0, MAX_HTML_BYTES))
        : new TextDecoder().decode(buf);
    return {
      html,
      text: htmlToText(html),
      images: extractImageUrls(html, url),
      videos: extractVideoUrls(html, url),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const PROPERTY_FIELDS = `{
  "kind": "property",
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
  "video_url": "string or null — first YouTube, Vimeo, or direct MP4 URL shown on the page (look in <iframe src>, <video src>, <source src>, or prominent links). Return null if none is present — do not guess.",
  "rating": "number or null — 0-5",
  "review_count": "number or null"
}`;

const BOAT_FIELDS = `{
  "kind": "boat",
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
  "video_url": "string or null — first YouTube, Vimeo, or direct MP4 URL shown on the page (look in <iframe src>, <video src>, <source src>, or prominent links). Return null if none is present — do not guess.",
  "rating": "number or null — 0-5",
  "review_count": "number or null"
}`;

function buildPrompt(
  kind: ListingKind,
  pageText: string,
  url: string,
  videoUrls: string[] = []
): string {
  // Hint to the LLM about what the host thinks is on this site. 'mixed' lets
  // the model decide per-listing — required for sites like UnReel that have
  // cottages AND fishing boats on the same domain.
  const focusHint =
    kind === 'property'
      ? 'The host says this site is mostly about properties / stays. Bias toward property listings, but if you see a boat charter on the page too, still return it.'
      : kind === 'boat'
        ? 'The host says this site is mostly about boat charters. Bias toward boat listings, but if you see an accommodation on the page too, still return it.'
        : 'The site may contain properties, boat charters, or both. Detect what each listing is.';

  return `You are extracting structured listing data from a web page for a Kenyan
vacation-rental / charter marketplace called Watamu Bookings.

${focusHint}

Page URL: ${url}

A single page may describe ONE listing (a single villa) OR MULTIPLE listings
(e.g. an accommodation page that shows two side-by-side cottages with
separate names and room counts, or a charters page listing a deep-sea boat
and a creek boat). You MUST return every distinct listing as its own element
in the "listings" array. Never merge two named units (e.g. "Utulivu" and
"Urumwe") into one entry.

Return ONLY valid JSON — no prose, no code fences — matching this shape:

{
  "listings": [
    // zero or more items; each item is EITHER this property shape:
    ${PROPERTY_FIELDS}
    // OR this boat shape:
    ${BOAT_FIELDS}
  ]
}

Rules:
- Use "kind": "property" for villas, cottages, rooms, apartments, houses,
  hotels, bandas, bungalows, lodges, retreats — anywhere a guest sleeps.
- Use "kind": "boat" for fishing charters, dhow cruises, catamarans,
  snorkel / dive boats, sunset cruises — anything with a captain.
- If a page is a site-wide landing page with only teaser cards that link off
  to detail pages, return an empty listings array — do NOT invent details.
- If a field is not clearly stated, use null for numbers, "" for strings, and
  [] for arrays. Do not guess. Do not hallucinate amenities or target species.
- Currency: if you see prices in KES / Ksh / KSh / Kenya shilling, use "KES".
  USD = "USD". EUR = "EUR". If unclear, default "KES".
- Price: per-night for properties; total trip price for boats.
- Keep descriptions faithful to the source, 2-5 sentences each.
${
  videoUrls.length > 0
    ? `
Videos detected on this page (pass the most listing-relevant one back as
"video_url"; leave null if none are specifically about the listing):
${videoUrls.slice(0, 5).map((v) => `  - ${v}`).join('\n')}
`
    : ''
}
Page content:
${pageText.slice(0, 80_000)}
`;
}

/** Return shape from an LLM call. The `usage` fields feed our spend tracker
 *  so we can alert when the platform key is getting close to its monthly
 *  budget (see /api/cron/check-ai-budget). */
interface LlmResponse {
  text: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
  provider: Provider;
}

// Haiku 4.5 public pricing as of April 2026: $1/MTok in, $5/MTok out.
// gpt-4o-mini: $0.15/MTok in, $0.60/MTok out. Keep these in sync with the
// pricing page when models are swapped — the budget alert uses them to
// estimate spend.
const PRICING_USD_PER_MTOK: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
};

function estimateCostUsd(
  model: string,
  input_tokens: number,
  output_tokens: number
): number {
  const p = PRICING_USD_PER_MTOK[model];
  if (!p) return 0;
  return (input_tokens / 1_000_000) * p.in + (output_tokens / 1_000_000) * p.out;
}

async function callAnthropic(
  apiKey: string,
  prompt: string
): Promise<LlmResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const model = 'claude-haiku-4-5-20251001';
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
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
    return {
      text,
      input_tokens: json?.usage?.input_tokens ?? 0,
      output_tokens: json?.usage?.output_tokens ?? 0,
      model,
      provider: 'anthropic',
    };
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAI(apiKey: string, prompt: string): Promise<LlmResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const model = 'gpt-4o-mini';
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
    return {
      text,
      input_tokens: json?.usage?.prompt_tokens ?? 0,
      output_tokens: json?.usage?.completion_tokens ?? 0,
      model,
      provider: 'openai',
    };
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
    // Resolve the caller. See lib/import-auth.ts for the cookie decoding
    // fallback we rely on when @supabase/ssr 0.3 can't decode chunked /
    // base64-prefixed auth cookies in the route-handler cookie lifecycle.
    const auth = await resolveImportUser(request);
    if (!auth.ok) return auth.response;
    const { user, authPath } = auth.result;
    console.log('[import/ai] auth ok via', authPath);

    const supabase = await createServerClient();

    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const clientApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const clientProvider: Provider | null =
      body.provider === 'openai'
        ? 'openai'
        : body.provider === 'anthropic'
          ? 'anthropic'
          : null;
    const kind: ListingKind =
      body.kind === 'boat'
        ? 'boat'
        : body.kind === 'mixed'
          ? 'mixed'
          : 'property';

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

    // 1. Fetch the entry page (usually the homepage).
    const home = await fetchPage(url);
    if (!home) {
      return NextResponse.json(
        { error: 'Could not fetch that URL. Check the link and try again.' },
        { status: 400 }
      );
    }

    // 2. Detect property-detail links on the entry page and fetch up to 4 of
    //    them in parallel. Multi-property sites (e.g. a single agency hosting
    //    several villas) surface one listing per detail page; single-property
    //    sites usually have no such links, in which case we just process the
    //    entry page itself.
    const detailUrls = extractDetailLinks(home.html, url);
    const detailPages = await Promise.all(detailUrls.map((u) => fetchPage(u)));

    type PageSource = {
      url: string;
      text: string;
      images: string[];
      videos: string[];
    };
    const sources: PageSource[] = [];
    for (let i = 0; i < detailPages.length; i++) {
      const p = detailPages[i];
      if (p)
        sources.push({
          url: detailUrls[i],
          text: p.text,
          images: p.images,
          videos: p.videos,
        });
    }

    // If no per-listing pages were found, treat the entry page itself as the
    // (likely single) listing so we still return something useful.
    if (sources.length === 0) {
      sources.push({
        url,
        text: home.text,
        images: home.images,
        videos: home.videos,
      });
    }

    // 3. Run the LLM in parallel on each page. Each page may yield 0, 1, or
    //    many listings (a single /accommodation page can describe two
    //    side-by-side cottages). A failure on one page shouldn't sink the
    //    whole import — we filter out nulls below.
    const llmResults = await Promise.allSettled(
      sources.map(async (s) => {
        const prompt = buildPrompt(kind, s.text, s.url, s.videos);
        const resp =
          provider === 'openai'
            ? await callOpenAI(apiKey, prompt)
            : await callAnthropic(apiKey, prompt);
        return { ...resp, parsed: parseJsonLoose(resp.text) };
      })
    );

    // Aggregate token usage across all LLM calls. When this request used the
    // platform key the spend feeds the "AI credits running low" email alert
    // (see /api/cron/check-ai-budget).
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let modelUsed = '';
    for (const r of llmResults) {
      if (r.status === 'fulfilled') {
        totalInputTokens += r.value.input_tokens || 0;
        totalOutputTokens += r.value.output_tokens || 0;
        modelUsed = r.value.model;
      }
    }
    const costUsd = estimateCostUsd(modelUsed, totalInputTokens, totalOutputTokens);

    // 4. Flatten every page's listings[] into one array, coerce defaults, and
    //    dedupe by "{kind}:{name}" so a nav-linked page that accidentally
    //    restates a listing from the homepage doesn't show up twice.
    const listings: any[] = [];
    const seenKeys = new Set<string>();
    for (let i = 0; i < llmResults.length; i++) {
      const r = llmResults[i];
      if (r.status !== 'fulfilled' || !r.value) continue;

      const parsed = r.value.parsed;
      const s = sources[i];

      // Accept both shapes: new { listings: [...] } and legacy single-object
      // (in case the LLM drifts). Tolerate older responses so we never 500.
      const raw: any[] = Array.isArray(parsed?.listings)
        ? parsed.listings
        : parsed && typeof parsed === 'object' && parsed.name
          ? [parsed]
          : [];

      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;

        const rawName = typeof item.name === 'string' ? item.name.trim() : '';
        if (!rawName) continue;
        if (/^(404|not found|page not found|access denied)$/i.test(rawName)) continue;

        // Resolve per-listing kind. The LLM sometimes omits the kind field;
        // fall back to the host's hint, or to 'boat' if obvious boat fields
        // are present.
        const explicitKind =
          item.kind === 'boat' ? 'boat' : item.kind === 'property' ? 'property' : null;
        const hasBoatShape =
          item.boat_type || (Array.isArray(item.trips) && item.trips.length > 0);
        const hasPropertyShape =
          item.property_type || item.bedrooms != null || item.max_guests != null;
        const resolvedKind: 'property' | 'boat' =
          explicitKind ??
          (hasBoatShape
            ? 'boat'
            : hasPropertyShape
              ? 'property'
              : kind === 'boat'
                ? 'boat'
                : 'property');

        const key = `${resolvedKind}:${rawName.toLowerCase()}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        // If the LLM didn't return a video URL but we scraped one off the page,
        // fall back to the first detected video so we don't silently lose it.
        const rawVideo = typeof item.video_url === 'string' ? item.video_url.trim() : '';
        const videoUrl = rawVideo || (s.videos?.[0] ?? null);

        const data: any = {
          ...item,
          kind: resolvedKind,
          name: rawName,
          images: s.images,
          video_url: videoUrl || null,
          source_url: s.url,
          source: 'ai',
        };
        if (resolvedKind === 'property') {
          data.property_type = data.property_type || 'house';
          data.city = data.city || 'Watamu';
          data.currency = data.currency || 'KES';
        } else {
          data.boat_type = data.boat_type || 'sport_fisher';
          data.trips = Array.isArray(data.trips) ? data.trips : [];
          data.target_species = Array.isArray(data.target_species) ? data.target_species : [];
          data.fishing_techniques = Array.isArray(data.fishing_techniques)
            ? data.fishing_techniques
            : [];
        }
        listings.push(data);
      }
    }

    if (listings.length === 0) {
      return NextResponse.json(
        {
          error:
            'AI could not extract any listings from that URL. Try a more specific page, or switch AI provider.',
        },
        { status: 502 }
      );
    }

    // Log the import attempt — we never persist the API key.
    // Tag platform-paid runs separately so we can track cost later.
    // `usage` is what the budget alert cron sums across recent logs.
    await supabase.from('wb_import_logs').insert({
      owner_id: user.id,
      source: `ai:${provider}${usingPlatformKey ? ':platform' : ''}`,
      source_url: url,
      listing_type: kind === 'mixed' ? 'mixed' : kind,
      status: 'completed',
      imported_data: {
        listings,
        crawled_pages: sources.length,
        usage: {
          provider,
          model: modelUsed,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          cost_usd: costUsd,
          platform_paid: usingPlatformKey,
        },
      } as any,
    });

    // New multi-listing response shape. The preview UI lets the host approve,
    // edit, or exclude each listing (and each image) before save.
    return NextResponse.json({ data: { listings } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Import failed' },
      { status: 500 }
    );
  }
}

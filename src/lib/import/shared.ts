/**
 * Shared helpers for the AI import pipeline — SSRF-safe URL handling,
 * HTML fetcher with manual redirect walk, and HTML → structured brief.
 *
 * Used by:
 *   - /api/import/generic — single-URL extraction
 *   - /api/import/discover — multi-listing discovery across a site
 */

const PRIVATE_IP_RANGES: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^224\./, /^225\./, /^226\./, /^227\./, /^228\./, /^229\./,
  /^230\./, /^231\./, /^232\./, /^233\./, /^234\./, /^235\./,
  /^236\./, /^237\./, /^238\./, /^239\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
];

export function isPrivateOrBlockedIp(host: string): boolean {
  if (host === '::1' || host === '[::1]') return true;
  if (/^\[?(fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
  if (/^\[?fe80:/i.test(host)) return true;
  if (/^\[?::ffff:/i.test(host)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return PRIVATE_IP_RANGES.some((re) => re.test(host));
  }
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(host)) return true;
  return false;
}

export function sanitiseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    if (isPrivateOrBlockedIp(u.hostname)) return null;
    u.username = '';
    u.password = '';
    return u;
  } catch {
    return null;
  }
}

export async function fetchSafe(
  rawUrl: string,
  opts: { timeoutMs?: number } = {}
): Promise<{ html: string; finalUrl: string }> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let current = sanitiseUrl(rawUrl);
  if (!current) throw new Error('URL rejected (must be https and a public host)');

  for (let hop = 0; hop < 5; hop++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } finally {
      clearTimeout(t);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect without Location header from ${current.toString()}`);
      const next = sanitiseUrl(new URL(loc, current).toString());
      if (!next) throw new Error('Redirect to a disallowed host');
      current = next;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch page: ${res.status}`);
    }

    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(ct)) {
      throw new Error(`Page returned ${ct || 'unknown content type'} — not an HTML listing page`);
    }

    const html = await res.text();
    return { html, finalUrl: current.toString() };
  }

  throw new Error('Too many redirects');
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

export function buildPageBrief(
  html: string,
  finalUrl: string
): { brief: string; images: string[] } {
  const denuded = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';

  const metaLines: string[] = [];
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    if (/(property|name)="(og:|twitter:|description$|keywords$|author$|geo|article:|og\.)/.test(tag)) {
      metaLines.push(decodeEntities(tag).slice(0, 400));
    }
  }

  const imageSet = new Set<string>();
  const pushImage = (raw: string | undefined | null) => {
    if (!raw) return;
    let u = raw.trim().replace(/&amp;/g, '&');
    if (u.startsWith('//')) u = 'https:' + u;
    try {
      const abs = new URL(u, finalUrl).toString();
      if (!/^https:\/\//.test(abs)) return;
      if (/\.(svg|ico)(\?|$)/i.test(abs)) return;
      if (/(sprite|icon|logo|favicon|avatar|spinner|tracking|beacon|pixel)/i.test(abs)) return;
      imageSet.add(abs);
    } catch {}
  };
  for (const m of html.matchAll(/property="og:image(?::url|:secure_url)?"\s+content="([^"]+)"/g)) pushImage(m[1]);
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) pushImage(m[1]);
  for (const m of html.matchAll(/<img[^>]+data-src="([^"]+)"/gi)) pushImage(m[1]);
  for (const m of html.matchAll(/<img[^>]+srcset="([^"]+)"/gi)) {
    const first = m[1].split(',')[0]?.trim().split(/\s+/)[0];
    pushImage(first);
  }
  const images = Array.from(imageSet).slice(0, 40);

  const jsonLdBlocks: string[] = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    jsonLdBlocks.push(m[1].trim().slice(0, 8_000));
    if (jsonLdBlocks.length >= 6) break;
  }

  const bodyText = decodeEntities(denuded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

  const parts: string[] = [];
  parts.push(`# URL\n${finalUrl}`);
  if (title) parts.push(`# TITLE\n${title}`);
  if (metaLines.length) parts.push(`# META\n${metaLines.slice(0, 40).join('\n')}`);
  if (jsonLdBlocks.length) parts.push(`# JSON-LD\n${jsonLdBlocks.join('\n---\n')}`);
  if (images.length) parts.push(`# IMAGES\n${images.slice(0, 40).join('\n')}`);
  parts.push(`# BODY TEXT (truncated)\n${bodyText.slice(0, 20_000)}`);

  return { brief: parts.join('\n\n').slice(0, 60_000), images };
}

/**
 * Extract the set of same-origin links from a page that plausibly point at
 * a specific bookable listing. Ranked by a small keyword heuristic so we can
 * pick the best handful to follow. Used by the multi-listing discovery flow.
 */
export function extractListingCandidateLinks(
  html: string,
  baseUrl: string,
  limit = 6
): { url: string; text: string; score: number }[] {
  const origin = (() => {
    try { return new URL(baseUrl).origin; } catch { return ''; }
  })();
  if (!origin) return [];

  const POSITIVE_WORDS = [
    'accommodation', 'accommodations', 'cottage', 'cottages', 'villa', 'villas',
    'apartment', 'apartments', 'suite', 'suites', 'rooms', 'room', 'lodge',
    'lodges', 'banda', 'bandas', 'house', 'houses',
    'boat', 'boats', 'charter', 'charters', 'yacht', 'yachts', 'fishing',
    'dhow', 'sailing', 'catamaran', 'trips', 'excursion', 'excursions',
    'stay', 'stays', 'book', 'booking',
  ];
  const NEGATIVE_WORDS = [
    'contact', 'about', 'blog', 'news', 'privacy', 'terms', 'faq',
    'gallery', 'media', 'press', 'careers', 'login', 'signup', 'sign-up',
    'cart', 'checkout', 'account', 'reviews',
  ];

  const seen = new Map<string, { url: string; text: string; score: number }>();

  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1];
    const inner = decodeEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 120);
    if (!href) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let abs: string;
    try { abs = new URL(href, baseUrl).toString(); } catch { continue; }
    const parsed = sanitiseUrl(abs);
    if (!parsed) continue;
    if (parsed.origin !== origin) continue;
    // Normalise: drop fragment + trailing slash for dedupe
    parsed.hash = '';
    const key = parsed.toString().replace(/\/+$/, '');
    const haystack = (parsed.pathname + ' ' + inner).toLowerCase();
    if (haystack === ' ' || haystack.length < 2) continue;

    // Score
    let score = 0;
    for (const w of POSITIVE_WORDS) {
      if (haystack.includes(w)) score += 2;
    }
    for (const w of NEGATIVE_WORDS) {
      if (haystack.includes(w)) score -= 3;
    }
    // Bonus for short clean paths (likely a top-level section)
    const depth = parsed.pathname.split('/').filter(Boolean).length;
    if (depth <= 2) score += 1;
    if (parsed.pathname === '/' || parsed.pathname === '') score -= 5;

    if (score <= 0) continue;

    const existing = seen.get(key);
    if (!existing || existing.score < score) {
      seen.set(key, { url: parsed.toString(), text: inner || parsed.pathname, score });
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

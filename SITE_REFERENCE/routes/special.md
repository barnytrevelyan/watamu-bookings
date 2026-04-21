# Special routes

## /error — global error boundary
- **File**: `src/app/error.tsx`
- Catches unhandled errors; shows "Try again" and homepage link; logs `error.digest`

## /not-found — 404
- **File**: `src/app/not-found.tsx`
- "Lost at sea" message + links to / and /properties

## /sitemap.xml — dynamic sitemap
- **File**: `src/app/sitemap.ts`
- Static routes + property/boat slugs (up to 500 each)
- Revalidate: 3600s
- Falls back gracefully if Supabase unreachable at build time

## /robots.txt — crawler rules
- **File**: `src/app/robots.ts`
- Allows public pages; disallows `/admin`, `/dashboard`, `/api`, `/auth`, `/booking`,
  `/invoice`
- Explicitly allows AI crawlers: GPTBot, PerplexityBot, ClaudeBot, OAI-SearchBot,
  anthropic-ai, Amazonbot
- Points to `/sitemap.xml`

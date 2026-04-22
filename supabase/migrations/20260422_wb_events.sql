-- 2026-04-22 — Guest-funnel analytics events (wb_events).
--
-- Captures lightweight behavioural events — a property view, a gallery
-- open, an availability check, a booking start, a booking confirmation
-- — so hosts can see why eyeballs aren't turning into reservations
-- without us having to shove a heavy third-party tag (GA / PostHog)
-- onto guest pages.
--
-- Shape notes
--   * `event_name` is free-form text but should stick to the small
--     vocabulary agreed in src/lib/analytics/events.ts (property_view,
--     gallery_open, availability_checked, booking_started,
--     booking_confirmed, …). We don't constrain it here because new
--     event types shouldn't need a migration.
--   * `session_id` is a client-generated anon id (uuid-ish) stored in
--     localStorage — lets us stitch pre-login views to post-login
--     bookings without tracking the person across devices.
--   * `payload` is JSONB for per-event context (search dates, gallery
--     image index, booking total, …). Keep it small.
--   * Inserts happen via /api/events which uses the service-role key
--     so we never trust the client to write arbitrary rows. Reads are
--     gated behind /api/analytics/* server routes that check host
--     ownership. Mirrors the wb_survey_responses lockdown pattern.
--
-- Retention: we don't prune here. Volume should be modest (a few
-- thousand rows per property per month). Revisit with a partitioning +
-- rollup pass if/when we ship outside Kwetu's invite-only cohort.

create table if not exists public.wb_events (
  id           uuid primary key default gen_random_uuid(),
  event_name   text not null,
  -- Optional actor. Null for anonymous guests. Matches auth.users(id).
  user_id      uuid references auth.users(id) on delete set null,
  -- Client-generated anon id, lets us stitch a session together across
  -- multiple rows. Not a uuid column because clients occasionally mint
  -- shorter ids; keep it text to stay lenient.
  session_id   text not null,
  -- Listing the event relates to. Exactly one of property_id / boat_id
  -- should be set for funnel events; both null is valid for page-level
  -- events (e.g. search_page_view).
  property_id  uuid references public.wb_properties(id) on delete cascade,
  boat_id      uuid references public.wb_boats(id) on delete cascade,
  -- Per-event context (search dates, gallery index, total, …).
  payload      jsonb not null default '{}'::jsonb,
  -- Page the event fired on + HTTP referrer if known. Useful for
  -- answering "where did this booking's traffic come from".
  path         text,
  referrer     text,
  created_at   timestamptz not null default now()
);

-- Per-property funnel queries always filter by property_id + time range,
-- so (property_id, created_at desc) is the hot index.
create index if not exists wb_events_property_created_idx
  on public.wb_events (property_id, created_at desc)
  where property_id is not null;

create index if not exists wb_events_boat_created_idx
  on public.wb_events (boat_id, created_at desc)
  where boat_id is not null;

-- Secondary index on session_id so we can resolve "did this session
-- ever reach booking_confirmed" cheaply when computing conversion.
create index if not exists wb_events_session_idx
  on public.wb_events (session_id, created_at);

create index if not exists wb_events_event_name_idx
  on public.wb_events (event_name, created_at desc);

-- Lock the table: RLS on, no public policies. Service-role bypasses RLS.
-- Anonymous guests never touch this table directly — /api/events writes
-- with the service-role key after validating the event shape server-side.
alter table public.wb_events enable row level security;

comment on table public.wb_events is
  'Guest-funnel analytics events. Inserts via /api/events (service-role). '
  'Reads via /api/analytics/* after host-ownership check.';

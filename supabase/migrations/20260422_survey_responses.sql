-- 2026-04-22 — Kwetu host + guest discovery surveys.
--
-- Captures structured answers from the questionnaires Lynda asked us to
-- circulate before we lock the MVP feature set. Both surveys share one
-- table because (a) we want a single inbox to read through, and (b) most
-- fields are free-form text / JSON so a narrow-purpose table per audience
-- would be noise. The `audience` column disambiguates.
--
-- `answers` stays a JSONB blob rather than columns-per-question so we
-- can iterate on the questionnaire without schema churn — Supabase
-- handles JSONB filtering well enough for the volumes we expect here
-- (dozens to hundreds of responses, not millions).
--
-- Intentionally NOT RLS-open: surveys are collected anonymously from
-- people who are not logged in, so inserts happen via the service-role
-- key from the server-side API route, and reads are admin-only via the
-- same path. Turning RLS on with no public policies keeps the table
-- unreadable from the anon key — which is what we want.

create table if not exists public.wb_survey_responses (
  id            uuid primary key default gen_random_uuid(),
  audience      text not null check (audience in ('host', 'guest')),
  -- Optional contact details — respondents can submit anonymously.
  contact_name  text,
  contact_email text,
  contact_phone text,
  -- Full answer payload keyed by question id. Shape is owned by the
  -- frontend form definition; see src/app/(survey)/survey/<audience>.
  answers       jsonb not null default '{}'::jsonb,
  -- Light metadata: language, UTM-style referrer, user agent. No IPs.
  meta          jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz not null default now()
);

create index if not exists wb_survey_responses_audience_idx
  on public.wb_survey_responses (audience, submitted_at desc);

create index if not exists wb_survey_responses_email_idx
  on public.wb_survey_responses (contact_email)
  where contact_email is not null;

-- Lock the table: no public access. Service-role bypasses RLS.
alter table public.wb_survey_responses enable row level security;

-- No policies on purpose — anon cannot read or write. API route uses
-- the service-role client.

comment on table public.wb_survey_responses is
  'Kwetu host + guest discovery questionnaires. Inserts via service-role only.';

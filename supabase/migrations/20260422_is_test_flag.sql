-- 2026-04-22 — Mark all current listings as test listings.
--
-- Adds `is_test boolean not null default false` to wb_properties and wb_boats,
-- then backfills true for every row that exists today (all current listings
-- are seed / demo data for Watamu). Public surface should filter
-- is_test = false so real launches start from a clean slate.
--
-- Future listings default to is_test = false (i.e. real). Admin UI can flip
-- the flag to re-hide a listing during demos.

-- Properties --------------------------------------------------------------

alter table public.wb_properties
  add column if not exists is_test boolean not null default false;

-- Backfill: every row that exists at this migration runtime is test data.
update public.wb_properties
set is_test = true
where is_test = false;

create index if not exists wb_properties_is_test_idx
  on public.wb_properties (is_test)
  where is_test = false;

-- Boats -------------------------------------------------------------------

alter table public.wb_boats
  add column if not exists is_test boolean not null default false;

update public.wb_boats
set is_test = true
where is_test = false;

create index if not exists wb_boats_is_test_idx
  on public.wb_boats (is_test)
  where is_test = false;

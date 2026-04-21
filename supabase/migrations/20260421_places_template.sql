-- =====================================================================
-- Places template layer + Kwetu rebrand.
--
-- Goals:
--   1. Replace the binary `is_active` on wb_places with a three-state
--      `visibility` (hidden / preview / public). "preview" lets hosts
--      onboard inventory to a destination via a magic-link before the
--      destination is live on the public internet.
--   2. Add a `features` text[] column that drives which product surfaces
--      appear on a place (boats, tides, marine-park, safari, adventure).
--      Coastal towns get boats+tides; inland destinations don't; Watamu
--      adds marine-park. Nav + routes read from this array, so adding a
--      destination is purely data entry.
--   3. Rebrand host config: watamubookings.com is being consolidated
--      into kwetu.ke (kept as a vanity alias, 301 wired in middleware).
--      Both hosts now declare brand = "Kwetu".
--
-- is_active is kept (synced from visibility) for backwards compatibility
-- until the code sweep in the next commit drops the last references.
-- =====================================================================

-- -----------------------------------------------------------------
-- 1. wb_places: add visibility + features columns
-- -----------------------------------------------------------------
alter table public.wb_places
  add column if not exists visibility text not null default 'hidden'
    check (visibility in ('hidden','preview','public'));

alter table public.wb_places
  add column if not exists features text[] not null default '{}';

-- Element-level check: every feature slug must come from the known set.
-- Runs via a row-level constraint that validates each element.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wb_places_features_known'
  ) then
    alter table public.wb_places
      add constraint wb_places_features_known
      check (
        features <@ array[
          'properties',
          'boats',
          'tides',
          'marine-park',
          'safari',
          'adventure',
          'lakes',
          'cultural'
        ]::text[]
      );
  end if;
end $$;

create index if not exists wb_places_visibility_idx on public.wb_places (visibility);
create index if not exists wb_places_features_gin on public.wb_places using gin (features);

-- -----------------------------------------------------------------
-- 2. Backfill visibility from the existing is_active flag.
--    true → public, false → hidden. (No preview rows yet.)
-- -----------------------------------------------------------------
update public.wb_places
   set visibility = case when is_active then 'public' else 'hidden' end
 where visibility = 'hidden';

-- -----------------------------------------------------------------
-- 3. Backfill features per seeded place.
--    Watamu already-live: properties + boats + tides + marine-park.
--    Malindi / Kilifi town: North-coast product set (no marine-park).
--    Vipingo: currently no boat ops; properties + tides only.
--    Kilifi County: container / hub, properties only.
-- -----------------------------------------------------------------
update public.wb_places set features = array['properties','boats','tides','marine-park']::text[]
  where slug = 'watamu';

update public.wb_places set features = array['properties','boats','tides']::text[]
  where slug in ('malindi','kilifi');

update public.wb_places set features = array['properties','tides']::text[]
  where slug = 'vipingo';

update public.wb_places set features = array['properties']::text[]
  where slug = 'kilifi-county';

-- -----------------------------------------------------------------
-- 4. Keep is_active in sync with visibility going forward.
--    Once the code sweep lands and nothing reads is_active any more,
--    a follow-up migration will drop the column + trigger.
-- -----------------------------------------------------------------
create or replace function public.wb_places_sync_is_active()
returns trigger
language plpgsql
as $$
begin
  new.is_active := (new.visibility = 'public');
  return new;
end $$;

drop trigger if exists wb_places_sync_is_active_trg on public.wb_places;
create trigger wb_places_sync_is_active_trg
  before insert or update of visibility on public.wb_places
  for each row execute function public.wb_places_sync_is_active();

-- Re-run sync once now (trigger only fires on subsequent writes)
update public.wb_places
   set is_active = (visibility = 'public');

-- -----------------------------------------------------------------
-- 5. Kwetu rebrand on wb_place_hosts.
--    watamubookings.com + www variant now declare brand = Kwetu.
--    They still resolve to the Watamu place (so the redirect can lift
--    the place slug out of the URL when middleware 301s in commit 2).
--    Support email consolidated on hello@kwetu.ke.
-- -----------------------------------------------------------------
update public.wb_place_hosts
   set brand_name = 'Kwetu',
       brand_short = 'Kwetu',
       support_email = 'hello@kwetu.ke'
 where host in ('watamubookings.com','www.watamubookings.com');

update public.wb_place_hosts
   set brand_name = 'Kwetu (dev)',
       brand_short = 'Kwetu',
       support_email = 'hello@kwetu.ke'
 where host in ('localhost:3000','localhost');

-- Make sure the localhost row exists without a :port (some dev servers
-- send host without the port if it's the default)
insert into public.wb_place_hosts (host, place_id, brand_name, brand_short, is_multi_place, support_email)
values
  ('localhost',
     (select id from public.wb_places where slug = 'watamu'),
     'Kwetu (dev)', 'Kwetu', false, 'hello@kwetu.ke')
on conflict (host) do nothing;

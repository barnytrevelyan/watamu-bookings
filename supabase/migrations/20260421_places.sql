-- =====================================================================
-- Places: first-class location model for multi-place expansion.
--
-- Goal: let watamubookings.com stay Watamu-only while kwetu.ke (the new
-- nationwide domain) and future sibling hosts serve Kilifi, Vipingo,
-- Malindi etc. from the same code + database.
--
-- Design:
--   * wb_places — one row per town / neighbourhood / county. Hierarchical
--     via parent_place_id (Watamu → Kilifi County, etc.).
--   * wb_place_hosts — map request host → default place + brand.
--     watamubookings.com → Watamu (single-place).
--     kwetu.ke         → no default (multi-place shell).
--   * wb_properties.place_id — single FK (a property is in one place).
--   * wb_boat_places — join table (a charter can run multiple places).
--
-- Backfill: every existing property + boat is tagged as Watamu.
-- =====================================================================

-- -----------------------------------------------------------------
-- 1. wb_places
-- -----------------------------------------------------------------
create table if not exists public.wb_places (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  parent_place_id   uuid references public.wb_places(id) on delete set null,
  kind              text not null default 'town'
                        check (kind in ('country','region','county','town','neighbourhood','marina')),
  country_code      text not null default 'KE',
  centroid_lat      numeric,
  centroid_lng      numeric,
  bbox_north        numeric,
  bbox_south        numeric,
  bbox_east         numeric,
  bbox_west         numeric,
  default_zoom      integer not null default 13,
  timezone          text not null default 'Africa/Nairobi',
  hero_image_url    text,
  short_tagline     text,
  description       text,
  seo_title         text,
  seo_description   text,
  -- Per-place content blobs. JSON keeps schema simple for v1; can be split
  -- into dedicated tables later without breaking queries.
  activities_json   jsonb not null default '[]'::jsonb,
  map_pois_json     jsonb not null default '[]'::jsonb,
  is_active         boolean not null default false,
  sort_order        integer not null default 100,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.wb_places is
  'Canonical list of places the platform serves. Hierarchical; single row per town/county.';
comment on column public.wb_places.kind is
  'Granularity of this place. A county contains towns which may contain neighbourhoods.';
comment on column public.wb_places.is_active is
  'Controls whether this place shows up in public place pickers. Seed inactive places for future towns.';

create index if not exists idx_wb_places_parent on public.wb_places(parent_place_id);
create index if not exists idx_wb_places_active on public.wb_places(is_active) where is_active;

drop trigger if exists trg_wb_places_touch on public.wb_places;
create trigger trg_wb_places_touch
  before update on public.wb_places
  for each row execute function public.wb_touch_updated_at();

-- -----------------------------------------------------------------
-- 2. wb_place_hosts — request.host → default place + brand
-- -----------------------------------------------------------------
create table if not exists public.wb_place_hosts (
  host              text primary key,
  place_id          uuid references public.wb_places(id) on delete set null,
  brand_name        text not null default 'Watamu Bookings',
  brand_short       text not null default 'Watamu',
  is_multi_place    boolean not null default false,
  default_og_image  text,
  support_email     text,
  support_whatsapp  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.wb_place_hosts is
  'Maps a request host to the default place and brand. watamubookings.com → Watamu; kwetu.ke → multi-place.';

drop trigger if exists trg_wb_place_hosts_touch on public.wb_place_hosts;
create trigger trg_wb_place_hosts_touch
  before update on public.wb_place_hosts
  for each row execute function public.wb_touch_updated_at();

-- -----------------------------------------------------------------
-- 3. wb_properties.place_id
-- -----------------------------------------------------------------
alter table public.wb_properties
  add column if not exists place_id uuid references public.wb_places(id) on delete restrict;

create index if not exists idx_wb_properties_place on public.wb_properties(place_id);

-- -----------------------------------------------------------------
-- 4. wb_boat_places — multi-place join for charters
-- -----------------------------------------------------------------
create table if not exists public.wb_boat_places (
  boat_id     uuid not null references public.wb_boats(id) on delete cascade,
  place_id    uuid not null references public.wb_places(id) on delete restrict,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (boat_id, place_id)
);

create index if not exists idx_wb_boat_places_boat  on public.wb_boat_places(boat_id);
create index if not exists idx_wb_boat_places_place on public.wb_boat_places(place_id);

-- Exactly one primary per boat
create unique index if not exists idx_wb_boat_places_primary
  on public.wb_boat_places(boat_id) where is_primary;

-- -----------------------------------------------------------------
-- 5. Seed places (Kilifi County + 4 coastal towns)
--    Watamu is the only active place for now.
-- -----------------------------------------------------------------
insert into public.wb_places
  (slug, name, kind, country_code, centroid_lat, centroid_lng, default_zoom,
   timezone, short_tagline, description, seo_title, seo_description,
   hero_image_url, is_active, sort_order)
values
  ('kilifi-county', 'Kilifi County', 'county', 'KE', -3.500, 39.920, 10,
   'Africa/Nairobi',
   'Bookings across Kilifi County on the Kenyan coast.',
   'Kilifi County is a coastal county in Kenya stretching from Vipingo in the south to Malindi in the north, covering ~12,246 km² along the Indian Ocean. Its towns include Watamu, Kilifi town, Vipingo and Malindi.',
   'Kilifi County stays and charters — Kenyan coast',
   'Browse villas, cottages, beach houses and fishing charters across Kilifi County, Kenya — Watamu, Kilifi, Vipingo and Malindi on the Indian Ocean coast.',
   null, true, 10),
  ('watamu', 'Watamu', 'town', 'KE', -3.354, 40.019, 13,
   'Africa/Nairobi',
   'Your stay in Watamu starts here.',
   'Watamu is a coastal village in Kilifi County on Kenya''s Indian Ocean coast, famous for the Watamu Marine National Park, deep-sea sport fishing, white-sand beaches and sea turtles.',
   'Watamu Bookings — Properties and fishing charters in Watamu, Kenya',
   'Discover and book stunning beachfront properties and world-class fishing boat charters in Watamu, Kenya. Your gateway to paradise on the Kenyan coast.',
   'https://jiyoxdeiyydyxjymahrh.supabase.co/storage/v1/object/public/watamu-images/hero/watamu-hero.jpg',
   true, 20),
  ('malindi', 'Malindi', 'town', 'KE', -3.219, 40.117, 13,
   'Africa/Nairobi',
   'Historic Swahili-Italian coastal town.',
   'Malindi is a historic coastal town in Kilifi County, about 15 km north of Watamu. Known for the Vasco da Gama Pillar, the Malindi Marine National Park and a strong Italian expat influence.',
   'Stays and charters in Malindi, Kenya',
   'Beachfront stays and fishing charters in Malindi on the Kenyan coast.',
   null, false, 30),
  ('kilifi',  'Kilifi',  'town', 'KE', -3.631, 39.850, 13,
   'Africa/Nairobi',
   'Laid-back creek-side town on the Kenyan coast.',
   'Kilifi town sits on the north bank of Kilifi Creek, about 55 km south of Watamu. Known for its yacht-club culture, Mnarani ruins and the Takaungu inlet.',
   'Stays and charters in Kilifi town, Kenya',
   'Beachfront stays and charters in Kilifi town on the Kenyan coast.',
   null, false, 35),
  ('vipingo', 'Vipingo', 'town', 'KE', -3.805, 39.795, 13,
   'Africa/Nairobi',
   'Quiet coastal escape north of Mombasa.',
   'Vipingo is a quieter stretch of Kilifi County''s coast, about 40 km north of Mombasa. Home to Vipingo Ridge, long reef-fringed beaches and the Kuruwitu marine conservancy.',
   'Stays and charters in Vipingo, Kenya',
   'Beachfront stays and charters in Vipingo on the Kenyan coast.',
   null, false, 40)
on conflict (slug) do nothing;

-- Wire the four towns under Kilifi County
update public.wb_places
   set parent_place_id = (select id from public.wb_places where slug = 'kilifi-county')
 where slug in ('watamu','malindi','kilifi','vipingo')
   and parent_place_id is null;

-- -----------------------------------------------------------------
-- 6. Seed hosts
-- -----------------------------------------------------------------
insert into public.wb_place_hosts (host, place_id, brand_name, brand_short, is_multi_place, support_email)
values
  ('watamubookings.com',
     (select id from public.wb_places where slug = 'watamu'),
     'Watamu Bookings', 'Watamu', false, 'hello@watamubookings.com'),
  ('www.watamubookings.com',
     (select id from public.wb_places where slug = 'watamu'),
     'Watamu Bookings', 'Watamu', false, 'hello@watamubookings.com'),
  ('kwetu.ke', null, 'Kwetu', 'Kwetu', true, 'hello@kwetu.ke'),
  ('www.kwetu.ke', null, 'Kwetu', 'Kwetu', true, 'hello@kwetu.ke'),
  ('localhost:3000',
     (select id from public.wb_places where slug = 'watamu'),
     'Watamu Bookings (dev)', 'Watamu', false, 'hello@watamubookings.com')
on conflict (host) do nothing;

-- -----------------------------------------------------------------
-- 7. Backfill: every existing property is in Watamu
-- -----------------------------------------------------------------
update public.wb_properties
   set place_id = (select id from public.wb_places where slug = 'watamu')
 where place_id is null;

-- Enforce NOT NULL now that every row is backfilled
alter table public.wb_properties alter column place_id set not null;

-- -----------------------------------------------------------------
-- 8. Backfill: every existing boat is a Watamu boat (primary)
-- -----------------------------------------------------------------
insert into public.wb_boat_places (boat_id, place_id, is_primary)
select b.id,
       (select id from public.wb_places where slug = 'watamu'),
       true
  from public.wb_boats b
 where not exists (
   select 1 from public.wb_boat_places bp
    where bp.boat_id = b.id and bp.is_primary
 );

-- -----------------------------------------------------------------
-- 9. RLS
-- -----------------------------------------------------------------
alter table public.wb_places       enable row level security;
alter table public.wb_place_hosts  enable row level security;
alter table public.wb_boat_places  enable row level security;

-- wb_places: world-readable, admin-only writes
drop policy if exists wb_places_select on public.wb_places;
create policy wb_places_select
  on public.wb_places for select
  using (true);

drop policy if exists wb_places_admin_all on public.wb_places;
create policy wb_places_admin_all
  on public.wb_places for all
  using (exists (
    select 1 from public.wb_profiles p
     where p.id = auth.uid()
       and (p.is_super_admin = true or p.role = 'admin')
  ))
  with check (exists (
    select 1 from public.wb_profiles p
     where p.id = auth.uid()
       and (p.is_super_admin = true or p.role = 'admin')
  ));

-- wb_place_hosts: world-readable (middleware reads it unauthenticated), admin-only writes
drop policy if exists wb_place_hosts_select on public.wb_place_hosts;
create policy wb_place_hosts_select
  on public.wb_place_hosts for select
  using (true);

drop policy if exists wb_place_hosts_admin_all on public.wb_place_hosts;
create policy wb_place_hosts_admin_all
  on public.wb_place_hosts for all
  using (exists (
    select 1 from public.wb_profiles p
     where p.id = auth.uid()
       and (p.is_super_admin = true or p.role = 'admin')
  ))
  with check (exists (
    select 1 from public.wb_profiles p
     where p.id = auth.uid()
       and (p.is_super_admin = true or p.role = 'admin')
  ));

-- wb_boat_places: world-readable, owner or admin writes
drop policy if exists wb_boat_places_select on public.wb_boat_places;
create policy wb_boat_places_select
  on public.wb_boat_places for select
  using (true);

drop policy if exists wb_boat_places_owner_all on public.wb_boat_places;
create policy wb_boat_places_owner_all
  on public.wb_boat_places for all
  using (
    exists (
      select 1 from public.wb_boats b
       where b.id = wb_boat_places.boat_id
         and b.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.wb_profiles p
       where p.id = auth.uid()
         and (p.is_super_admin = true or p.role = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.wb_boats b
       where b.id = wb_boat_places.boat_id
         and b.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.wb_profiles p
       where p.id = auth.uid()
         and (p.is_super_admin = true or p.role = 'admin')
    )
  );

-- -----------------------------------------------------------------
-- 10. Helper: resolve place for a request host (used by middleware)
-- -----------------------------------------------------------------
create or replace function public.wb_resolve_place_for_host(p_host text)
returns table (
  place_id        uuid,
  place_slug      text,
  place_name      text,
  brand_name      text,
  brand_short     text,
  is_multi_place  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, h.brand_name, h.brand_short, h.is_multi_place
    from public.wb_place_hosts h
    left join public.wb_places p on p.id = h.place_id
   where h.host = lower(p_host)
   limit 1
$$;

grant execute on function public.wb_resolve_place_for_host(text) to anon, authenticated;

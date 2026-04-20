-- =====================================================================
-- Host Subscriptions: opt-in flat-fee billing as an alternative to 10%
-- commission. Hosts pay KES 5,000/month for their first subscribed
-- listing and KES 2,500/month for each additional one. Annual prepay
-- costs 10 months (a ~17% discount). Free trial is 2 months during
-- launch and 1 month thereafter.
--
-- Anti-abuse: a new host cannot burn a trial by re-signing up. Trials
-- are fingerprinted on phone (normalised E.164) and on a geo + fuzzy
-- listing fingerprint (lat/long within 50m plus trigram-similar title
-- or address). Soft signals (device, IP) flag suspicious signups for
-- admin review but do not hard-block.
-- =====================================================================

create extension if not exists pg_trgm;

-- -----------------------------------------------------------------
-- 0. Shared trigger helper (safe to re-create; no-op if identical)
-- -----------------------------------------------------------------
create or replace function wb_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

-- -----------------------------------------------------------------
-- 1. Platform settings (single-row key/value store)
-- -----------------------------------------------------------------
create table if not exists wb_settings (
  key         text primary key,
  value       jsonb       not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references wb_profiles(id)
);

comment on table wb_settings is
  'Platform-wide configurable settings. Read on demand; never hot-cache beyond a request lifetime.';

insert into wb_settings (key, value, description) values
  ('billing.launch_promo_active',            'true'::jsonb,  'When true, new subscribers get launch_trial_months free. When false, standard_trial_months.'),
  ('billing.launch_trial_months',            '2'::jsonb,     'Free months granted during the launch promotion.'),
  ('billing.standard_trial_months',          '1'::jsonb,     'Free months granted after the launch promotion ends.'),
  ('billing.monthly_price_first_kes',        '5000'::jsonb,  'Monthly price for the first subscribed listing on a host account (KES).'),
  ('billing.monthly_price_additional_kes',   '2500'::jsonb,  'Monthly price for each additional subscribed listing on the same host account (KES).'),
  ('billing.annual_paid_months',             '10'::jsonb,    'Months charged for an annual prepay (pay 10, get 12).'),
  ('billing.grace_period_hours',             '48'::jsonb,    'Hours after invoice due date before auto-reverting to commission.'),
  ('billing.commission_rate_bps',            '800'::jsonb,   'Commission rate in basis points (800 = 8%). Applied to accommodation total for listings on billing_mode=commission.'),
  ('billing.listing_match_radius_m',         '50'::jsonb,    'Geographic radius (metres) within which a listing counts as a match for trial fingerprinting.'),
  ('billing.listing_match_trgm_threshold',   '0.4'::jsonb,   'pg_trgm similarity threshold for title/address match (0 = very loose, 1 = exact).')
on conflict (key) do nothing;

-- -----------------------------------------------------------------
-- 2. Billing mode on listings
-- -----------------------------------------------------------------
alter table wb_properties
  add column if not exists billing_mode text not null default 'commission'
    check (billing_mode in ('commission','subscription'));

alter table wb_boats
  add column if not exists billing_mode text not null default 'commission'
    check (billing_mode in ('commission','subscription'));

create index if not exists wb_properties_billing_mode_idx on wb_properties (billing_mode) where billing_mode = 'subscription';
create index if not exists wb_boats_billing_mode_idx      on wb_boats      (billing_mode) where billing_mode = 'subscription';

-- -----------------------------------------------------------------
-- 3. Host subscriptions (one per host account)
-- -----------------------------------------------------------------
create table if not exists wb_host_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  host_id                  uuid not null unique references wb_profiles(id) on delete cascade,
  status                   text not null check (status in ('trial','active','grace','reverted','cancelled')),
  plan                     text not null check (plan in ('monthly','annual')),
  trial_ends_at            timestamptz,
  trial_months_granted     integer not null default 0,
  launch_promo_applied     boolean not null default false,
  current_period_start     date,
  current_period_end       date,
  next_invoice_at          date,
  cancelled_at             timestamptz,
  cancellation_reason      text,
  -- Snapshot of the host's signals at activation, frozen for audit:
  activation_phone         text,
  activation_ip            inet,
  activation_device_hash   text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists wb_host_subscriptions_status_idx         on wb_host_subscriptions (status);
create index if not exists wb_host_subscriptions_next_invoice_idx   on wb_host_subscriptions (next_invoice_at) where status in ('active','trial','grace');
create index if not exists wb_host_subscriptions_trial_end_idx      on wb_host_subscriptions (trial_ends_at)    where status = 'trial';

create trigger wb_host_subscriptions_touch_updated
  before update on wb_host_subscriptions
  for each row execute function wb_touch_updated_at();  -- assumes existing helper; if missing the migration will error and alert us

-- -----------------------------------------------------------------
-- 4. Subscription invoices
-- -----------------------------------------------------------------
create table if not exists wb_subscription_invoices (
  id               uuid primary key default gen_random_uuid(),
  invoice_number   text not null unique,
  host_id          uuid not null references wb_profiles(id) on delete restrict,
  subscription_id  uuid not null references wb_host_subscriptions(id) on delete restrict,
  period_start     date not null,
  period_end       date not null,
  billing_cycle    text not null check (billing_cycle in ('monthly','annual')),
  listing_count    integer not null check (listing_count >= 0),
  amount_kes       numeric(12,2) not null check (amount_kes >= 0),
  line_items       jsonb not null,   -- [{listing_id, listing_type, listing_name, unit_price_kes, is_first_listing}]
  issued_at        timestamptz not null default now(),
  due_at           date not null,
  grace_until      timestamptz,      -- set when invoice goes overdue; status flips to 'grace' until this timestamp
  status           text not null check (status in ('draft','issued','paid','overdue','grace','void')),
  paid_at          timestamptz,
  payment_method   text check (payment_method in ('bank_transfer','mpesa','cash','stripe','waived')),
  payment_reference text,
  pdf_path         text,             -- storage key for the generated invoice PDF
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists wb_subscription_invoices_host_idx      on wb_subscription_invoices (host_id);
create index if not exists wb_subscription_invoices_status_idx    on wb_subscription_invoices (status);
create index if not exists wb_subscription_invoices_due_idx       on wb_subscription_invoices (due_at) where status in ('issued','overdue','grace');

create trigger wb_subscription_invoices_touch_updated
  before update on wb_subscription_invoices
  for each row execute function wb_touch_updated_at();

-- Monotonic invoice numbering: WB-INV-YYYYMM-NNNN (zero-padded, per month)
create sequence if not exists wb_invoice_seq;

create or replace function wb_generate_invoice_number() returns text
language plpgsql as $$
declare
  n bigint;
begin
  n := nextval('wb_invoice_seq');
  return 'WB-INV-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
end$$;

-- -----------------------------------------------------------------
-- 5. Audit event log
-- -----------------------------------------------------------------
create table if not exists wb_subscription_events (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid references wb_profiles(id) on delete set null,
  subscription_id  uuid references wb_host_subscriptions(id) on delete set null,
  invoice_id       uuid references wb_subscription_invoices(id) on delete set null,
  event_type       text not null,   -- free-text enum; documented in code
  payload          jsonb not null default '{}'::jsonb,
  actor_id         uuid references wb_profiles(id) on delete set null,
  actor_role       text,             -- 'host' | 'admin' | 'system'
  created_at       timestamptz not null default now()
);

create index if not exists wb_subscription_events_host_idx    on wb_subscription_events (host_id, created_at desc);
create index if not exists wb_subscription_events_type_idx    on wb_subscription_events (event_type, created_at desc);

-- -----------------------------------------------------------------
-- 6. Trial anti-abuse: consumed signals
-- -----------------------------------------------------------------
-- Independent signals that a free-trial has already been burnt. A new
-- signup matching any row here is ineligible for trial and billed from
-- day 1. Admin may override (creates an event, does not delete row).
create table if not exists wb_trial_consumed (
  id                     uuid primary key default gen_random_uuid(),
  signal_type            text not null check (signal_type in ('phone','listing')),
  signal_value           text not null,    -- normalised E.164 or fingerprint composite key
  -- For listing fingerprints we keep the three components so the
  -- matcher can re-evaluate with adjusted thresholds without a migration:
  fingerprint_lat        numeric(10,6),
  fingerprint_lng        numeric(10,6),
  fingerprint_title_norm text,
  fingerprint_address_norm text,
  consumed_by_host       uuid references wb_profiles(id) on delete set null,
  consumed_by_sub        uuid references wb_host_subscriptions(id) on delete set null,
  trial_months           numeric not null,
  consumed_at            timestamptz not null default now(),
  metadata               jsonb not null default '{}'::jsonb
);

-- Phone-signal must be unique (one phone = one trial, ever).
-- Listing-signals can legitimately coexist (nearby villas with different titles)
-- so we do the proximity + trigram match in a function, not a unique constraint.
create unique index if not exists wb_trial_consumed_phone_unique
  on wb_trial_consumed (signal_value)
  where signal_type = 'phone';

create index if not exists wb_trial_consumed_listing_latlng_idx
  on wb_trial_consumed (fingerprint_lat, fingerprint_lng)
  where signal_type = 'listing';

create index if not exists wb_trial_consumed_title_trgm_idx
  on wb_trial_consumed using gin (fingerprint_title_norm gin_trgm_ops)
  where signal_type = 'listing';

create index if not exists wb_trial_consumed_address_trgm_idx
  on wb_trial_consumed using gin (fingerprint_address_norm gin_trgm_ops)
  where signal_type = 'listing';

-- -----------------------------------------------------------------
-- 7. Soft abuse signals (for admin review, not hard-block)
-- -----------------------------------------------------------------
create table if not exists wb_signup_signals (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references wb_profiles(id) on delete cascade,
  device_hash   text,             -- sha256 of a stable localStorage uuid
  ip_address    inet,
  ip_subnet     cidr,             -- /24 of ip_address, for fuzzy match
  user_agent    text,
  captured_at   timestamptz not null default now()
);
create index if not exists wb_signup_signals_device_idx on wb_signup_signals (device_hash) where device_hash is not null;
create index if not exists wb_signup_signals_subnet_idx on wb_signup_signals (ip_subnet)   where ip_subnet   is not null;

-- -----------------------------------------------------------------
-- 8. Helper: normalise a string for fuzzy-match (title / address)
-- -----------------------------------------------------------------
create or replace function wb_normalise_text(input text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      lower(coalesce(input,'')),
      '[^a-z0-9\s]', ' ', 'g'),     -- drop punctuation
    '\s+', ' ', 'g'))                -- collapse whitespace
$$;

-- -----------------------------------------------------------------
-- 9. Helper: normalise a phone number to E.164 (best-effort)
-- -----------------------------------------------------------------
-- For Kenyan numbers: accept 07XXXXXXXX, 7XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
create or replace function wb_normalise_phone(input text) returns text
language plpgsql immutable as $$
declare
  digits text;
begin
  if input is null then return null; end if;
  digits := regexp_replace(input, '[^0-9]', '', 'g');
  if digits is null or length(digits) = 0 then return null; end if;
  -- 254XXXXXXXXX (12 digits): already E.164 without '+'
  if length(digits) = 12 and left(digits,3) = '254' then
    return '+' || digits;
  end if;
  -- 0XXXXXXXXX (10 digits): Kenyan local → +254XXXXXXXXX
  if length(digits) = 10 and left(digits,1) = '0' then
    return '+254' || substr(digits, 2);
  end if;
  -- XXXXXXXXX (9 digits): bare Kenyan → +254XXXXXXXXX
  if length(digits) = 9 then
    return '+254' || digits;
  end if;
  -- Anything else: return with leading + if missing (international)
  if left(input, 1) = '+' then
    return '+' || digits;
  end if;
  return '+' || digits;
end$$;

-- -----------------------------------------------------------------
-- 10. Helper: haversine distance in metres
-- -----------------------------------------------------------------
create or replace function wb_haversine_m(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371000 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end
$$;

-- -----------------------------------------------------------------
-- 11. Helper: listing fingerprint match
-- -----------------------------------------------------------------
-- Returns a row from wb_trial_consumed if the given listing collides
-- with a previous trial. NULL → no match → host is eligible.
create or replace function wb_trial_match_listing(
  p_lat numeric, p_lng numeric, p_title text, p_address text
) returns uuid
language plpgsql stable as $$
declare
  v_radius_m numeric;
  v_threshold numeric;
  v_title_norm text;
  v_address_norm text;
  v_match uuid;
begin
  select (value::text)::numeric into v_radius_m  from wb_settings where key = 'billing.listing_match_radius_m';
  select (value::text)::numeric into v_threshold from wb_settings where key = 'billing.listing_match_trgm_threshold';
  v_title_norm   := wb_normalise_text(p_title);
  v_address_norm := wb_normalise_text(p_address);

  select id into v_match
  from wb_trial_consumed c
  where c.signal_type = 'listing'
    and c.fingerprint_lat is not null
    and c.fingerprint_lng is not null
    and wb_haversine_m(p_lat, p_lng, c.fingerprint_lat, c.fingerprint_lng) <= coalesce(v_radius_m, 50)
    and (
      (v_title_norm   is not null and c.fingerprint_title_norm   is not null and similarity(v_title_norm,   c.fingerprint_title_norm)   >= coalesce(v_threshold, 0.4))
      or
      (v_address_norm is not null and c.fingerprint_address_norm is not null and similarity(v_address_norm, c.fingerprint_address_norm) >= coalesce(v_threshold, 0.4))
    )
  limit 1;

  return v_match;
end$$;

-- -----------------------------------------------------------------
-- 12. Helper: compute monthly charge for a host
-- -----------------------------------------------------------------
-- listing_count = 0 returns 0; listing_count = 1 returns monthly_price_first;
-- listing_count >= 2 returns first + (n-1) * monthly_price_additional
create or replace function wb_compute_monthly_charge_kes(p_listing_count integer)
returns numeric
language plpgsql stable as $$
declare
  first_kes numeric;
  add_kes   numeric;
begin
  if p_listing_count is null or p_listing_count <= 0 then
    return 0;
  end if;
  select (value::text)::numeric into first_kes from wb_settings where key = 'billing.monthly_price_first_kes';
  select (value::text)::numeric into add_kes   from wb_settings where key = 'billing.monthly_price_additional_kes';
  return coalesce(first_kes, 5000) + greatest(p_listing_count - 1, 0) * coalesce(add_kes, 2500);
end$$;

-- -----------------------------------------------------------------
-- 13. Helper: count a host's subscription-mode listings
-- -----------------------------------------------------------------
create or replace function wb_host_subscription_listing_count(p_host_id uuid)
returns integer
language sql stable as $$
  select (
    (select count(*) from wb_properties where owner_id = p_host_id and billing_mode = 'subscription' and is_published = true)
    +
    (select count(*) from wb_boats      where owner_id = p_host_id and billing_mode = 'subscription' and is_published = true)
  )::integer
$$;

-- -----------------------------------------------------------------
-- 14. RLS policies
-- -----------------------------------------------------------------
alter table wb_host_subscriptions    enable row level security;
alter table wb_subscription_invoices enable row level security;
alter table wb_subscription_events   enable row level security;
alter table wb_trial_consumed        enable row level security;
alter table wb_signup_signals        enable row level security;
alter table wb_settings              enable row level security;

-- Hosts: read their own subscription and invoices; no writes (all writes via service role).
create policy "host reads own subscription"
  on wb_host_subscriptions for select
  using (auth.uid() = host_id);

create policy "host reads own invoices"
  on wb_subscription_invoices for select
  using (auth.uid() = host_id);

create policy "host reads own events"
  on wb_subscription_events for select
  using (auth.uid() = host_id);

-- Admins: full read.
create policy "admin full read subscriptions"
  on wb_host_subscriptions for select
  using (exists (select 1 from wb_profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admin full read invoices"
  on wb_subscription_invoices for select
  using (exists (select 1 from wb_profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admin full read events"
  on wb_subscription_events for select
  using (exists (select 1 from wb_profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admin full read trial_consumed"
  on wb_trial_consumed for select
  using (exists (select 1 from wb_profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admin full read signup_signals"
  on wb_signup_signals for select
  using (exists (select 1 from wb_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Settings: anyone authenticated can read; only admins can write (via service role calls).
create policy "any auth read settings"
  on wb_settings for select
  using (auth.role() = 'authenticated');

-- All writes happen via the service role (bypasses RLS).

-- -----------------------------------------------------------------
-- 15. Convenience view: host billing summary
-- -----------------------------------------------------------------
create or replace view wb_host_billing_summary as
select
  s.id                                 as subscription_id,
  s.host_id,
  s.status,
  s.plan,
  s.trial_ends_at,
  s.current_period_start,
  s.current_period_end,
  s.next_invoice_at,
  wb_host_subscription_listing_count(s.host_id) as subscription_listing_count,
  wb_compute_monthly_charge_kes(wb_host_subscription_listing_count(s.host_id)) as current_monthly_kes,
  (select count(*) from wb_subscription_invoices i where i.host_id = s.host_id and i.status in ('issued','overdue','grace')) as outstanding_invoices
from wb_host_subscriptions s;

-- -----------------------------------------------------------------
-- Done. The application layer is responsible for:
-- * Writing to wb_trial_consumed when a trial is granted
-- * Calling wb_trial_match_listing + phone dedupe at activation time
-- * Generating invoices via wb_generate_invoice_number()
-- * Running the grace + revert cron nightly
-- -----------------------------------------------------------------

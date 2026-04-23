-- Booking safety hardening: prevent race-condition double-bookings,
-- recreate the host billing summary view with security_invoker, and
-- snapshot pricing at booking time so later edits can't retroactively
-- change what a guest agreed to pay.

-- 1. btree_gist allows composite EXCLUDE constraints that mix scalars (uuid) with ranges.
create extension if not exists btree_gist;

-- 2. Prevent overlapping property bookings in active states.
-- daterange('[)') because check_out is the departure day and is itself
-- bookable by the next guest.
alter table wb_bookings drop constraint if exists wb_bookings_no_property_overlap;
alter table wb_bookings add constraint wb_bookings_no_property_overlap
  exclude using gist (
    property_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (
    listing_type = 'property'
    and property_id is not null
    and check_in is not null
    and check_out is not null
    and status in ('pending_payment', 'confirmed', 'completed')
  );

-- 3. Boat trips are single-day; a partial unique index is sufficient and cheaper than GIST.
drop index if exists wb_bookings_boat_trip_unique;
create unique index wb_bookings_boat_trip_unique on wb_bookings (boat_id, trip_date)
  where listing_type = 'boat'
    and boat_id is not null
    and trip_date is not null
    and status in ('pending_payment', 'confirmed', 'completed');

-- 4. Re-create the host billing summary view so it runs as the querying user
-- (current definition inherited SECURITY DEFINER semantics, flagged by advisor).
drop view if exists wb_host_billing_summary;
create view wb_host_billing_summary
  with (security_invoker = on) as
  select
    s.id as subscription_id,
    s.host_id,
    s.status,
    s.plan,
    s.trial_ends_at,
    s.current_period_start,
    s.current_period_end,
    s.next_invoice_at,
    wb_host_subscription_listing_count(s.host_id) as subscription_listing_count,
    wb_compute_monthly_charge_kes(wb_host_subscription_listing_count(s.host_id)) as current_monthly_kes,
    (
      select count(*)
      from wb_subscription_invoices i
      where i.host_id = s.host_id
        and i.status = any (array['issued'::text, 'overdue'::text, 'grace'::text])
    ) as outstanding_invoices
  from wb_host_subscriptions s;

-- 5. Snapshot the price breakdown at booking time so later flexi/base-rate edits
-- never retroactively change what a guest agreed to pay.
alter table wb_bookings
  add column if not exists price_snapshot jsonb;

comment on column wb_bookings.price_snapshot is
  'Frozen pricing context captured when the booking was created: base_per_night, nights, currency, flexi config, per-night breakdown and effective_total. Never edit after insert.';

-- =====================================================================
-- Enquiry-mode bookings for subscription-billed listings.
--
-- Hosts on billing_mode = 'subscription' collect their own deposits
-- directly from guests (M-Pesa / bank transfer / cash on arrival). The
-- platform does not take payment on their behalf, so the booking flow
-- for those listings is an ENQUIRY:
--
--   1. Guest submits dates & contact details.
--   2. Booking row inserted with status = 'enquiry', booking_mode
--      = 'direct'. No calendar hold yet.
--   3. Host receives email with guest contact details + secure
--      Confirm / Decline action links.
--   4. Host collects deposit out-of-band, clicks Confirm.
--   5. Row flips to status = 'confirmed'. Dates are now hard-held on
--      the calendar. Guest gets a confirmation email.
--
-- Commission-billed listings continue to use the existing
-- 'pending_payment' → Stripe/M-Pesa → 'confirmed' flow and are
-- stamped booking_mode = 'platform'.
-- =====================================================================

-- -----------------------------------------------------------------
-- 1. Deposit percent on listings (subscription-mode only).
-- -----------------------------------------------------------------

alter table wb_properties
  add column if not exists deposit_percent numeric(5,2) not null default 25
    check (deposit_percent >= 0 and deposit_percent <= 100);

alter table wb_boats
  add column if not exists deposit_percent numeric(5,2) not null default 25
    check (deposit_percent >= 0 and deposit_percent <= 100);

comment on column wb_properties.deposit_percent is
  'Deposit percentage the host asks guests to send directly to secure a booking. Only used when billing_mode = subscription; ignored in commission mode.';
comment on column wb_boats.deposit_percent is
  'Deposit percentage the host asks guests to send directly to secure a booking. Only used when billing_mode = subscription; ignored in commission mode.';

-- -----------------------------------------------------------------
-- 2. Enquiry columns on wb_bookings.
--
-- We widen the status CHECK to allow 'enquiry' and 'declined', and
-- add booking_mode ('platform' | 'direct') to freeze which flow each
-- booking went through (so later changes to listing.billing_mode do
-- not retroactively reinterpret historical bookings).
-- -----------------------------------------------------------------

-- Drop old check if present; re-add with the two new values.
do $$
declare
  conname_val text;
begin
  select conname into conname_val
    from pg_constraint
    where conrelid = 'wb_bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%in%';
  if conname_val is not null then
    execute format('alter table wb_bookings drop constraint %I', conname_val);
  end if;
end $$;

alter table wb_bookings
  add constraint wb_bookings_status_check check (
    status in (
      'enquiry',          -- subscription-mode: awaiting host confirmation
      'pending_payment',  -- commission-mode: awaiting Stripe/M-Pesa
      'confirmed',        -- guest has paid (commission) or host marked deposit received (subscription)
      'declined',         -- host rejected the enquiry
      'cancelled',        -- either party cancelled post-confirmation
      'completed',        -- check-out passed
      'refunded'
    )
  );

alter table wb_bookings
  add column if not exists booking_mode text not null default 'platform'
    check (booking_mode in ('platform', 'direct'));

comment on column wb_bookings.booking_mode is
  'platform = paid through Watamu Bookings (commission listings). direct = host handles payment off-platform (subscription listings). Frozen at booking-creation time.';

-- Deposit snapshot at enquiry time — so even if the host later edits
-- deposit_percent on the listing, the amount the guest was told is
-- preserved for the record.
alter table wb_bookings
  add column if not exists deposit_amount numeric(12,2);

comment on column wb_bookings.deposit_amount is
  'Deposit amount (KES) quoted to the guest at the moment the enquiry was created. Only populated for booking_mode = direct.';

-- Secure token used in email action links so the host can confirm or
-- decline without being logged in. Random UUID, rotated on confirm/decline.
alter table wb_bookings
  add column if not exists enquiry_token uuid;

create index if not exists wb_bookings_enquiry_token_idx
  on wb_bookings (enquiry_token) where enquiry_token is not null;

-- Timestamps for host response + decline reason for audit.
alter table wb_bookings
  add column if not exists host_responded_at timestamptz;

alter table wb_bookings
  add column if not exists host_decline_reason text;

-- Fast filter for the host dashboard "pending enquiries" view.
create index if not exists wb_bookings_status_enquiry_idx
  on wb_bookings (status) where status = 'enquiry';

-- Denormalised guest contact info captured at enquiry time. Lets the
-- host reach the guest even if the guest later edits their profile,
-- and keeps the enquiry email self-contained.
alter table wb_bookings
  add column if not exists guest_contact_name text;

alter table wb_bookings
  add column if not exists guest_contact_email text;

alter table wb_bookings
  add column if not exists guest_contact_phone text;

comment on column wb_bookings.guest_contact_phone is
  'Phone / WhatsApp number the guest gave at enquiry time — snapshot for the host enquiry email.';

-- -----------------------------------------------------------------
-- 3. Availability helper: block dates only for statuses that hold
--    the calendar. 'enquiry' and 'declined' do NOT hold dates.
--
-- We replace the existing availability RPCs to whitelist the
-- statuses that count as "blocking". If the existing RPCs use
-- different column names than assumed below, adjust accordingly.
-- -----------------------------------------------------------------

create or replace function wb_check_property_availability(
  p_property_id uuid,
  p_check_in    date,
  p_check_out   date
) returns boolean
language sql
stable
as $$
  select not exists (
    select 1
      from wb_bookings b
     where b.property_id = p_property_id
       and b.status in ('pending_payment', 'confirmed', 'completed')
       and b.check_in  < p_check_out
       and b.check_out > p_check_in
  );
$$;

create or replace function wb_check_boat_availability(
  p_boat_id   uuid,
  p_trip_date date,
  p_trip_id   uuid default null
) returns boolean
language sql
stable
as $$
  select not exists (
    select 1
      from wb_bookings b
     where b.boat_id = p_boat_id
       and b.status in ('pending_payment', 'confirmed', 'completed')
       and b.trip_date = p_trip_date
       and (p_trip_id is null or b.trip_id is null or b.trip_id = p_trip_id)
  );
$$;

comment on function wb_check_property_availability is
  'Returns TRUE if no blocking booking overlaps the requested range. Enquiries and declined bookings do NOT block.';
comment on function wb_check_boat_availability is
  'Returns TRUE if no blocking booking overlaps the requested trip date. Enquiries and declined bookings do NOT block.';

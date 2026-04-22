-- ============================================================
-- Commission-only U-turn (2026-04-22)
-- ============================================================
-- Abandons the subscription billing model that shipped on
-- 2026-04-20 and reverts to a pure commission model — per the
-- meeting with Lynda. Commission rate drops from 8% → 7.5%.
--
-- This migration is additive where possible. Deprecated columns
-- (billing_mode, deposit_percent, deposit_amount, enquiry_token,
--  host_responded_at, host_decline_reason) stay in place for
-- the moment so any in-flight rows don't break — a later
-- migration can drop them once we've confirmed no code reads
-- them. The status enum keeps 'enquiry' / 'declined' values for
-- the same reason; the app side no longer sets or renders them.
-- ============================================================

-- ---------- 1. Commission rate: 8% → 7.5% ---------------------
-- Stored as basis points for precision. 750 bps = 7.5%.
update wb_settings
set value = '750'::jsonb,
    description = 'Commission rate in basis points (750 = 7.5%). Applied to the booking total on every confirmed booking.'
where key = 'billing.commission_rate_bps';

-- If the row never existed (fresh env), make sure it does.
insert into wb_settings (key, value, description)
values ('billing.commission_rate_bps', '750'::jsonb,
        'Commission rate in basis points (750 = 7.5%). Applied to the booking total on every confirmed booking.')
on conflict (key) do nothing;

-- ---------- 2. Drop subscription pricing settings -------------
-- These keys were written by the 2026-04-22 tiered-subscription
-- migration and are no longer meaningful.
delete from wb_settings
where key like 'billing.monthly_price%'
   or key like 'billing.trial_%'
   or key like 'billing.annual_%'
   or key like 'billing.grace_%'
   or key like 'billing.subscription_%'
   or key like 'billing.listing_match_%';

-- ---------- 3. Make every listing commission-mode -------------
-- Any listing still flagged 'subscription' needs to fall back
-- to commission so it keeps earning on the platform.
update wb_properties set billing_mode = 'commission' where billing_mode <> 'commission';
update wb_boats      set billing_mode = 'commission' where billing_mode <> 'commission';

-- ---------- 4. Clean up in-flight enquiry bookings ------------
-- Any open 'enquiry' booking is orphaned by this change — no
-- host respond page exists anymore. Cancel them so guests aren't
-- stuck in limbo; hosts can contact guests manually if needed.
update wb_bookings
set status = 'cancelled',
    cancellation_reason = coalesce(cancellation_reason, 'Auto-cancelled: platform switched from subscription/enquiry to commission-only on 2026-04-22.')
where status = 'enquiry';

-- ---------- 5. Drop subscription tables -----------------------
-- These were only created two days ago and never carried real
-- data, so dropping them is safe. If you need history, restore
-- from the 2026-04-20 point-in-time backup.
drop table if exists wb_subscription_invoices cascade;
drop table if exists wb_host_subscriptions   cascade;
drop view  if exists wb_subscription_status  cascade;
drop function if exists wb_listing_match     cascade;

-- ---------- 6. Drop the billing cron function stub ------------
drop function if exists wb_run_billing_cron  cascade;

# Admin routes (/admin/*)

All require admin role. RLS typically bypassed via service role or explicit allow
policies.

## /admin — Admin dashboard

- **File**: `src/app/admin/page.tsx`
- **Data**: `wb_properties` (pending/draft), `wb_boats` (pending/draft), `wb_profiles`,
  `wb_bookings`, `wb_reviews` (flagged)
- Stat cards (total owners/properties/boats/bookings/revenue); pending listings with
  approve/reject; recent signups; flag reviews

## /admin/owners — Manage hosts

- **File**: `src/app/admin/owners/page.tsx`
- **Data**: `wb_profiles` (role='owner'), `wb_host_subscriptions`, `wb_properties`,
  `wb_boats`
- Actions: view profile + listings; view subscription + invoices; send email;
  suspend/unsuspend; flag

## /admin/submissions — Approve/reject pending listings

- **File**: `src/app/admin/submissions/page.tsx`
- **Data**: `wb_properties` (`is_published=false`), `wb_boats` (`is_published=false`),
  images, owner info
- Actions: approve (publish), request edits (email owner), reject with reason, filter
  by type/owner/date

## /admin/subscriptions — Billing admin

- **File**: `src/app/admin/subscriptions/page.tsx`
- **Data**: `wb_host_subscriptions`, `wb_subscription_invoices`, `wb_trial_consumed`,
  `wb_signup_signals`, `wb_profiles`
- Actions: mark invoice as paid (override); override trial eligibility; inspect trial
  anti-abuse signals (consumed phones, listing fingerprints); view signup signals
  (device hash, IP subnet, UA)

## /admin/invitations — Owner invitations

- **File**: `src/app/admin/invitations/page.tsx`
- **Data**: `wb_invitations`, `wb_profiles` (if claimed)
- Actions: send invitation(s), revoke, filter by status

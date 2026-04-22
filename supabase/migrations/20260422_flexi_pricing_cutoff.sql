-- Flexi pricing cutoff — the latest (days before check-in) at which the
-- host will accept a booking. The flexi ramp reaches its floor at the
-- cutoff (it doesn't keep dropping to zero), and bookings inside the
-- cutoff are rejected at the API layer.
--
-- Defaults to 1 day: the host still accepts bookings the day before
-- check-in, but not same-day. Hosts can lower this to 0 (same-day
-- bookings OK) or raise it to a few days for gated properties.

alter table wb_profiles
  add column if not exists flexi_default_cutoff_days integer not null default 1;

alter table wb_properties
  add column if not exists flexi_cutoff_days integer;

alter table wb_profiles
  add constraint wb_profiles_flexi_default_cutoff_days_range
    check (flexi_default_cutoff_days between 0 and 89);

alter table wb_properties
  add constraint wb_properties_flexi_cutoff_days_range
    check (flexi_cutoff_days is null or (flexi_cutoff_days between 0 and 89));

comment on column wb_profiles.flexi_default_cutoff_days is
  'Latest (in days before check-in) the host will accept a booking. Flexi price reaches floor here.';
comment on column wb_properties.flexi_cutoff_days is
  'Override: latest (days before check-in) the host will accept a booking. Null = inherit host default.';

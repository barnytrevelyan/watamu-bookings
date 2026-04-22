-- Flexi pricing — automatic last-minute discounts on properties.
--
-- Hosts opt in to an automatic price-reduction curve that kicks in as the
-- check-in date approaches. They set the window (how many days ahead the
-- discounting starts) and a floor (the lowest acceptable price, expressed
-- as a percentage of the base nightly rate). The calculation is a linear
-- ramp — base price at the outer edge of the window, floor price at day
-- zero — so the discount is deterministic and transparent to the host.
--
-- Guests whose search dates fall inside an active window see the
-- discounted price plus a "Last-minute deal" badge on search cards.
--
-- Host-level defaults live on wb_profiles so the host can set once and
-- apply to every property they own; each property can override.

-- ---------------------------------------------------------------
-- Host-level default preferences (optional, property values win)
-- ---------------------------------------------------------------
alter table wb_profiles
  add column if not exists flexi_default_enabled boolean not null default false,
  add column if not exists flexi_default_window_days integer not null default 7,
  add column if not exists flexi_default_floor_percent integer not null default 70;

comment on column wb_profiles.flexi_default_enabled is
  'If true, new properties inherit flexi pricing by default.';
comment on column wb_profiles.flexi_default_window_days is
  'Days before check-in when the discount ramp begins (host default).';
comment on column wb_profiles.flexi_default_floor_percent is
  'Lowest acceptable nightly price as a percentage of base (host default).';

-- ---------------------------------------------------------------
-- Property-level flexi config (null floor = inherit host default)
-- ---------------------------------------------------------------
alter table wb_properties
  add column if not exists flexi_enabled boolean not null default false,
  add column if not exists flexi_window_days integer,
  add column if not exists flexi_floor_percent integer;

comment on column wb_properties.flexi_enabled is
  'If true, apply last-minute discount as check-in approaches.';
comment on column wb_properties.flexi_window_days is
  'Days before check-in when the discount ramp begins. Null = inherit host default.';
comment on column wb_properties.flexi_floor_percent is
  'Lowest acceptable nightly price as a percentage of base. Null = inherit host default.';

-- Sensible sanity constraints — clamp window to [1, 90] and floor to [10, 100].
alter table wb_properties
  add constraint wb_properties_flexi_window_days_range
    check (flexi_window_days is null or (flexi_window_days between 1 and 90)),
  add constraint wb_properties_flexi_floor_percent_range
    check (flexi_floor_percent is null or (flexi_floor_percent between 10 and 100));

alter table wb_profiles
  add constraint wb_profiles_flexi_default_window_days_range
    check (flexi_default_window_days between 1 and 90),
  add constraint wb_profiles_flexi_default_floor_percent_range
    check (flexi_default_floor_percent between 10 and 100);

-- Index so filtering by flexi on search is cheap. Partial — only the
-- minority (opted-in) rows are indexed.
create index if not exists wb_properties_flexi_enabled_idx
  on wb_properties (flexi_enabled)
  where flexi_enabled = true;

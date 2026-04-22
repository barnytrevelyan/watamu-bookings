-- =====================================================================
-- Tiered subscription pricing
--
-- Replaces the flat first/additional pricing (KES 5,000 / 2,500) with a
-- tiered per-listing curve:
--
--   1st listing         KES 3,000/mo
--   Listings 2–5        KES 1,500/mo each
--   Listings 6–20       KES 1,000/mo each
--   Listings 21–50      KES   500/mo each
--   Listings 51+        KES   250/mo each
--
-- The pricing is stored as a single JSON key in wb_settings so future
-- curve changes are a one-row update rather than a schema migration.
-- The wb_compute_monthly_charge_kes() helper iterates the tier array.
--
-- Existing invoices are not re-priced. Only new invoices issued after
-- this migration use the new curve.
-- =====================================================================

-- -----------------------------------------------------------------
-- 1. Settings: swap the two flat keys for a single tier ladder
-- -----------------------------------------------------------------
insert into wb_settings (key, value, description) values
  (
    'billing.monthly_price_tiers_kes',
    '[
      {"from":1,"to":1,"price_kes":3000,"label":"1st listing"},
      {"from":2,"to":5,"price_kes":1500,"label":"Listings 2–5"},
      {"from":6,"to":20,"price_kes":1000,"label":"Listings 6–20"},
      {"from":21,"to":50,"price_kes":500,"label":"Listings 21–50"},
      {"from":51,"to":null,"price_kes":250,"label":"Listings 51+"}
    ]'::jsonb,
    'Tiered monthly price ladder. Each tier applies to listings numbered from .. to (inclusive, 1-indexed). to=null means unlimited.'
  )
on conflict (key) do update
  set value       = excluded.value,
      description = excluded.description,
      updated_at  = now();

-- Old flat keys are now obsolete. Keep the rows around as nulls so older
-- clients that read them get a sane fallback, or drop them entirely —
-- we drop, because loadBillingSettings() already falls back to the TS
-- defaults if it can't parse the tier JSON.
delete from wb_settings where key in (
  'billing.monthly_price_first_kes',
  'billing.monthly_price_additional_kes'
);

-- -----------------------------------------------------------------
-- 2. Rewrite wb_compute_monthly_charge_kes to walk the tier ladder
-- -----------------------------------------------------------------
create or replace function wb_compute_monthly_charge_kes(p_listing_count integer)
returns numeric
language plpgsql stable as $$
declare
  v_tiers   jsonb;
  v_tier    jsonb;
  v_total   numeric := 0;
  v_from    integer;
  v_to      integer;
  v_price   numeric;
  v_in_tier integer;
begin
  if p_listing_count is null or p_listing_count <= 0 then
    return 0;
  end if;

  select value into v_tiers
  from wb_settings
  where key = 'billing.monthly_price_tiers_kes';

  -- Fallback matches the TS DEFAULT_PRICING_TIERS in pricing.ts
  if v_tiers is null then
    v_tiers := '[
      {"from":1,"to":1,"price_kes":3000},
      {"from":2,"to":5,"price_kes":1500},
      {"from":6,"to":20,"price_kes":1000},
      {"from":21,"to":50,"price_kes":500},
      {"from":51,"to":null,"price_kes":250}
    ]'::jsonb;
  end if;

  for v_tier in select * from jsonb_array_elements(v_tiers)
  loop
    v_from  := (v_tier->>'from')::int;
    v_price := (v_tier->>'price_kes')::numeric;

    -- JSON null 'to' means "no upper bound". jsonb_typeof lets us tell a
    -- JSON null apart from a missing key or a present integer cleanly.
    if jsonb_typeof(v_tier->'to') = 'null' then
      v_to := null;
    else
      v_to := (v_tier->>'to')::int;
    end if;

    -- If tier has no upper bound, it absorbs everything from v_from onwards.
    if v_to is null then
      v_in_tier := greatest(p_listing_count - (v_from - 1), 0);
    else
      v_in_tier := greatest(least(p_listing_count, v_to) - (v_from - 1), 0);
    end if;

    v_total := v_total + v_in_tier * v_price;

    if v_to is not null and p_listing_count <= v_to then
      exit;  -- no more tiers can apply
    end if;
  end loop;

  return v_total;
end$$;

-- -----------------------------------------------------------------
-- 3. Sanity check (run by the migration itself — fails the migration
--    if the maths drifts from the TS mirror)
-- -----------------------------------------------------------------
do $$
begin
  -- Expected values from the financial model / pricing.ts mirror:
  --   1 prop  →  3,000
  --   3 prop  →  6,000   (3000 + 2*1500)
  --   10 prop → 14,000   (3000 + 4*1500 + 5*1000)
  --   25 prop → 26,500   (3000 + 4*1500 + 15*1000 + 5*500)
  --   50 prop → 39,000   (3000 + 4*1500 + 15*1000 + 30*500)
  --   75 prop → 45,250   (39000 + 25*250)
  assert wb_compute_monthly_charge_kes(0)  = 0,      'tier math: 0';
  assert wb_compute_monthly_charge_kes(1)  = 3000,   'tier math: 1';
  assert wb_compute_monthly_charge_kes(3)  = 6000,   'tier math: 3';
  assert wb_compute_monthly_charge_kes(10) = 14000,  'tier math: 10';
  assert wb_compute_monthly_charge_kes(25) = 26500,  'tier math: 25';
  assert wb_compute_monthly_charge_kes(50) = 39000,  'tier math: 50';
  assert wb_compute_monthly_charge_kes(75) = 45250,  'tier math: 75';
end$$;

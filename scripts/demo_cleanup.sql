-- ============================================================================
-- DEMO DATA CLEANUP
-- ----------------------------------------------------------------------------
-- Removes every row created by migration `demo_seed_watamu_2026_04_20`.
--
-- The seed identifies itself by two conventions — either is sufficient:
--   1. Properties / boats have slug starting with `demo-`.
--   2. Demo host profiles use email suffix `@watamu-bookings.demo`.
--
-- Run this ONCE, before taking the site live to real customers.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/demo_cleanup.sql
--   -- or via Supabase SQL editor: paste and run
-- ============================================================================

BEGIN;

-- Reviews attached to demo listings ------------------------------------------
DELETE FROM wb_reviews
WHERE property_id IN (SELECT id FROM wb_properties WHERE slug LIKE 'demo-%')
   OR boat_id     IN (SELECT id FROM wb_boats      WHERE slug LIKE 'demo-%');

-- Bookings attached to demo listings -----------------------------------------
DELETE FROM wb_bookings
WHERE property_id IN (SELECT id FROM wb_properties WHERE slug LIKE 'demo-%')
   OR boat_id     IN (SELECT id FROM wb_boats      WHERE slug LIKE 'demo-%');

-- Images on demo listings ----------------------------------------------------
DELETE FROM wb_images
WHERE property_id IN (SELECT id FROM wb_properties WHERE slug LIKE 'demo-%')
   OR boat_id     IN (SELECT id FROM wb_boats      WHERE slug LIKE 'demo-%');

-- Boat trips -----------------------------------------------------------------
DELETE FROM wb_boat_trips
WHERE boat_id IN (SELECT id FROM wb_boats WHERE slug LIKE 'demo-%');

-- Join tables (amenities / features) -----------------------------------------
DELETE FROM wb_property_amenities
WHERE property_id IN (SELECT id FROM wb_properties WHERE slug LIKE 'demo-%');

DELETE FROM wb_boat_feature_links
WHERE boat_id IN (SELECT id FROM wb_boats WHERE slug LIKE 'demo-%');

-- Listings -------------------------------------------------------------------
DELETE FROM wb_properties WHERE slug LIKE 'demo-%';
DELETE FROM wb_boats      WHERE slug LIKE 'demo-%';

-- Profiles + auth users ------------------------------------------------------
-- auth.users cascade-deletes wb_profiles, but some FK-less side tables may
-- hold rows keyed on profile UUIDs, so we purge wb_profiles explicitly first.
DELETE FROM wb_profiles
WHERE id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@watamu-bookings.demo'
);

DELETE FROM auth.users
WHERE email LIKE '%@watamu-bookings.demo';

-- Sanity check ---------------------------------------------------------------
SELECT
  (SELECT count(*) FROM wb_properties WHERE slug LIKE 'demo-%')          AS demo_properties_left,
  (SELECT count(*) FROM wb_boats      WHERE slug LIKE 'demo-%')          AS demo_boats_left,
  (SELECT count(*) FROM auth.users    WHERE email LIKE '%@watamu-bookings.demo') AS demo_users_left;

COMMIT;

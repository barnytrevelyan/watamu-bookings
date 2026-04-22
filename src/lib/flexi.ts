/**
 * Flexi pricing — last-minute discount engine.
 *
 * Hosts opt in to an automatic price-reduction curve that activates as the
 * check-in date approaches. The shape is deliberately boring: a linear
 * ramp from the base nightly price at the outer edge of the window down
 * to a floor (expressed as a percentage of base) at the host's booking
 * cutoff.
 *
 *   base price  ┌─────────────────────┐
 *               │                    ╲ │
 *               │                   ╲  │
 *               │                  ╲   │
 *               │                 ╲    │
 *               │                ╲     │
 *   floor price └────────────────•────-│ ← cutoff (also latest accepted booking)
 *              window_days      cutoff  0 days out
 *
 * Three levers the host controls:
 *   - windowDays   when the discount starts (e.g. 10 days out).
 *   - cutoffDays   the latest they'll accept a booking (and where the
 *                  price reaches the floor). Default 1 day.
 *   - floorPercent floor as a percentage of base price.
 *
 * That's simple enough to reason about on three inputs, deterministic,
 * and admins/disputes have one answer to any "why this price?" question.
 *
 * Everything in here is pure — no DB, no clock. `today` is an input so
 * that server renders, tests, and preview links can pin the date.
 */

import type { Profile, Property } from '@/lib/types';

export interface FlexiConfig {
  /** Is flexi pricing active for this context? */
  enabled: boolean;
  /** Days before check-in when the discount ramp starts. */
  windowDays: number;
  /** Days before check-in when the host stops accepting bookings; the ramp
   *  reaches the floor here. Bookings with daysOut < cutoffDays must be
   *  rejected at the API layer. */
  cutoffDays: number;
  /** Floor as a percentage of base price, e.g. 70 means "never go below 70%". */
  floorPercent: number;
}

/**
 * Resolve the effective flexi config for a property by falling back to the
 * host's defaults for any null property-level values.
 */
export function resolveFlexiConfig(
  property: Pick<
    Property,
    'flexi_enabled' | 'flexi_window_days' | 'flexi_cutoff_days' | 'flexi_floor_percent'
  >,
  hostDefaults?:
    | {
        flexi_default_enabled?: Profile['flexi_default_enabled'] | null;
        flexi_default_window_days?: Profile['flexi_default_window_days'] | null;
        flexi_default_cutoff_days?: Profile['flexi_default_cutoff_days'] | null;
        flexi_default_floor_percent?: Profile['flexi_default_floor_percent'] | null;
      }
    | null,
): FlexiConfig {
  const windowDays = property.flexi_window_days ?? hostDefaults?.flexi_default_window_days ?? 7;
  const rawCutoff = property.flexi_cutoff_days ?? hostDefaults?.flexi_default_cutoff_days ?? 1;
  // Guard: cutoff can never be at or past the window start — otherwise the
  // ramp collapses to a point and the price just jumps.
  const cutoffDays = Math.min(rawCutoff, Math.max(0, windowDays - 1));
  return {
    enabled: property.flexi_enabled,
    windowDays,
    cutoffDays,
    floorPercent:
      property.flexi_floor_percent ?? hostDefaults?.flexi_default_floor_percent ?? 70,
  };
}

/**
 * Whole days from `today` to `checkIn` (positive = in the future).
 * Both sides are compared at UTC midnight to avoid the DST/TZ trap where
 * "5pm local today" vs "9am local tomorrow" swings the answer.
 */
export function daysUntil(checkIn: Date | string, today: Date | string = new Date()): number {
  const c = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
  const t = typeof today === 'string' ? new Date(today) : today;
  const cUtc = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
  const tUtc = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.floor((cUtc - tUtc) / (1000 * 60 * 60 * 24));
}

export interface FlexiPriceResult {
  /** Price to charge for this night (rounded to integer KES). */
  effectivePrice: number;
  /** True when the flexi discount is actually reducing the price today. */
  isLastMinute: boolean;
  /** 0–100 — how much cheaper the effective price is vs the base. */
  discountPercent: number;
  /** True when the check-in date is past the host's booking cutoff — the
   *  booking should be rejected; price is still returned for display. */
  pastCutoff: boolean;
}

/**
 * Compute the flexi-discounted price for a single night.
 *
 * Rules:
 *  - Flexi disabled / base==0 → base price, no discount.
 *  - Outside the window (too far out) → base price, no discount.
 *  - Between window and cutoff → linear ramp from base (at window edge)
 *    to `base * floorPercent/100` (at cutoff).
 *  - At or inside the cutoff → floor price, `pastCutoff: true`.
 *
 * Floor is clamped to [10, 100]. Caller should reject bookings where
 * `pastCutoff` is true.
 */
export function computeFlexiPrice(
  basePrice: number,
  config: FlexiConfig,
  checkIn: Date | string,
  today: Date | string = new Date(),
): FlexiPriceResult {
  const safeBase = Math.max(0, basePrice);
  if (!config.enabled || safeBase === 0) {
    return {
      effectivePrice: Math.round(safeBase),
      isLastMinute: false,
      discountPercent: 0,
      pastCutoff: false,
    };
  }

  const daysOut = daysUntil(checkIn, today);
  // Outside the window — no discount.
  if (daysOut > config.windowDays) {
    return {
      effectivePrice: Math.round(safeBase),
      isLastMinute: false,
      discountPercent: 0,
      pastCutoff: false,
    };
  }

  const floorPercent = Math.min(100, Math.max(10, config.floorPercent));
  const floorPrice = safeBase * (floorPercent / 100);

  // At or inside the cutoff — stay at floor, flag pastCutoff.
  if (daysOut <= config.cutoffDays) {
    const effective = Math.round(floorPrice);
    return {
      effectivePrice: effective,
      isLastMinute: effective < safeBase,
      discountPercent: Math.round(((safeBase - effective) / safeBase) * 100),
      pastCutoff: true,
    };
  }

  // Linear ramp between window and cutoff.
  // ratio = 0 at cutoff (floor), 1 at windowDays (base).
  const span = config.windowDays - config.cutoffDays;
  const ratio = span > 0 ? (daysOut - config.cutoffDays) / span : 1;
  const effective = Math.round(floorPrice + (safeBase - floorPrice) * ratio);
  const discountPercent = Math.round(((safeBase - effective) / safeBase) * 100);
  return {
    effectivePrice: effective,
    isLastMinute: effective < safeBase,
    discountPercent,
    pastCutoff: false,
  };
}

/**
 * Convenience: cheapest flexi price across a search window (`checkIn` to
 * `checkOut`, exclusive). Used for search cards where we want to surface
 * the best-case discount given the user's intended stay.
 */
export function bestFlexiPriceInRange(
  basePrice: number,
  config: FlexiConfig,
  checkIn: Date | string,
  checkOut: Date | string,
  today: Date | string = new Date(),
): FlexiPriceResult {
  const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
  const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;
  let best: FlexiPriceResult = computeFlexiPrice(basePrice, config, start, today);
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor < end) {
    const r = computeFlexiPrice(basePrice, config, new Date(cursor), today);
    if (r.effectivePrice < best.effectivePrice) best = r;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return best;
}

// Pricing helpers — pure functions, safe for both client and server.
// Mirror of the SQL function wb_compute_monthly_charge_kes + annual logic.
//
// Pricing is tiered per-listing (not flat first/additional). The ladder is
// defined in wb_settings.billing.monthly_price_tiers_kes and mirrored in
// DEFAULT_BILLING_SETTINGS below as a fallback. Keep the two in sync.

import type { BillingSettings, PricingTier, SubscriptionInvoiceLineItem, ListingType } from './types';

export const DEFAULT_PRICING_TIERS: PricingTier[] = [
  { from: 1,  to: 1,    price_kes: 3000, label: '1st listing' },
  { from: 2,  to: 5,    price_kes: 1500, label: 'Listings 2–5' },
  { from: 6,  to: 20,   price_kes: 1000, label: 'Listings 6–20' },
  { from: 21, to: 50,   price_kes: 500,  label: 'Listings 21–50' },
  { from: 51, to: null, price_kes: 250,  label: 'Listings 51+' },
];

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  launch_promo_active: true,
  launch_trial_months: 2,
  standard_trial_months: 1,
  monthly_price_tiers_kes: DEFAULT_PRICING_TIERS,
  annual_paid_months: 10,
  grace_period_hours: 48,
  commission_rate_bps: 800,
  listing_match_radius_m: 50,
  listing_match_trgm_threshold: 0.4,
};

/**
 * Return the monthly unit price for the Nth listing on a host account
 * (1-indexed). Falls back to the last tier if no band matches.
 */
export function priceForListingNumber(
  listingNumber: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): number {
  const tiers = settings.monthly_price_tiers_kes;
  for (const tier of tiers) {
    const upper = tier.to ?? Number.POSITIVE_INFINITY;
    if (listingNumber >= tier.from && listingNumber <= upper) return tier.price_kes;
  }
  return tiers[tiers.length - 1]?.price_kes ?? 0;
}

/**
 * Return the tier descriptor for the Nth listing on a host account
 * (1-indexed). Handy for invoice line-item labelling.
 */
export function tierForListingNumber(
  listingNumber: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): PricingTier {
  const tiers = settings.monthly_price_tiers_kes;
  for (const tier of tiers) {
    const upper = tier.to ?? Number.POSITIVE_INFINITY;
    if (listingNumber >= tier.from && listingNumber <= upper) return tier;
  }
  return tiers[tiers.length - 1];
}

export function computeMonthlyChargeKes(
  listingCount: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): number {
  if (!listingCount || listingCount <= 0) return 0;
  let total = 0;
  for (let i = 1; i <= listingCount; i++) {
    total += priceForListingNumber(i, settings);
  }
  return total;
}

export function computeAnnualChargeKes(
  listingCount: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): number {
  return computeMonthlyChargeKes(listingCount, settings) * settings.annual_paid_months;
}

export function annualSavingsKes(
  listingCount: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): number {
  const monthlyTotal = computeMonthlyChargeKes(listingCount, settings) * 12;
  return monthlyTotal - computeAnnualChargeKes(listingCount, settings);
}

export function trialMonthsForNewSubscription(settings: BillingSettings): number {
  return settings.launch_promo_active ? settings.launch_trial_months : settings.standard_trial_months;
}

// Break-even gross bookings: the annual gross at which commission equals
// the subscription cost. A host whose annual gross is above this saves
// money on subscription.
export function annualBreakEvenGrossKes(
  listingCount: number,
  plan: 'monthly' | 'annual',
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): number {
  const commissionRate = settings.commission_rate_bps / 10000; // 800 -> 0.08
  const annualCost =
    plan === 'annual'
      ? computeAnnualChargeKes(listingCount, settings)
      : computeMonthlyChargeKes(listingCount, settings) * 12;
  if (commissionRate === 0) return Infinity;
  return Math.round(annualCost / commissionRate);
}

// Build the line-items for an invoice given the host's listings.
// Stable ordering by created_at ascending: the oldest listing is listing #1
// (most expensive tier), the next four are listings 2–5 in the second tier,
// etc. Deterministic so re-running the generator produces the same invoice.
export interface ListingForInvoice {
  listing_id: string;
  listing_type: ListingType;
  listing_name: string;
  created_at: string;
}

export function buildInvoiceLineItems(
  listings: ListingForInvoice[],
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): SubscriptionInvoiceLineItem[] {
  const sorted = [...listings].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return sorted.map((l, idx) => {
    const tier = tierForListingNumber(idx + 1, settings);
    return {
      listing_id: l.listing_id,
      listing_type: l.listing_type,
      listing_name: l.listing_name,
      unit_price_kes: tier.price_kes,
      tier_label: tier.label,
    };
  });
}

export function sumLineItemsKes(
  items: SubscriptionInvoiceLineItem[],
  multiplier = 1
): number {
  return items.reduce((acc, x) => acc + x.unit_price_kes, 0) * multiplier;
}

export function formatKes(value: number): string {
  return `KES ${Math.round(value).toLocaleString('en-KE')}`;
}

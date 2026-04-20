// Pricing helpers — pure functions, safe for both client and server.
// Mirror of the SQL function wb_compute_monthly_charge_kes + annual logic.

import type { BillingSettings, SubscriptionInvoiceLineItem, ListingType } from './types';

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  launch_promo_active: true,
  launch_trial_months: 2,
  standard_trial_months: 1,
  monthly_price_first_kes: 5000,
  monthly_price_additional_kes: 2500,
  annual_paid_months: 10,
  grace_period_hours: 48,
  commission_rate_bps: 800,
  listing_match_radius_m: 50,
  listing_match_trgm_threshold: 0.4,
};

export function computeMonthlyChargeKes(
  listingCount: number,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): number {
  if (!listingCount || listingCount <= 0) return 0;
  return (
    settings.monthly_price_first_kes +
    Math.max(listingCount - 1, 0) * settings.monthly_price_additional_kes
  );
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
// Stable ordering: first listing by created_at ascending pays full price,
// the rest pay the additional-listing rate. Deterministic so re-running
// the generator produces the same invoice.
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
  return sorted.map((l, idx) => ({
    listing_id: l.listing_id,
    listing_type: l.listing_type,
    listing_name: l.listing_name,
    unit_price_kes: idx === 0 ? settings.monthly_price_first_kes : settings.monthly_price_additional_kes,
    is_first_listing: idx === 0,
  }));
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

// Subscription types — shared between client and server bundles.

export type BillingMode = 'commission' | 'subscription';
export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'reverted' | 'cancelled';
export type SubscriptionPlan = 'monthly' | 'annual';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'grace' | 'void';
export type InvoicePaymentMethod = 'bank_transfer' | 'mpesa' | 'cash' | 'stripe' | 'waived';
export type ListingType = 'property' | 'boat';

export interface HostSubscription {
  id: string;
  host_id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  trial_ends_at: string | null;
  trial_months_granted: number;
  launch_promo_applied: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  next_invoice_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  activation_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionInvoiceLineItem {
  listing_id: string;
  listing_type: ListingType;
  listing_name: string;
  unit_price_kes: number;
  /** Human-readable label for the pricing tier this listing falls into, e.g. "1st listing", "Listings 2–5". */
  tier_label: string;
}

export interface SubscriptionInvoice {
  id: string;
  invoice_number: string;
  host_id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  billing_cycle: SubscriptionPlan;
  listing_count: number;
  amount_kes: number;
  line_items: SubscriptionInvoiceLineItem[];
  issued_at: string;
  due_at: string;
  grace_until: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  payment_method: InvoicePaymentMethod | null;
  payment_reference: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A single band in the tiered subscription pricing ladder. `from` and `to`
 * are 1-indexed and inclusive; `to = null` means the tier extends without
 * limit. Example: `{ from: 2, to: 5, price_kes: 1500, label: "Listings 2–5" }`
 * means the 2nd, 3rd, 4th and 5th listing on a host's account each cost
 * 1,500 KES/month.
 */
export interface PricingTier {
  from: number;
  to: number | null;
  price_kes: number;
  label: string;
}

export interface BillingSettings {
  launch_promo_active: boolean;
  launch_trial_months: number;
  standard_trial_months: number;
  /** Ordered tiered pricing ladder. Tiers must be contiguous (no gaps, no overlap). */
  monthly_price_tiers_kes: PricingTier[];
  annual_paid_months: number;
  grace_period_hours: number;
  commission_rate_bps: number;
  listing_match_radius_m: number;
  listing_match_trgm_threshold: number;
}

export interface HostBillingSummary {
  subscription: HostSubscription | null;
  subscription_listing_count: number;
  current_monthly_kes: number;
  outstanding_invoices: number;
}

export interface TrialEligibility {
  eligible: boolean;
  reason?: 'phone_already_used' | 'listing_already_used' | 'admin_override_denied';
  matched_record_id?: string;
  soft_flags: string[]; // e.g. ['duplicate_device', 'same_ip_subnet']
}

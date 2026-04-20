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
  is_first_listing: boolean;
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

export interface BillingSettings {
  launch_promo_active: boolean;
  launch_trial_months: number;
  standard_trial_months: number;
  monthly_price_first_kes: number;
  monthly_price_additional_kes: number;
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

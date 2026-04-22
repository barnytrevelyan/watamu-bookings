// Server-side subscription engine. All writes happen via the service-role
// client (bypassing RLS) and are audited into wb_subscription_events.
//
// Public surface:
//   - loadBillingSettings(db)
//   - checkTrialEligibility(db, { host_id, phone, listings })
//   - activateSubscription(db, { host_id, plan, listings, context })
//   - cancelSubscription(db, { host_id, reason })
//   - toggleListingBillingMode(db, { listing_id, listing_type, billing_mode, actor_id })
//   - generateInvoice(db, { subscription, cycle })
//   - markInvoicePaid(db, { invoice_id, method, reference, actor_id })
//   - runBillingCron(db, now)
//
// None of this is exported to the client bundle — callers must be server
// routes, edge functions, or admin actions running under the service role.

import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { sendTransactional } from '@/lib/email/zeptomail';
import {
  invoiceIssuedEmail,
  invoiceOverdueEmail,
  revertedToCommissionEmail,
  trialStartedEmail,
} from '@/lib/email/templates';
import {
  DEFAULT_BILLING_SETTINGS,
  buildInvoiceLineItems,
  computeMonthlyChargeKes,
  trialMonthsForNewSubscription,
  type ListingForInvoice,
} from './pricing';
import type {
  BillingSettings,
  HostSubscription,
  PricingTier,
  SubscriptionInvoice,
  SubscriptionPlan,
  SubscriptionInvoiceLineItem,
  TrialEligibility,
  ListingType,
  InvoicePaymentMethod,
} from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export function adminDb(): SupabaseAdmin {
  return createAdminClient();
}

// -----------------------------------------------------------------
// Settings
// -----------------------------------------------------------------
export async function loadBillingSettings(db: SupabaseAdmin): Promise<BillingSettings> {
  const { data, error } = await db
    .from('wb_settings')
    .select('key, value')
    .like('key', 'billing.%');
  if (error) {
    console.error('[subscriptions] loadBillingSettings failed, falling back to defaults', error);
    return DEFAULT_BILLING_SETTINGS;
  }
  const out: BillingSettings = { ...DEFAULT_BILLING_SETTINGS };
  for (const row of data ?? []) {
    const v = row.value;
    switch (row.key) {
      case 'billing.launch_promo_active':          out.launch_promo_active = !!v; break;
      case 'billing.launch_trial_months':          out.launch_trial_months = Number(v); break;
      case 'billing.standard_trial_months':        out.standard_trial_months = Number(v); break;
      case 'billing.monthly_price_tiers_kes': {
        const parsed = parsePricingTiers(v);
        if (parsed) out.monthly_price_tiers_kes = parsed;
        break;
      }
      case 'billing.annual_paid_months':           out.annual_paid_months = Number(v); break;
      case 'billing.grace_period_hours':           out.grace_period_hours = Number(v); break;
      case 'billing.commission_rate_bps':          out.commission_rate_bps = Number(v); break;
      case 'billing.listing_match_radius_m':       out.listing_match_radius_m = Number(v); break;
      case 'billing.listing_match_trgm_threshold': out.listing_match_trgm_threshold = Number(v); break;
    }
  }
  return out;
}

/** Defensive parse of the tier JSON column — returns null on any shape problem. */
function parsePricingTiers(raw: unknown): PricingTier[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PricingTier[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return null;
    const t = r as Record<string, unknown>;
    const from = Number(t.from);
    const to = t.to === null || t.to === undefined ? null : Number(t.to);
    const price_kes = Number(t.price_kes);
    const label = typeof t.label === 'string' ? t.label : '';
    if (!Number.isFinite(from) || !Number.isFinite(price_kes)) return null;
    if (to !== null && !Number.isFinite(to)) return null;
    out.push({ from, to, price_kes, label });
  }
  return out.length > 0 ? out : null;
}

// -----------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------
type EventArgs = {
  host_id?: string | null;
  subscription_id?: string | null;
  invoice_id?: string | null;
  event_type: string;
  payload?: Record<string, unknown>;
  actor_id?: string | null;
  actor_role?: 'host' | 'admin' | 'system';
};

export async function logEvent(db: SupabaseAdmin, ev: EventArgs): Promise<void> {
  const { error } = await db.from('wb_subscription_events').insert({
    host_id: ev.host_id ?? null,
    subscription_id: ev.subscription_id ?? null,
    invoice_id: ev.invoice_id ?? null,
    event_type: ev.event_type,
    payload: ev.payload ?? {},
    actor_id: ev.actor_id ?? null,
    actor_role: ev.actor_role ?? 'system',
  });
  if (error) console.error('[subscriptions] logEvent failed', error, ev);
}

// -----------------------------------------------------------------
// Phone normalisation (mirror of SQL wb_normalise_phone)
// -----------------------------------------------------------------
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith('254')) return '+' + digits;
  if (digits.length === 10 && digits.startsWith('0'))   return '+254' + digits.slice(1);
  if (digits.length === 9)                              return '+254' + digits;
  return input.startsWith('+') ? '+' + digits : '+' + digits;
}

// -----------------------------------------------------------------
// Trial eligibility
// -----------------------------------------------------------------
export interface EligibilityInput {
  host_id: string;
  phone?: string | null;
  listings: Array<{
    listing_id: string;
    listing_type: ListingType;
    latitude: number | null;
    longitude: number | null;
    title: string | null;
    address: string | null;
  }>;
  device_hash?: string | null;
  ip?: string | null;
}

export async function checkTrialEligibility(
  db: SupabaseAdmin,
  input: EligibilityInput
): Promise<TrialEligibility> {
  const softFlags: string[] = [];

  // 1. Phone match — hard block
  const phoneNorm = normalisePhone(input.phone);
  if (phoneNorm) {
    const { data: phoneMatch } = await db
      .from('wb_trial_consumed')
      .select('id, consumed_by_host')
      .eq('signal_type', 'phone')
      .eq('signal_value', phoneNorm)
      .maybeSingle();
    if (phoneMatch && phoneMatch.consumed_by_host !== input.host_id) {
      return {
        eligible: false,
        reason: 'phone_already_used',
        matched_record_id: phoneMatch.id,
        soft_flags: softFlags,
      };
    }
  }

  // 2. Listing fingerprint match — hard block
  for (const l of input.listings) {
    if (l.latitude == null || l.longitude == null) continue;
    const { data: match } = await db.rpc('wb_trial_match_listing', {
      p_lat: l.latitude,
      p_lng: l.longitude,
      p_title: l.title ?? '',
      p_address: l.address ?? '',
    });
    if (match) {
      // Resolve the consumed_by_host to see if it's the same user (allowed)
      const { data: row } = await db
        .from('wb_trial_consumed')
        .select('consumed_by_host')
        .eq('id', match)
        .maybeSingle();
      if (row && row.consumed_by_host !== input.host_id) {
        return {
          eligible: false,
          reason: 'listing_already_used',
          matched_record_id: match as string,
          soft_flags: softFlags,
        };
      }
    }
  }

  // 3. Soft flags (device / IP within /24 within 30 days)
  if (input.device_hash) {
    const { data: deviceMatches } = await db
      .from('wb_signup_signals')
      .select('host_id')
      .eq('device_hash', input.device_hash)
      .neq('host_id', input.host_id)
      .limit(1);
    if (deviceMatches && deviceMatches.length > 0) softFlags.push('duplicate_device');
  }
  if (input.ip) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: ipMatches } = await db
      .from('wb_signup_signals')
      .select('host_id, ip_address')
      .gt('captured_at', thirtyDaysAgo)
      .neq('host_id', input.host_id)
      .limit(25);
    const subnet = ipToSubnet24(input.ip);
    if (ipMatches?.some((r: { ip_address: string | null }) => r.ip_address && ipToSubnet24(r.ip_address) === subnet)) {
      softFlags.push('same_ip_subnet');
    }
  }

  return { eligible: true, soft_flags: softFlags };
}

function ipToSubnet24(ip: string): string {
  // IPv4 /24: first three octets. IPv6: first 64 bits.
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':');
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return parts.slice(0, 3).join('.') + '.0/24';
}

// -----------------------------------------------------------------
// Activation: host opts into subscription
// -----------------------------------------------------------------
export interface ActivationInput {
  host_id: string;
  plan: SubscriptionPlan;
  listings: Array<{
    listing_id: string;
    listing_type: ListingType;
    latitude: number | null;
    longitude: number | null;
    title: string | null;
    address: string | null;
    created_at: string;
  }>;
  phone?: string | null;
  device_hash?: string | null;
  ip?: string | null;
  admin_override?: boolean;
  actor_id?: string | null;
  actor_role?: 'host' | 'admin';
}

export interface ActivationResult {
  subscription: HostSubscription;
  trial_granted_months: number;
  invoice?: SubscriptionInvoice;
  soft_flags: string[];
}

export async function activateSubscription(
  db: SupabaseAdmin,
  input: ActivationInput
): Promise<ActivationResult> {
  const settings = await loadBillingSettings(db);

  // Trial eligibility
  const eligibility = input.admin_override
    ? ({ eligible: true, soft_flags: [] } as TrialEligibility)
    : await checkTrialEligibility(db, {
        host_id: input.host_id,
        phone: input.phone,
        listings: input.listings,
        device_hash: input.device_hash,
        ip: input.ip,
      });

  const trialMonths = eligibility.eligible ? trialMonthsForNewSubscription(settings) : 0;
  const now = new Date();
  const trialEndsAt = trialMonths > 0 ? addMonths(now, trialMonths) : now;

  // Upsert subscription
  const { data: existing } = await db
    .from('wb_host_subscriptions')
    .select('*')
    .eq('host_id', input.host_id)
    .maybeSingle();

  let subscription: HostSubscription;
  if (existing) {
    const { data, error } = await db
      .from('wb_host_subscriptions')
      .update({
        status: trialMonths > 0 ? 'trial' : 'active',
        plan: input.plan,
        trial_ends_at: trialMonths > 0 ? trialEndsAt.toISOString() : null,
        trial_months_granted: trialMonths,
        launch_promo_applied: settings.launch_promo_active && trialMonths === settings.launch_trial_months,
        current_period_start: trialMonths > 0 ? trialEndsAt.toISOString().slice(0, 10) : now.toISOString().slice(0, 10),
        current_period_end: nextPeriodEnd(trialMonths > 0 ? trialEndsAt : now, input.plan, settings).toISOString().slice(0, 10),
        next_invoice_at: (trialMonths > 0 ? trialEndsAt : now).toISOString().slice(0, 10),
        activation_phone: normalisePhone(input.phone ?? null),
        activation_ip: input.ip ?? null,
        activation_device_hash: input.device_hash ?? null,
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error || !data) throw new Error('Failed to update subscription: ' + error?.message);
    subscription = data as HostSubscription;
  } else {
    const { data, error } = await db
      .from('wb_host_subscriptions')
      .insert({
        host_id: input.host_id,
        status: trialMonths > 0 ? 'trial' : 'active',
        plan: input.plan,
        trial_ends_at: trialMonths > 0 ? trialEndsAt.toISOString() : null,
        trial_months_granted: trialMonths,
        launch_promo_applied: settings.launch_promo_active && trialMonths === settings.launch_trial_months,
        current_period_start: trialMonths > 0 ? trialEndsAt.toISOString().slice(0, 10) : now.toISOString().slice(0, 10),
        current_period_end: nextPeriodEnd(trialMonths > 0 ? trialEndsAt : now, input.plan, settings).toISOString().slice(0, 10),
        next_invoice_at: (trialMonths > 0 ? trialEndsAt : now).toISOString().slice(0, 10),
        activation_phone: normalisePhone(input.phone ?? null),
        activation_ip: input.ip ?? null,
        activation_device_hash: input.device_hash ?? null,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error('Failed to create subscription: ' + error?.message);
    subscription = data as HostSubscription;
  }

  // Flip the billing_mode on all nominated listings
  for (const l of input.listings) {
    const table = l.listing_type === 'property' ? 'wb_properties' : 'wb_boats';
    await db.from(table).update({ billing_mode: 'subscription' }).eq('id', l.listing_id);
  }

  // Record trial consumption signals (so re-signups are blocked)
  if (trialMonths > 0) {
    const phoneNorm = normalisePhone(input.phone ?? null);
    if (phoneNorm) {
      await db
        .from('wb_trial_consumed')
        .insert({
          signal_type: 'phone',
          signal_value: phoneNorm,
          consumed_by_host: input.host_id,
          consumed_by_sub: subscription.id,
          trial_months: trialMonths,
        })
        .select('id');
    }
    for (const l of input.listings) {
      if (l.latitude == null || l.longitude == null) continue;
      await db.from('wb_trial_consumed').insert({
        signal_type: 'listing',
        signal_value: `${l.listing_type}:${l.listing_id}`,
        fingerprint_lat: l.latitude,
        fingerprint_lng: l.longitude,
        fingerprint_title_norm: (l.title ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(),
        fingerprint_address_norm: (l.address ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(),
        consumed_by_host: input.host_id,
        consumed_by_sub: subscription.id,
        trial_months: trialMonths,
      });
    }
  }

  // Soft signals
  if (input.device_hash || input.ip) {
    await db.from('wb_signup_signals').insert({
      host_id: input.host_id,
      device_hash: input.device_hash ?? null,
      ip_address: input.ip ?? null,
      ip_subnet: input.ip ? ipToSubnet24(input.ip) : null,
    });
  }

  await logEvent(db, {
    host_id: input.host_id,
    subscription_id: subscription.id,
    event_type: eligibility.eligible ? 'subscription_activated_with_trial' : 'subscription_activated_no_trial',
    actor_id: input.actor_id ?? null,
    actor_role: input.actor_role ?? 'host',
    payload: {
      plan: input.plan,
      trial_months_granted: trialMonths,
      listing_count: input.listings.length,
      eligibility_reason: eligibility.reason,
      soft_flags: eligibility.soft_flags,
      admin_override: !!input.admin_override,
    },
  });

  let firstInvoice: SubscriptionInvoice | undefined;
  if (trialMonths === 0) {
    // No trial → generate first invoice immediately (it was ineligible).
    firstInvoice = await generateInvoice(db, { subscription_id: subscription.id });
  } else {
    // Send trial welcome email
    await sendHostEmail(db, input.host_id, trialStartedEmail(subscription, trialMonths));
  }

  return {
    subscription,
    trial_granted_months: trialMonths,
    invoice: firstInvoice,
    soft_flags: eligibility.soft_flags,
  };
}

// Helper: look up the host's email and send a transactional email.
async function sendHostEmail(
  db: SupabaseAdmin,
  hostId: string,
  payload: { subject: string; html: string; text: string }
): Promise<void> {
  try {
    const { data: profile } = await db.from('wb_profiles').select('email, full_name').eq('id', hostId).maybeSingle();
    if (!profile?.email) return;
    await sendTransactional({
      to: { email: profile.email, name: profile.full_name ?? undefined },
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  } catch (err) {
    console.error('[subscriptions] sendHostEmail failed', err);
  }
}

// -----------------------------------------------------------------
// Toggle a single listing's billing_mode
// -----------------------------------------------------------------
export async function toggleListingBillingMode(
  db: SupabaseAdmin,
  args: {
    listing_id: string;
    listing_type: ListingType;
    billing_mode: 'commission' | 'subscription';
    actor_id: string;
    actor_role: 'host' | 'admin';
  }
): Promise<void> {
  const table = args.listing_type === 'property' ? 'wb_properties' : 'wb_boats';
  const { data: listing } = await db.from(table).select('id, owner_id, billing_mode').eq('id', args.listing_id).single();
  if (!listing) throw new Error('Listing not found');
  if (listing.billing_mode === args.billing_mode) return; // no-op

  await db.from(table).update({ billing_mode: args.billing_mode }).eq('id', args.listing_id);

  await logEvent(db, {
    host_id: listing.owner_id,
    event_type: 'listing_billing_mode_changed',
    actor_id: args.actor_id,
    actor_role: args.actor_role,
    payload: {
      listing_id: args.listing_id,
      listing_type: args.listing_type,
      from: listing.billing_mode,
      to: args.billing_mode,
    },
  });
}

// -----------------------------------------------------------------
// Generate an invoice
// -----------------------------------------------------------------
export async function generateInvoice(
  db: SupabaseAdmin,
  args: { subscription_id: string; cycle?: SubscriptionPlan }
): Promise<SubscriptionInvoice> {
  const settings = await loadBillingSettings(db);
  const { data: sub } = await db.from('wb_host_subscriptions').select('*').eq('id', args.subscription_id).single();
  if (!sub) throw new Error('Subscription not found');

  const cycle: SubscriptionPlan = args.cycle ?? sub.plan;

  // Fetch listings on subscription mode for this host
  const [{ data: props }, { data: boats }] = await Promise.all([
    db.from('wb_properties').select('id, name, created_at').eq('owner_id', sub.host_id).eq('billing_mode', 'subscription').eq('is_published', true),
    db.from('wb_boats').select('id, name, created_at').eq('owner_id', sub.host_id).eq('billing_mode', 'subscription').eq('is_published', true),
  ]);

  const listings: ListingForInvoice[] = [
    ...(props ?? []).map((p: { id: string; name: string; created_at: string }) => ({ listing_id: p.id, listing_type: 'property' as ListingType, listing_name: p.name, created_at: p.created_at })),
    ...(boats ?? []).map((b: { id: string; name: string; created_at: string }) => ({ listing_id: b.id, listing_type: 'boat' as ListingType, listing_name: b.name, created_at: b.created_at })),
  ];

  const monthlyLines = buildInvoiceLineItems(listings, settings);
  const cycleMultiplier = cycle === 'annual' ? settings.annual_paid_months : 1;
  const amountKes = monthlyLines.reduce((acc, x) => acc + x.unit_price_kes, 0) * cycleMultiplier;

  // Scale unit prices if annual (so the PDF shows the cycle price, not monthly)
  const lineItems: SubscriptionInvoiceLineItem[] = monthlyLines.map((l) => ({
    ...l,
    unit_price_kes: l.unit_price_kes * cycleMultiplier,
  }));

  const periodStart = new Date();
  const periodEnd = nextPeriodEnd(periodStart, cycle, settings);
  const dueAt = addDays(periodStart, 14); // net-14

  // invoice_number via SQL function
  const { data: invoiceNum } = await db.rpc('wb_generate_invoice_number');

  const { data: inv, error } = await db
    .from('wb_subscription_invoices')
    .insert({
      invoice_number: invoiceNum,
      host_id: sub.host_id,
      subscription_id: sub.id,
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      billing_cycle: cycle,
      listing_count: listings.length,
      amount_kes: amountKes,
      line_items: lineItems,
      due_at: dueAt.toISOString().slice(0, 10),
      status: 'issued',
    })
    .select('*')
    .single();
  if (error || !inv) throw new Error('Failed to create invoice: ' + error?.message);

  // Bump next_invoice_at on the subscription
  await db.from('wb_host_subscriptions').update({
    next_invoice_at: periodEnd.toISOString().slice(0, 10),
    current_period_start: periodStart.toISOString().slice(0, 10),
    current_period_end: periodEnd.toISOString().slice(0, 10),
    status: sub.status === 'trial' ? 'active' : sub.status,
  }).eq('id', sub.id);

  await logEvent(db, {
    host_id: sub.host_id,
    subscription_id: sub.id,
    invoice_id: inv.id,
    event_type: 'invoice_issued',
    payload: { invoice_number: inv.invoice_number, amount_kes: amountKes, cycle, listing_count: listings.length },
  });

  // Notify host
  await sendHostEmail(db, sub.host_id, invoiceIssuedEmail(inv as SubscriptionInvoice));

  return inv as SubscriptionInvoice;
}

// -----------------------------------------------------------------
// Mark paid
// -----------------------------------------------------------------
export async function markInvoicePaid(
  db: SupabaseAdmin,
  args: { invoice_id: string; method: InvoicePaymentMethod; reference?: string; actor_id: string }
): Promise<void> {
  const { data: inv } = await db.from('wb_subscription_invoices').select('*').eq('id', args.invoice_id).single();
  if (!inv) throw new Error('Invoice not found');
  if (inv.status === 'paid') return;

  await db.from('wb_subscription_invoices').update({
    status: 'paid',
    paid_at: new Date().toISOString(),
    payment_method: args.method,
    payment_reference: args.reference ?? null,
    grace_until: null,
  }).eq('id', args.invoice_id);

  // If subscription was in grace, return to active
  await db.from('wb_host_subscriptions').update({ status: 'active' }).eq('id', inv.subscription_id).in('status', ['grace']);

  await logEvent(db, {
    host_id: inv.host_id,
    subscription_id: inv.subscription_id,
    invoice_id: inv.id,
    event_type: 'invoice_paid',
    actor_id: args.actor_id,
    actor_role: 'admin',
    payload: { method: args.method, reference: args.reference, amount_kes: inv.amount_kes },
  });
}

// -----------------------------------------------------------------
// Cancel subscription (host-initiated or admin)
// -----------------------------------------------------------------
export async function cancelSubscription(
  db: SupabaseAdmin,
  args: { host_id: string; reason?: string; revert_listings: boolean; actor_id: string; actor_role: 'host' | 'admin' }
): Promise<void> {
  const { data: sub } = await db.from('wb_host_subscriptions').select('*').eq('host_id', args.host_id).single();
  if (!sub) return;

  await db.from('wb_host_subscriptions').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: args.reason ?? null,
  }).eq('id', sub.id);

  if (args.revert_listings) {
    await db.from('wb_properties').update({ billing_mode: 'commission' }).eq('owner_id', args.host_id).eq('billing_mode', 'subscription');
    await db.from('wb_boats').update({ billing_mode: 'commission' }).eq('owner_id', args.host_id).eq('billing_mode', 'subscription');
  }

  await logEvent(db, {
    host_id: args.host_id,
    subscription_id: sub.id,
    event_type: 'subscription_cancelled',
    actor_id: args.actor_id,
    actor_role: args.actor_role,
    payload: { reason: args.reason, revert_listings: args.revert_listings },
  });
}

// -----------------------------------------------------------------
// Cron: nightly billing tick
// -----------------------------------------------------------------
export async function runBillingCron(db: SupabaseAdmin, now: Date = new Date()): Promise<{
  trials_ended: number;
  invoices_generated: number;
  invoices_overdue: number;
  invoices_grace: number;
  grace_expired: number;
}> {
  const settings = await loadBillingSettings(db);
  const today = now.toISOString().slice(0, 10);

  // 1. End trials: status='trial' AND trial_ends_at <= now
  const { data: endingTrials } = await db
    .from('wb_host_subscriptions')
    .select('id, host_id')
    .eq('status', 'trial')
    .lte('trial_ends_at', now.toISOString());
  let trials_ended = 0;
  for (const t of endingTrials ?? []) {
    await generateInvoice(db, { subscription_id: t.id });
    await db.from('wb_host_subscriptions').update({ status: 'active' }).eq('id', t.id);
    await logEvent(db, { host_id: t.host_id, subscription_id: t.id, event_type: 'trial_ended' });
    trials_ended++;
  }

  // 2. Generate recurring invoices for active subs whose next_invoice_at <= today
  const { data: dueSubs } = await db
    .from('wb_host_subscriptions')
    .select('id, host_id, plan')
    .eq('status', 'active')
    .lte('next_invoice_at', today);
  let invoices_generated = 0;
  for (const s of dueSubs ?? []) {
    await generateInvoice(db, { subscription_id: s.id });
    invoices_generated++;
  }

  // 3. Mark issued invoices past due as overdue → enter grace
  const { data: overdueInvoices } = await db
    .from('wb_subscription_invoices')
    .select('id, host_id, subscription_id, due_at')
    .eq('status', 'issued')
    .lt('due_at', today);
  let invoices_overdue = 0;
  let invoices_grace = 0;
  for (const inv of overdueInvoices ?? []) {
    const graceUntil = new Date(now.getTime() + settings.grace_period_hours * 3600_000);
    await db.from('wb_subscription_invoices').update({
      status: 'grace',
      grace_until: graceUntil.toISOString(),
    }).eq('id', inv.id);
    await db.from('wb_host_subscriptions').update({ status: 'grace' }).eq('id', inv.subscription_id).neq('status', 'cancelled');
    await logEvent(db, {
      host_id: inv.host_id,
      subscription_id: inv.subscription_id,
      invoice_id: inv.id,
      event_type: 'invoice_overdue_grace_started',
      payload: { grace_until: graceUntil.toISOString() },
    });
    // Fetch the full invoice and email the host
    const { data: fullInv } = await db.from('wb_subscription_invoices').select('*').eq('id', inv.id).single();
    if (fullInv) {
      await sendHostEmail(db, inv.host_id, invoiceOverdueEmail(fullInv as SubscriptionInvoice, graceUntil.toISOString()));
    }
    invoices_overdue++;
    invoices_grace++;
  }

  // 4. Expire grace: invoices in 'grace' with grace_until <= now → revert to commission
  const { data: expiredGrace } = await db
    .from('wb_subscription_invoices')
    .select('id, host_id, subscription_id')
    .eq('status', 'grace')
    .lte('grace_until', now.toISOString());
  let grace_expired = 0;
  for (const inv of expiredGrace ?? []) {
    // Revert all this host's subscription listings to commission
    await db.from('wb_properties').update({ billing_mode: 'commission' }).eq('owner_id', inv.host_id).eq('billing_mode', 'subscription');
    await db.from('wb_boats').update({ billing_mode: 'commission' }).eq('owner_id', inv.host_id).eq('billing_mode', 'subscription');
    // Mark subscription reverted and invoice overdue (void-ish — keep for audit, payable manually)
    await db.from('wb_host_subscriptions').update({ status: 'reverted' }).eq('id', inv.subscription_id);
    await db.from('wb_subscription_invoices').update({ status: 'overdue' }).eq('id', inv.id);
    await logEvent(db, {
      host_id: inv.host_id,
      subscription_id: inv.subscription_id,
      invoice_id: inv.id,
      event_type: 'reverted_to_commission',
    });
    // Notify host of revert
    const { data: subRow } = await db.from('wb_host_subscriptions').select('*').eq('id', inv.subscription_id).single();
    if (subRow) {
      await sendHostEmail(db, inv.host_id, revertedToCommissionEmail(subRow as HostSubscription));
    }
    grace_expired++;
  }

  return { trials_ended, invoices_generated, invoices_overdue, invoices_grace, grace_expired };
}

// -----------------------------------------------------------------
// Billing summary (for /dashboard/billing)
// -----------------------------------------------------------------
export async function getHostBillingSummary(db: SupabaseAdmin, hostId: string) {
  const settings = await loadBillingSettings(db);
  const [{ data: sub }, { count: propCount }, { count: boatCount }, { data: recentInvoices }] = await Promise.all([
    db.from('wb_host_subscriptions').select('*').eq('host_id', hostId).maybeSingle(),
    db.from('wb_properties').select('id', { count: 'exact', head: true }).eq('owner_id', hostId).eq('billing_mode', 'subscription').eq('is_published', true),
    db.from('wb_boats').select('id', { count: 'exact', head: true }).eq('owner_id', hostId).eq('billing_mode', 'subscription').eq('is_published', true),
    db.from('wb_subscription_invoices').select('*').eq('host_id', hostId).order('issued_at', { ascending: false }).limit(12),
  ]);
  const listingCount = (propCount ?? 0) + (boatCount ?? 0);
  return {
    subscription: sub as HostSubscription | null,
    subscription_listing_count: listingCount,
    current_monthly_kes: computeMonthlyChargeKes(listingCount, settings),
    recent_invoices: (recentInvoices ?? []) as SubscriptionInvoice[],
    settings,
  };
}

// -----------------------------------------------------------------
// Date helpers
// -----------------------------------------------------------------
function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function nextPeriodEnd(start: Date, plan: SubscriptionPlan, _settings: BillingSettings): Date {
  return plan === 'annual' ? addMonths(start, 12) : addMonths(start, 1);
}

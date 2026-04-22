import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentPlace } from '@/lib/places/context';
import { adminDb, getHostBillingSummary } from '@/lib/subscriptions/server';
import {
  computeMonthlyChargeKes,
  computeAnnualChargeKes,
  annualSavingsKes,
  annualBreakEvenGrossKes,
  trialMonthsForNewSubscription,
  formatKes,
} from '@/lib/subscriptions/pricing';
import BillingClient from './BillingClient';
import { CreditCard, Check, Sparkles, Calendar, FileText, ArrowRight, Receipt } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/dashboard/billing');

  const { host } = await getCurrentPlace();
  const brandName = host.brand_name;

  const db = adminDb();

  // Host profile for name/phone display
  const { data: profile } = await db.from('wb_profiles').select('id, full_name, email, phone, role').eq('id', user.id).maybeSingle();

  // All listings owned by host, published or not, so we can show per-listing toggles
  const [{ data: properties }, { data: boats }] = await Promise.all([
    db.from('wb_properties').select('id, name, billing_mode, is_published, created_at').eq('owner_id', user.id).order('created_at'),
    db.from('wb_boats').select('id, name, billing_mode, is_published, created_at').eq('owner_id', user.id).order('created_at'),
  ]);

  const summary = await getHostBillingSummary(db, user.id);
  const settings = summary.settings;

  // If no subscription yet, compute what-if for all the host's published listings
  const allPublishedCount =
    (properties ?? []).filter((p: { is_published: boolean }) => p.is_published).length +
    (boats ?? []).filter((b: { is_published: boolean }) => b.is_published).length;
  const whatIfCount = Math.max(allPublishedCount, 1);
  const whatIfMonthly = computeMonthlyChargeKes(whatIfCount, settings);
  const whatIfAnnual = computeAnnualChargeKes(whatIfCount, settings);
  const whatIfSavings = annualSavingsKes(whatIfCount, settings);
  const whatIfBreakEven = annualBreakEvenGrossKes(whatIfCount, 'monthly', settings);
  const trialMonths = trialMonthsForNewSubscription(settings);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">
          {brandName} charges a flat monthly subscription per listing. No commission
          on bookings. Keep 100% of every stay.
        </p>
      </header>

      {/* Status card */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-primary-200,#8bc8ea)]/60 bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] via-white to-white p-6 shadow-sm">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--color-primary-200,#8bc8ea)]/30 blur-2xl pointer-events-none" />
        <div className="relative">
          {summary.subscription ? (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={summary.subscription.status} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {summary.subscription.plan === 'annual' ? 'Annual plan' : 'Monthly plan'}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-gray-900 tabular-nums">{formatKes(summary.current_monthly_kes)}</span>
                  <span className="text-sm text-gray-500">/ month</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {summary.subscription_listing_count} listing{summary.subscription_listing_count === 1 ? '' : 's'} on the subscription
                </p>
                {summary.subscription.status === 'trial' && summary.subscription.trial_ends_at && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary-700,#034078)] bg-white/70 px-2.5 py-1 rounded-full ring-1 ring-[var(--color-primary-200,#8bc8ea)]/60">
                    <Calendar className="h-3 w-3" />
                    Trial ends {new Date(summary.subscription.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {summary.subscription.current_period_end && summary.subscription.status !== 'trial' && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white/70 px-2.5 py-1 rounded-full ring-1 ring-gray-200">
                    <Calendar className="h-3 w-3" />
                    Current period ends {new Date(summary.subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="hidden md:flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary-500,#0a93db)] to-[var(--color-primary-700,#034078)] text-white shadow-lg">
                <CreditCard className="h-9 w-9" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Current plan</p>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">Subscription not activated</h2>
                <p className="text-sm text-gray-600 mt-2 max-w-xl leading-relaxed">
                  Activate your subscription — <strong className="text-gray-900">{formatKes(whatIfMonthly)}/month</strong> for your {whatIfCount} listing{whatIfCount === 1 ? '' : 's'} — and keep 100% of every booking.
                  {trialMonths > 0 && <> Your first <strong className="text-gray-900">{trialMonths} month{trialMonths === 1 ? '' : 's'}</strong> are free.</>}
                </p>
              </div>
              <div className="hidden md:flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 text-white shadow-lg">
                <CreditCard className="h-9 w-9" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Comparison table (only if not yet subscribed) */}
      {!summary.subscription && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Monthly or annual?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlanCard
              title="Monthly"
              price={formatKes(whatIfMonthly)}
              priceNote="/month"
              badge={trialMonths > 0 ? `${trialMonths} mo free` : 'Popular'}
              bullets={[
                trialMonths > 0 ? `${trialMonths}-month free trial` : 'Start immediately',
                'No commission — keep 100% of every booking',
                'No guest service fee — more bookings',
              ]}
              highlighted
            />
            <PlanCard
              title="Annual"
              price={formatKes(whatIfAnnual)}
              priceNote={`/yr · save ${formatKes(whatIfSavings)}`}
              bullets={[
                'Pay for 10 months, get 12',
                `Save ${formatKes(whatIfSavings)} vs monthly`,
                'One invoice, simple accounting',
              ]}
              highlighted={false}
            />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Break-even at {formatKes(whatIfBreakEven)}/yr in bookings vs legacy
            commission platforms.
          </p>
        </section>
      )}

      {/* Client-side activation + per-listing toggles */}
      <BillingClient
        hasSubscription={!!summary.subscription}
        subscriptionStatus={summary.subscription?.status ?? null}
        subscriptionPlan={summary.subscription?.plan ?? null}
        properties={(properties ?? []).map((p: { id: string; name: string; billing_mode: string; is_published: boolean; created_at: string }) => ({ ...p, type: 'property' as const }))}
        boats={(boats ?? []).map((b: { id: string; name: string; billing_mode: string; is_published: boolean; created_at: string }) => ({ ...b, type: 'boat' as const }))}
        hostPhone={profile?.phone ?? null}
        settings={settings}
        trialMonths={trialMonths}
      />

      {/* Invoice history */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] to-[var(--color-primary-100,#bde0f6)] text-[var(--color-primary-700,#034078)] flex items-center justify-center">
            <Receipt className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Invoices</h2>
            <p className="text-[11px] text-gray-500">All your past subscription statements</p>
          </div>
        </div>
        {summary.recent_invoices.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No invoices yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="py-2.5 pr-4 font-semibold">Number</th>
                  <th className="py-2.5 pr-4 font-semibold">Period</th>
                  <th className="py-2.5 pr-4 font-semibold">Amount</th>
                  <th className="py-2.5 pr-4 font-semibold">Due</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {summary.recent_invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 pr-4 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                    <td className="py-3 pr-4 text-gray-700">{formatShortDate(inv.period_start)} – {formatShortDate(inv.period_end)}</td>
                    <td className="py-3 pr-4 font-bold text-gray-900 tabular-nums">{formatKes(inv.amount_kes)}</td>
                    <td className="py-3 pr-4 text-gray-700">{formatShortDate(inv.due_at)}</td>
                    <td className="py-3 pr-4"><InvoiceStatusBadge status={inv.status} /></td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/invoice/${inv.id}`}
                        className="inline-flex items-center gap-1 text-[var(--color-primary-700,#034078)] hover:text-[var(--color-primary-900,#002d5c)] text-xs font-semibold"
                      >
                        View
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PlanCard({
  title,
  price,
  priceNote,
  bullets,
  highlighted,
  badge,
}: {
  title: string;
  price: string;
  priceNote: string;
  bullets: string[];
  highlighted: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl p-5 transition-all ${
        highlighted
          ? 'border-2 border-[var(--color-primary-500,#0a93db)] bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] to-white shadow-md scale-[1.02]'
          : 'border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {badge && (
        <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 bg-gradient-to-r from-[var(--color-primary-600,#0077b6)] to-[var(--color-primary-800,#023e7d)] text-white px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
          <Sparkles className="h-2.5 w-2.5" />
          {badge}
        </span>
      )}
      <div className="text-xs font-bold uppercase tracking-wider text-gray-600">{title}</div>
      <div className="mt-2">
        <span className={`text-3xl font-bold tabular-nums ${highlighted ? 'text-[var(--color-primary-800,#023e7d)]' : 'text-gray-900'}`}>{price}</span>
        <span className="text-sm text-gray-500 ml-1">{priceNote}</span>
      </div>
      <ul className="mt-4 space-y-2.5 text-sm text-gray-700">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 items-start">
            <Check
              className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                highlighted ? 'text-[var(--color-primary-600,#0077b6)]' : 'text-emerald-500'
              }`}
              strokeWidth={3}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { chip: string; dot: string }> = {
    trial:     { chip: 'bg-[var(--color-primary-50,#e8f4fb)] text-[var(--color-primary-800,#023e7d)] ring-[var(--color-primary-200,#8bc8ea)]/60', dot: 'bg-[var(--color-primary-600,#0077b6)]' },
    active:    { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
    grace:     { chip: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
    reverted:  { chip: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400' },
    cancelled: { chip: 'bg-gray-100 text-gray-500 ring-gray-200', dot: 'bg-gray-400' },
  };
  const c = colors[status] ?? { chip: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${c.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot} ${status === 'trial' || status === 'active' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft:   'bg-gray-100 text-gray-700 ring-gray-200',
    issued:  'bg-[var(--color-primary-50,#e8f4fb)] text-[var(--color-primary-800,#023e7d)] ring-[var(--color-primary-200,#8bc8ea)]/60',
    paid:    'bg-emerald-50 text-emerald-800 ring-emerald-200',
    overdue: 'bg-red-50 text-red-800 ring-red-200',
    grace:   'bg-amber-50 text-amber-800 ring-amber-200',
    void:    'bg-gray-100 text-gray-500 ring-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${colors[status] ?? 'bg-gray-100 text-gray-700 ring-gray-200'}`}>
      {status}
    </span>
  );
}

function formatShortDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return s;
  }
}

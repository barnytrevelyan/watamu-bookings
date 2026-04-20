import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
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

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/dashboard/billing');

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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">Choose how Watamu Bookings charges you: a flat monthly fee or 8% commission on bookings.</p>
      </header>

      {/* Status card */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {summary.subscription ? (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge status={summary.subscription.status} />
                <span className="text-sm text-gray-500">
                  {summary.subscription.plan === 'annual' ? 'Annual plan' : 'Monthly plan'}
                </span>
              </div>
              <h2 className="text-xl font-semibold mt-2">
                {formatKes(summary.current_monthly_kes)}
                <span className="text-sm font-normal text-gray-500"> / month · {summary.subscription_listing_count} listing{summary.subscription_listing_count === 1 ? '' : 's'}</span>
              </h2>
              {summary.subscription.status === 'trial' && summary.subscription.trial_ends_at && (
                <p className="text-sm text-gray-600 mt-1">
                  Trial ends <strong>{new Date(summary.subscription.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                </p>
              )}
              {summary.subscription.current_period_end && (
                <p className="text-sm text-gray-600 mt-1">
                  Current period ends <strong>{new Date(summary.subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold">You're on the 8% commission plan</h2>
            <p className="text-sm text-gray-600 mt-1">
              Switch to a flat subscription — <strong>{formatKes(whatIfMonthly)}/month</strong> for your {whatIfCount} listing{whatIfCount === 1 ? '' : 's'} — and keep 100% of each booking.
              {trialMonths > 0 && <> Your first <strong>{trialMonths} month{trialMonths === 1 ? '' : 's'}</strong> are free.</>}
            </p>
          </div>
        )}
      </section>

      {/* Comparison table (only if not yet subscribed) */}
      {!summary.subscription && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Which plan suits you?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PlanCard
              title="Commission"
              price="8%"
              priceNote="per booking"
              bullets={[
                'No fixed cost — pay only when you earn',
                'Best for fewer bookings or trial listings',
                'Standard 8% service fee on each booking',
              ]}
              highlighted={false}
            />
            <PlanCard
              title="Monthly"
              price={formatKes(whatIfMonthly)}
              priceNote="/month"
              bullets={[
                trialMonths > 0 ? `${trialMonths}-month free trial` : 'Start immediately',
                'No guest service fee — more bookings',
                `Break-even at ${formatKes(whatIfBreakEven)}/yr in bookings`,
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
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Invoices</h2>
        {summary.recent_invoices.length === 0 ? (
          <p className="text-sm text-gray-500">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4">Number</th>
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {summary.recent_invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="py-3 pr-4">{formatShortDate(inv.period_start)} – {formatShortDate(inv.period_end)}</td>
                    <td className="py-3 pr-4 font-semibold">{formatKes(inv.amount_kes)}</td>
                    <td className="py-3 pr-4">{formatShortDate(inv.due_at)}</td>
                    <td className="py-3 pr-4"><InvoiceStatusBadge status={inv.status} /></td>
                    <td className="py-3 text-right">
                      <Link href={`/invoice/${inv.id}`} className="text-teal-700 hover:underline text-xs font-semibold">View</Link>
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

function PlanCard({ title, price, priceNote, bullets, highlighted }: { title: string; price: string; priceNote: string; bullets: string[]; highlighted: boolean }) {
  return (
    <div className={`rounded-xl p-5 border ${highlighted ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-sm font-semibold text-gray-700">{title}</div>
      <div className="mt-2">
        <span className="text-2xl font-bold text-gray-900">{price}</span>
        <span className="text-sm text-gray-500 ml-1">{priceNote}</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-gray-700">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2"><span className="text-teal-600">•</span><span>{b}</span></li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    grace: 'bg-amber-100 text-amber-800',
    reverted: 'bg-gray-100 text-gray-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    issued: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    grace: 'bg-amber-100 text-amber-800',
    void: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
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

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { adminDb, loadBillingSettings } from '@/lib/subscriptions/server';
import { formatKes, computeMonthlyChargeKes } from '@/lib/subscriptions/pricing';
import AdminSubscriptionsClient from './AdminSubscriptionsClient';
import type { HostSubscription, SubscriptionInvoice } from '@/lib/subscriptions/types';

export const dynamic = 'force-dynamic';

interface HostRow {
  host_id: string;
  host_name: string | null;
  host_email: string | null;
  subscription: HostSubscription;
  listing_count: number;
  monthly_kes: number;
  outstanding_kes: number;
  next_invoice_at: string | null;
}

export default async function AdminSubscriptionsPage() {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/admin/subscriptions');

  const db = adminDb();
  const { data: profile } = await db.from('wb_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/dashboard');

  const settings = await loadBillingSettings(db);

  const [{ data: subs }, { data: invoices }, { data: signals }] = await Promise.all([
    db.from('wb_host_subscriptions').select('*').order('created_at', { ascending: false }),
    db.from('wb_subscription_invoices').select('*').order('issued_at', { ascending: false }).limit(200),
    db.from('wb_signup_signals').select('id, host_id, ip_subnet, device_hash, captured_at').order('captured_at', { ascending: false }).limit(100),
  ]);

  const hostIds = Array.from(new Set((subs ?? []).map((s: HostSubscription) => s.host_id)));
  const { data: profiles } = hostIds.length
    ? await db.from('wb_profiles').select('id, full_name, email, phone').in('id', hostIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }> };
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Count subscription-mode published listings per host
  const [{ data: props }, { data: boats }] = await Promise.all([
    hostIds.length ? db.from('wb_properties').select('owner_id').in('owner_id', hostIds).eq('billing_mode', 'subscription').eq('is_published', true) : Promise.resolve({ data: [] as Array<{ owner_id: string }> }),
    hostIds.length ? db.from('wb_boats').select('owner_id').in('owner_id', hostIds).eq('billing_mode', 'subscription').eq('is_published', true) : Promise.resolve({ data: [] as Array<{ owner_id: string }> }),
  ]);
  const listingCounts = new Map<string, number>();
  for (const p of props ?? []) listingCounts.set(p.owner_id, (listingCounts.get(p.owner_id) ?? 0) + 1);
  for (const b of boats ?? []) listingCounts.set(b.owner_id, (listingCounts.get(b.owner_id) ?? 0) + 1);

  // Outstanding per host (issued + grace)
  const outstandingByHost = new Map<string, number>();
  for (const inv of invoices ?? []) {
    if (inv.status === 'issued' || inv.status === 'grace' || inv.status === 'overdue') {
      outstandingByHost.set(inv.host_id, (outstandingByHost.get(inv.host_id) ?? 0) + Number(inv.amount_kes));
    }
  }

  const rows: HostRow[] = (subs ?? []).map((s: HostSubscription) => {
    const p = profileMap.get(s.host_id);
    const count = listingCounts.get(s.host_id) ?? 0;
    return {
      host_id: s.host_id,
      host_name: p?.full_name ?? null,
      host_email: p?.email ?? null,
      subscription: s,
      listing_count: count,
      monthly_kes: computeMonthlyChargeKes(count, settings),
      outstanding_kes: outstandingByHost.get(s.host_id) ?? 0,
      next_invoice_at: s.next_invoice_at,
    };
  });

  // KPIs
  const activeRows = rows.filter((r) => r.subscription.status === 'active' || r.subscription.status === 'trial');
  const mrr = activeRows.reduce((acc, r) => acc + r.monthly_kes, 0);
  const arr = mrr * 12;
  const trialsCount = rows.filter((r) => r.subscription.status === 'trial').length;
  const graceCount = rows.filter((r) => r.subscription.status === 'grace').length;
  const revertedCount = rows.filter((r) => r.subscription.status === 'reverted').length;
  const outstandingTotal = rows.reduce((acc, r) => acc + r.outstanding_kes, 0);

  // Flag reviews: hosts with soft signals from more than one host at same device/subnet
  const deviceCounts = new Map<string, Set<string>>();
  const subnetCounts = new Map<string, Set<string>>();
  for (const s of signals ?? []) {
    if (s.device_hash) {
      if (!deviceCounts.has(s.device_hash)) deviceCounts.set(s.device_hash, new Set());
      deviceCounts.get(s.device_hash)!.add(s.host_id);
    }
    if (s.ip_subnet) {
      if (!subnetCounts.has(s.ip_subnet)) subnetCounts.set(s.ip_subnet, new Set());
      subnetCounts.get(s.ip_subnet)!.add(s.host_id);
    }
  }
  const reviewQueue: Array<{ kind: 'device' | 'subnet'; key: string; host_ids: string[]; host_names: string[] }> = [];
  for (const [hash, hosts] of deviceCounts) {
    if (hosts.size > 1) {
      reviewQueue.push({ kind: 'device', key: hash.slice(0, 12) + '…', host_ids: Array.from(hosts), host_names: Array.from(hosts).map((h) => profileMap.get(h)?.full_name ?? h.slice(0, 8)) });
    }
  }
  for (const [subnet, hosts] of subnetCounts) {
    if (hosts.size > 2) {
      reviewQueue.push({ kind: 'subnet', key: subnet, host_ids: Array.from(hosts), host_names: Array.from(hosts).map((h) => profileMap.get(h)?.full_name ?? h.slice(0, 8)) });
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500">Host subscription health, invoices, and anti-abuse flags.</p>
        </div>
        <Link href="/admin" className="text-sm text-teal-700 hover:underline">← Admin home</Link>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Kpi label="MRR" value={formatKes(mrr)} />
        <Kpi label="ARR" value={formatKes(arr)} />
        <Kpi label="Active" value={String(activeRows.length)} />
        <Kpi label="On trial" value={String(trialsCount)} />
        <Kpi label="In grace" value={String(graceCount)} tone={graceCount > 0 ? 'warn' : undefined} />
        <Kpi label="Outstanding" value={formatKes(outstandingTotal)} tone={outstandingTotal > 0 ? 'warn' : undefined} />
      </section>

      {/* Review queue */}
      {reviewQueue.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-amber-900 mb-2">Anti-abuse review queue</h2>
          <ul className="text-sm text-amber-900 space-y-1">
            {reviewQueue.map((r, i) => (
              <li key={i}>
                <strong>{r.kind === 'device' ? 'Shared device' : 'Shared subnet'}</strong> ({r.key}): {r.host_names.join(', ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {revertedCount > 0 && (
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-700">
            <strong>{revertedCount}</strong> host{revertedCount === 1 ? '' : 's'} reverted to commission after grace period expired.
          </p>
        </section>
      )}

      <AdminSubscriptionsClient
        rows={rows}
        invoices={(invoices ?? []) as SubscriptionInvoice[]}
        profiles={Array.from(profileMap.values())}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className={`rounded-xl p-4 border ${tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${tone === 'warn' ? 'text-amber-900' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

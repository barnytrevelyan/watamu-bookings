"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { formatKes } from '@/lib/subscriptions/pricing';
import type { HostSubscription, SubscriptionInvoice } from '@/lib/subscriptions/types';

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

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface Props {
  rows: HostRow[];
  invoices: SubscriptionInvoice[];
  profiles: Profile[];
}

export default function AdminSubscriptionsClient({ rows, invoices, profiles }: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.subscription.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.host_name ?? ''} ${r.host_email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const outstandingInvoices = useMemo(
    () => invoices.filter((i) => i.status === 'issued' || i.status === 'grace' || i.status === 'overdue'),
    [invoices]
  );

  async function runCron() {
    setRunning(true);
    try {
      const res = await fetch('/api/cron/billing', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? 'Cron failed');
        return;
      }
      toast.success(
        `Cron ran: ${json.trials_ended} trials ended, ${json.invoices_generated} invoices, ${json.invoices_grace} → grace, ${json.grace_expired} reverted`
      );
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  async function markPaid(invoice: SubscriptionInvoice) {
    const method = prompt('Payment method? (mpesa / bank_transfer / cash / stripe / waived)', 'mpesa');
    if (!method) return;
    const reference = prompt('Reference (e.g. M-Pesa code, receipt #)?') ?? '';
    setPayingId(invoice.id);
    try {
      const res = await fetch('/api/admin/subscriptions/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoice.id, method, reference }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? 'Mark paid failed');
        return;
      }
      toast.success('Marked paid');
      router.refresh();
    } finally {
      setPayingId(null);
    }
  }

  return (
    <>
      {/* Controls */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-2 items-center">
          <label className="text-xs font-semibold text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="grace">Grace</option>
            <option value="reverted">Reverted</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="search"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-64"
          />
        </div>
        <button
          type="button"
          onClick={runCron}
          disabled={running}
          className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run billing cron now'}
        </button>
      </section>

      {/* Outstanding invoices — quick-action list */}
      {outstandingInvoices.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Outstanding invoices</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4">Invoice</th>
                  <th className="py-2 pr-4">Host</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {outstandingInvoices.map((inv) => {
                  const host = profileMap.get(inv.host_id);
                  return (
                    <tr key={inv.id} className="border-b border-gray-100">
                      <td className="py-3 pr-4 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="py-3 pr-4">
                        <div className="text-sm font-semibold">{host?.full_name ?? inv.host_id.slice(0, 8)}</div>
                        <div className="text-xs text-gray-500">{host?.email ?? ''}</div>
                      </td>
                      <td className="py-3 pr-4 font-semibold">{formatKes(inv.amount_kes)}</td>
                      <td className="py-3 pr-4 text-xs">{new Date(inv.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${inv.status === 'grace' ? 'bg-amber-100 text-amber-800' : inv.status === 'overdue' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/invoice/${inv.id}`} className="text-xs text-teal-700 hover:underline">View</Link>
                          <button
                            type="button"
                            disabled={payingId === inv.id}
                            onClick={() => markPaid(inv)}
                            className="text-xs px-2 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {payingId === inv.id ? '…' : 'Mark paid'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Hosts table */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">All subscriptions</h2>
        {visibleRows.length === 0 ? (
          <p className="text-sm text-gray-500">No hosts match that filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4">Host</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">Listings</th>
                  <th className="py-2 pr-4">Monthly</th>
                  <th className="py-2 pr-4">Outstanding</th>
                  <th className="py-2 pr-4">Next invoice</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.subscription.id} className="border-b border-gray-100">
                    <td className="py-3 pr-4">
                      <div className="text-sm font-semibold">{r.host_name ?? r.host_id.slice(0, 8)}</div>
                      <div className="text-xs text-gray-500">{r.host_email ?? ''}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusTone(r.subscription.status)}`}>
                        {r.subscription.status}
                      </span>
                      {r.subscription.status === 'trial' && r.subscription.trial_ends_at && (
                        <div className="text-[10px] text-gray-500 mt-0.5">ends {new Date(r.subscription.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs">{r.subscription.plan}</td>
                    <td className="py-3 pr-4">{r.listing_count}</td>
                    <td className="py-3 pr-4">{formatKes(r.monthly_kes)}</td>
                    <td className={`py-3 pr-4 ${r.outstanding_kes > 0 ? 'font-semibold text-amber-700' : ''}`}>{formatKes(r.outstanding_kes)}</td>
                    <td className="py-3 pr-4 text-xs">{r.next_invoice_at ? new Date(r.next_invoice_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case 'trial': return 'bg-blue-100 text-blue-800';
    case 'active': return 'bg-green-100 text-green-800';
    case 'grace': return 'bg-amber-100 text-amber-800';
    case 'reverted': return 'bg-gray-100 text-gray-700';
    case 'cancelled': return 'bg-gray-100 text-gray-500';
    default: return 'bg-gray-100 text-gray-700';
  }
}

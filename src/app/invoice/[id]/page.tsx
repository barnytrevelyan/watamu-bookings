import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { adminDb } from '@/lib/subscriptions/server';
import { formatKes } from '@/lib/subscriptions/pricing';
import type { SubscriptionInvoice } from '@/lib/subscriptions/types';

export const dynamic = 'force-dynamic';

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect(`/auth/login?redirect=/invoice/${params.id}`);

  const db = adminDb();
  const { data: invoice } = await db.from('wb_subscription_invoices').select('*').eq('id', params.id).maybeSingle();
  if (!invoice) notFound();

  const { data: profile } = await db.from('wb_profiles').select('role').eq('id', user.id).maybeSingle();
  const isOwner = invoice.host_id === user.id;
  const isAdmin = profile?.role === 'admin';
  if (!isOwner && !isAdmin) notFound();

  const { data: host } = await db.from('wb_profiles').select('full_name, email, phone').eq('id', invoice.host_id).maybeSingle();

  const inv = invoice as SubscriptionInvoice;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 print:py-0 print:px-0 print:max-w-none">
      <header className="flex items-center justify-between mb-6 print:hidden">
        <Link href="/dashboard/billing" className="text-sm text-teal-700 hover:underline">← Billing</Link>
        <button
          type="button"
          onClick={() => { if (typeof window !== 'undefined') window.print(); }}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
        >
          Print / Save as PDF
        </button>
      </header>

      <article className="bg-white rounded-xl border border-gray-200 p-8 print:border-0 print:rounded-none print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold text-teal-700">Watamu Bookings</h1>
            <p className="text-xs text-gray-500 mt-1">www.watamubookings.com</p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-gray-500">Invoice</div>
            <div className="font-mono text-lg font-bold">{inv.invoice_number}</div>
            <div className="mt-2">
              <StatusTag status={inv.status} />
            </div>
          </div>
        </div>

        {/* Bill-to + dates */}
        <div className="grid grid-cols-2 gap-6 py-6 border-b border-gray-200">
          <div>
            <div className="text-xs uppercase text-gray-500 font-semibold">Billed to</div>
            <div className="mt-1 font-semibold">{host?.full_name ?? 'Host'}</div>
            <div className="text-sm text-gray-600">{host?.email ?? ''}</div>
            {host?.phone && <div className="text-sm text-gray-600">{host.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-gray-500 font-semibold">Issued</div>
            <div className="text-sm font-semibold">{fmtDate(inv.issued_at)}</div>
            <div className="text-xs uppercase text-gray-500 font-semibold mt-3">Due</div>
            <div className="text-sm font-semibold">{fmtDate(inv.due_at)}</div>
            <div className="text-xs uppercase text-gray-500 font-semibold mt-3">Period</div>
            <div className="text-sm">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</div>
          </div>
        </div>

        {/* Line items */}
        <div className="py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                <th className="py-2">Listing</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.line_items.map((li) => (
                <tr key={li.listing_id} className="border-b border-gray-100">
                  <td className="py-3">
                    <div className="font-medium">{li.listing_name}</div>
                    <div className="text-xs text-gray-500">{li.listing_type === 'property' ? 'Property' : 'Boat'}{li.is_first_listing ? ' · first listing rate' : ' · additional listing rate'}</div>
                  </td>
                  <td className="py-3 text-right">{formatKes(li.unit_price_kes)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-3 text-right font-semibold">Total ({inv.billing_cycle})</td>
                <td className="py-3 text-right font-bold text-lg">{formatKes(inv.amount_kes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Payment instructions (only if unpaid) */}
        {inv.status !== 'paid' && inv.status !== 'void' && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">How to pay</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li><strong>M-Pesa Paybill:</strong> 4169151 · Account: <span className="font-mono">{inv.invoice_number}</span></li>
              <li><strong>Bank transfer:</strong> reach out to billing@watamubookings.com for details</li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              Please include the invoice number as the reference. Payment is acknowledged within 1 business day.
            </p>
          </div>
        )}

        {inv.status === 'paid' && inv.paid_at && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900">
            Paid on {fmtDate(inv.paid_at)} via {inv.payment_method ?? 'unknown'}{inv.payment_reference ? ` (ref: ${inv.payment_reference})` : ''}.
          </div>
        )}

        {inv.status === 'grace' && inv.grace_until && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            In grace period until {fmtDate(inv.grace_until)}. After this, subscription listings revert to commission.
          </div>
        )}

        <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500">
          Watamu Bookings · billing@watamubookings.com · Questions? Reply to the email this invoice arrived with.
        </footer>
      </article>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
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

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

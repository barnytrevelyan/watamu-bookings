// Plain HTML templates for subscription emails. Kept inline (no MJML/JSX)
// so they work anywhere, and because ZeptoMail accepts raw HTML.
//
// All templates return { subject, html, text }.

import type { SubscriptionInvoice, HostSubscription } from '@/lib/subscriptions/types';
import { formatKes } from '@/lib/subscriptions/pricing';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.watamubookings.com';
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Watamu Bookings';

export interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}

function layout({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.04);">
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#0d7b6c;">${BRAND_NAME}</h1>
    ${body}
    <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
    <p style="font-size:12px;color:#6b7280;margin:0;">
      ${BRAND_NAME} · <a href="${SITE_URL}" style="color:#0d7b6c;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
    </p>
  </div>
</body></html>`;
}

export function invoiceIssuedEmail(invoice: SubscriptionInvoice, hostName?: string): EmailPayload {
  const dueDate = new Date(invoice.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const lines = invoice.line_items.map((li) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${li.listing_name}${li.is_first_listing ? ' <span style="color:#0d7b6c;font-size:11px;">(first listing)</span>' : ''}</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${formatKes(li.unit_price_kes)}</td></tr>`
  ).join('');

  const html = layout({
    title: `Invoice ${invoice.invoice_number}`,
    body: `
      <p>Hi${hostName ? ' ' + hostName : ''},</p>
      <p>Your ${invoice.billing_cycle} subscription invoice is ready.</p>
      <p style="font-size:28px;font-weight:700;margin:16px 0 4px 0;">${formatKes(invoice.amount_kes)}</p>
      <p style="color:#6b7280;margin:0 0 24px 0;">Invoice ${invoice.invoice_number} · due ${dueDate}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${lines}</table>
      <p style="margin-top:24px;">
        <a href="${SITE_URL}/invoice/${invoice.id}" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">View invoice</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">Payment details are on the invoice page. M-Pesa and bank transfer are both accepted.</p>
    `,
  });
  const text = `Invoice ${invoice.invoice_number} for ${formatKes(invoice.amount_kes)} due ${dueDate}. View: ${SITE_URL}/invoice/${invoice.id}`;
  return { subject: `Invoice ${invoice.invoice_number} — ${formatKes(invoice.amount_kes)}`, html, text };
}

export function invoiceOverdueEmail(invoice: SubscriptionInvoice, graceUntilIso: string, hostName?: string): EmailPayload {
  const graceUntil = new Date(graceUntilIso);
  const graceStr = graceUntil.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const html = layout({
    title: 'Payment overdue',
    body: `
      <p>Hi${hostName ? ' ' + hostName : ''},</p>
      <p>Your invoice <strong>${invoice.invoice_number}</strong> (${formatKes(invoice.amount_kes)}) is past due.</p>
      <p><strong>Please settle it by ${graceStr}</strong> or your listings will automatically revert to commission billing.</p>
      <p>
        <a href="${SITE_URL}/invoice/${invoice.id}" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">View &amp; pay invoice</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">If you've already paid, reply to this email with the reference and we'll sort it.</p>
    `,
  });
  const text = `Invoice ${invoice.invoice_number} is overdue. Pay by ${graceStr} or listings revert to commission. ${SITE_URL}/invoice/${invoice.id}`;
  return { subject: `Overdue: invoice ${invoice.invoice_number}`, html, text };
}

export function revertedToCommissionEmail(sub: HostSubscription, hostName?: string): EmailPayload {
  const html = layout({
    title: 'Listings reverted to commission',
    body: `
      <p>Hi${hostName ? ' ' + hostName : ''},</p>
      <p>Because the last invoice wasn't settled within the grace period, we've reverted your listings to the standard 8% commission model. Bookings continue uninterrupted — guests won't notice anything.</p>
      <p>If you'd like to return to a flat subscription, you can restart any time from your billing page:</p>
      <p>
        <a href="${SITE_URL}/dashboard/billing" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Billing settings</a>
      </p>
    `,
  });
  const text = `Listings reverted to commission because the last invoice wasn't paid in time. Restart: ${SITE_URL}/dashboard/billing`;
  return { subject: 'Listings reverted to 8% commission', html, text };
}

export function trialStartedEmail(sub: HostSubscription, trialMonths: number, hostName?: string): EmailPayload {
  const endDate = sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const html = layout({
    title: 'Welcome to subscription billing',
    body: `
      <p>Hi${hostName ? ' ' + hostName : ''},</p>
      <p>Your <strong>${trialMonths}-month free trial</strong> has started. No service fee will be charged to guests during bookings on your listings — more money in your pocket.</p>
      ${endDate ? `<p>Your first invoice will be issued on <strong>${endDate}</strong>.</p>` : ''}
      <p>
        <a href="${SITE_URL}/dashboard/billing" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Manage subscription</a>
      </p>
    `,
  });
  const text = `${trialMonths}-month free trial active. First invoice ${endDate}. ${SITE_URL}/dashboard/billing`;
  return { subject: `Your ${trialMonths}-month trial is active`, html, text };
}

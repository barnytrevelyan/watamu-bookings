// Email templates for the enquiry booking flow (subscription-mode listings).
// Subscription-mode hosts collect their own deposit directly from guests, so
// every booking starts as an enquiry and has to be manually confirmed by the
// host. These templates handle the four touchpoints:
//
//   1. hostEnquiryEmail      — to host when guest sends enquiry
//   2. guestEnquiryAckEmail  — to guest confirming their enquiry was sent
//   3. guestConfirmedEmail   — to guest when host confirms deposit received
//   4. guestDeclinedEmail    — to guest when host declines

import type { EmailPayload } from './templates';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.watamubookings.com';
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Watamu Bookings';
const BRAND_PLACE = process.env.NEXT_PUBLIC_BRAND_PLACE ?? 'Watamu';

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

function fmtKes(n: number | null | undefined): string {
  if (n == null) return '—';
  return `KES ${Number(n).toLocaleString()}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export interface EnquiryContext {
  bookingId: string;
  enquiryToken: string;
  listingName: string;
  listingUrl: string;
  listingType: 'property' | 'boat';
  // Property only
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number;
  // Boat only
  tripDate?: string | null;
  tripName?: string | null;
  // Shared
  guests: number;
  totalPrice: number;
  depositAmount: number;
  depositPercent: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestMessage?: string | null;
  hostName: string;
  hostEmail: string;
  hostPhone: string | null;
}

// ----------------------------------------------------------------------------
// 1. To the host: "You have a new enquiry" — with confirm/decline links
// ----------------------------------------------------------------------------
export function hostEnquiryEmail(ctx: EnquiryContext): EmailPayload {
  const confirmUrl = `${SITE_URL}/booking/${ctx.bookingId}/respond?token=${ctx.enquiryToken}&action=confirm`;
  const declineUrl = `${SITE_URL}/booking/${ctx.bookingId}/respond?token=${ctx.enquiryToken}&action=decline`;

  const datesRow = ctx.listingType === 'property'
    ? `
      <tr><td style="padding:8px 0;color:#6b7280;">Check-in</td><td style="padding:8px 0;text-align:right;font-weight:600;">${fmtDate(ctx.checkIn)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Check-out</td><td style="padding:8px 0;text-align:right;font-weight:600;">${fmtDate(ctx.checkOut)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Nights</td><td style="padding:8px 0;text-align:right;font-weight:600;">${ctx.nights ?? '—'}</td></tr>
    `
    : `
      <tr><td style="padding:8px 0;color:#6b7280;">Trip date</td><td style="padding:8px 0;text-align:right;font-weight:600;">${fmtDate(ctx.tripDate)}</td></tr>
      ${ctx.tripName ? `<tr><td style="padding:8px 0;color:#6b7280;">Trip</td><td style="padding:8px 0;text-align:right;font-weight:600;">${escapeHtml(ctx.tripName)}</td></tr>` : ''}
    `;

  const phoneLink = ctx.guestPhone
    ? `<a href="https://wa.me/${ctx.guestPhone.replace(/[^0-9]/g, '')}" style="color:#0d7b6c;">${escapeHtml(ctx.guestPhone)}</a> (tap to WhatsApp)`
    : '<span style="color:#6b7280;">not provided</span>';

  const html = layout({
    title: 'New booking enquiry',
    body: `
      <p>Hi ${escapeHtml(ctx.hostName)},</p>
      <p>You've got a new booking enquiry for <strong>${escapeHtml(ctx.listingName)}</strong>.</p>

      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 4px 0;font-size:13px;color:#0f766e;font-weight:600;letter-spacing:.02em;">DEPOSIT TO REQUEST</p>
        <p style="margin:0;font-size:26px;font-weight:700;color:#0f766e;">${fmtKes(ctx.depositAmount)}</p>
        <p style="margin:4px 0 0 0;font-size:13px;color:#0f766e;">${ctx.depositPercent}% of ${fmtKes(ctx.totalPrice)} total</p>
      </div>

      <h3 style="margin:24px 0 8px 0;font-size:15px;">Booking details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${datesRow}
        <tr><td style="padding:8px 0;color:#6b7280;">Guests</td><td style="padding:8px 0;text-align:right;font-weight:600;">${ctx.guests}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px 0;font-size:15px;">Guest contact</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b7280;">Name</td><td style="padding:8px 0;text-align:right;font-weight:600;">${escapeHtml(ctx.guestName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;text-align:right;"><a href="mailto:${escapeHtml(ctx.guestEmail)}" style="color:#0d7b6c;">${escapeHtml(ctx.guestEmail)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Phone</td><td style="padding:8px 0;text-align:right;">${phoneLink}</td></tr>
      </table>

      ${ctx.guestMessage ? `
        <h3 style="margin:24px 0 8px 0;font-size:15px;">Message from guest</h3>
        <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #99f6e4;background:#f0fdfa;font-style:italic;color:#334155;">
          ${escapeHtml(ctx.guestMessage)}
        </blockquote>
      ` : ''}

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:24px 0;font-size:14px;color:#78350f;">
        <strong style="display:block;margin-bottom:4px;">What happens next</strong>
        Contact the guest on the details above to arrange the ${fmtKes(ctx.depositAmount)} deposit.
        Once they have paid, tap <strong>Confirm deposit received</strong> below — that locks
        the dates on your calendar and sends the guest their confirmation.
      </div>

      <div style="margin:24px 0;text-align:center;">
        <a href="${confirmUrl}" style="display:inline-block;background:#0d7b6c;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:0 6px 10px 6px;">Confirm deposit received</a>
        <a href="${declineUrl}" style="display:inline-block;background:#fff;color:#991b1b;border:1px solid #fecaca;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:0 6px 10px 6px;">Decline</a>
      </div>

      <p style="color:#6b7280;font-size:13px;text-align:center;">
        Or manage this enquiry from your
        <a href="${SITE_URL}/dashboard/bookings" style="color:#0d7b6c;">host dashboard</a>.
      </p>
    `,
  });

  const text = [
    `New enquiry for ${ctx.listingName}`,
    ``,
    `Deposit to request: ${fmtKes(ctx.depositAmount)} (${ctx.depositPercent}% of ${fmtKes(ctx.totalPrice)} total)`,
    ``,
    ctx.listingType === 'property'
      ? `${fmtDate(ctx.checkIn)} → ${fmtDate(ctx.checkOut)} (${ctx.nights ?? '—'} nights, ${ctx.guests} guests)`
      : `${fmtDate(ctx.tripDate)} — ${ctx.tripName ?? 'trip'}, ${ctx.guests} guests`,
    ``,
    `Guest: ${ctx.guestName}`,
    `Email: ${ctx.guestEmail}`,
    `Phone: ${ctx.guestPhone ?? 'not provided'}`,
    ctx.guestMessage ? `\nMessage: ${ctx.guestMessage}` : '',
    ``,
    `Confirm: ${confirmUrl}`,
    `Decline: ${declineUrl}`,
  ].join('\n');

  return {
    subject: `New enquiry for ${ctx.listingName} — deposit ${fmtKes(ctx.depositAmount)}`,
    html,
    text,
  };
}

// ----------------------------------------------------------------------------
// 2. To the guest: "Enquiry sent, here's the host's contact"
// ----------------------------------------------------------------------------
export function guestEnquiryAckEmail(ctx: EnquiryContext): EmailPayload {
  const hostPhoneLink = ctx.hostPhone
    ? `<a href="https://wa.me/${ctx.hostPhone.replace(/[^0-9]/g, '')}" style="color:#0d7b6c;">${escapeHtml(ctx.hostPhone)}</a> (tap to WhatsApp)`
    : '<span style="color:#6b7280;">Email is the best way to reach this host.</span>';

  const html = layout({
    title: 'Your enquiry has been sent',
    body: `
      <p>Hi ${escapeHtml(ctx.guestName)},</p>
      <p>Your enquiry for <strong>${escapeHtml(ctx.listingName)}</strong> is on its way to the host. They'll usually respond within 24 hours.</p>

      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 4px 0;font-size:13px;color:#0f766e;font-weight:600;letter-spacing:.02em;">DEPOSIT TO SECURE YOUR BOOKING</p>
        <p style="margin:0;font-size:26px;font-weight:700;color:#0f766e;">${fmtKes(ctx.depositAmount)}</p>
        <p style="margin:4px 0 0 0;font-size:13px;color:#0f766e;">${ctx.depositPercent}% of ${fmtKes(ctx.totalPrice)} total · paid directly to the host</p>
      </div>

      <h3 style="margin:24px 0 8px 0;font-size:15px;">Your host</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b7280;">Name</td><td style="padding:8px 0;text-align:right;font-weight:600;">${escapeHtml(ctx.hostName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;text-align:right;"><a href="mailto:${escapeHtml(ctx.hostEmail)}" style="color:#0d7b6c;">${escapeHtml(ctx.hostEmail)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Phone</td><td style="padding:8px 0;text-align:right;">${hostPhoneLink}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px 0;font-size:15px;">What you sent</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${ctx.listingType === 'property'
          ? `
            <tr><td style="padding:8px 0;color:#6b7280;">Dates</td><td style="padding:8px 0;text-align:right;font-weight:600;">${fmtDate(ctx.checkIn)} → ${fmtDate(ctx.checkOut)}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Nights</td><td style="padding:8px 0;text-align:right;font-weight:600;">${ctx.nights ?? '—'}</td></tr>
          `
          : `
            <tr><td style="padding:8px 0;color:#6b7280;">Trip date</td><td style="padding:8px 0;text-align:right;font-weight:600;">${fmtDate(ctx.tripDate)}</td></tr>
            ${ctx.tripName ? `<tr><td style="padding:8px 0;color:#6b7280;">Trip</td><td style="padding:8px 0;text-align:right;font-weight:600;">${escapeHtml(ctx.tripName)}</td></tr>` : ''}
          `
        }
        <tr><td style="padding:8px 0;color:#6b7280;">Guests</td><td style="padding:8px 0;text-align:right;font-weight:600;">${ctx.guests}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Total</td><td style="padding:8px 0;text-align:right;font-weight:600;">${fmtKes(ctx.totalPrice)}</td></tr>
      </table>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:24px 0;font-size:14px;color:#1e3a8a;">
        <strong style="display:block;margin-bottom:4px;">How this works</strong>
        Your dates are <em>not</em> locked yet — they're reserved the moment the host confirms your deposit.
        If you don't hear back within 24 hours, feel free to reach out directly on the details above.
      </div>

      <p style="margin-top:24px;">
        <a href="${SITE_URL}/booking/${ctx.bookingId}" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">View enquiry status</a>
      </p>
    `,
  });

  const text = [
    `Your enquiry for ${ctx.listingName} has been sent.`,
    ``,
    `Deposit to secure your booking: ${fmtKes(ctx.depositAmount)} (${ctx.depositPercent}% of ${fmtKes(ctx.totalPrice)})`,
    ``,
    `Host: ${ctx.hostName}`,
    `Email: ${ctx.hostEmail}`,
    `Phone: ${ctx.hostPhone ?? 'not provided'}`,
    ``,
    `View status: ${SITE_URL}/booking/${ctx.bookingId}`,
  ].join('\n');

  return {
    subject: `Enquiry sent: ${ctx.listingName}`,
    html,
    text,
  };
}

// ----------------------------------------------------------------------------
// 3. To the guest: "Host confirmed — booking is locked in"
// ----------------------------------------------------------------------------
export function guestConfirmedEmail(ctx: EnquiryContext): EmailPayload {
  const html = layout({
    title: 'Your booking is confirmed',
    body: `
      <p>Hi ${escapeHtml(ctx.guestName)},</p>
      <p>Great news — <strong>${escapeHtml(ctx.hostName)}</strong> has confirmed your deposit and locked in your booking for <strong>${escapeHtml(ctx.listingName)}</strong>.</p>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
        <p style="margin:0;font-size:16px;font-weight:600;color:#166534;">Booking confirmed</p>
        <p style="margin:4px 0 0 0;color:#166534;">
          ${ctx.listingType === 'property'
            ? `${fmtDate(ctx.checkIn)} → ${fmtDate(ctx.checkOut)}`
            : `${fmtDate(ctx.tripDate)}${ctx.tripName ? ' · ' + escapeHtml(ctx.tripName) : ''}`
          }
        </p>
      </div>

      <h3 style="margin:24px 0 8px 0;font-size:15px;">Your host</h3>
      <p style="margin:0 0 4px 0;"><strong>${escapeHtml(ctx.hostName)}</strong></p>
      <p style="margin:0;">
        <a href="mailto:${escapeHtml(ctx.hostEmail)}" style="color:#0d7b6c;">${escapeHtml(ctx.hostEmail)}</a>
        ${ctx.hostPhone ? ` · <a href="https://wa.me/${ctx.hostPhone.replace(/[^0-9]/g, '')}" style="color:#0d7b6c;">${escapeHtml(ctx.hostPhone)}</a>` : ''}
      </p>

      <p style="margin-top:24px;">
        <a href="${SITE_URL}/booking/${ctx.bookingId}" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">View booking</a>
      </p>
    `,
  });

  const text = [
    `Your booking for ${ctx.listingName} is confirmed.`,
    ctx.listingType === 'property'
      ? `Dates: ${fmtDate(ctx.checkIn)} → ${fmtDate(ctx.checkOut)}`
      : `Trip: ${fmtDate(ctx.tripDate)}${ctx.tripName ? ' · ' + ctx.tripName : ''}`,
    ``,
    `Host: ${ctx.hostName} — ${ctx.hostEmail}`,
    ``,
    `View: ${SITE_URL}/booking/${ctx.bookingId}`,
  ].join('\n');

  return { subject: `Booking confirmed: ${ctx.listingName}`, html, text };
}

// ----------------------------------------------------------------------------
// 4. To the guest: "Host declined"
// ----------------------------------------------------------------------------
export function guestDeclinedEmail(ctx: EnquiryContext & { declineReason?: string | null }): EmailPayload {
  const html = layout({
    title: 'Your enquiry was declined',
    body: `
      <p>Hi ${escapeHtml(ctx.guestName)},</p>
      <p>Unfortunately <strong>${escapeHtml(ctx.hostName)}</strong> wasn't able to accept your enquiry for <strong>${escapeHtml(ctx.listingName)}</strong> on the dates you requested.</p>

      ${ctx.declineReason ? `
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #fecaca;background:#fef2f2;font-style:italic;color:#991b1b;">
          ${escapeHtml(ctx.declineReason)}
        </blockquote>
      ` : ''}

      <p>Good news — plenty of other hosts in ${BRAND_PLACE} would love to have you. Browse more options below.</p>

      <p style="margin-top:24px;">
        <a href="${SITE_URL}/${ctx.listingType === 'property' ? 'properties' : 'boats'}" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Browse ${ctx.listingType === 'property' ? 'properties' : 'fishing charters'}</a>
      </p>
    `,
  });

  const text = [
    `Your enquiry for ${ctx.listingName} was declined by the host.`,
    ctx.declineReason ? `\nHost note: ${ctx.declineReason}` : '',
    ``,
    `Browse other options: ${SITE_URL}/${ctx.listingType === 'property' ? 'properties' : 'boats'}`,
  ].join('\n');

  return { subject: `Enquiry update: ${ctx.listingName}`, html, text };
}

// ----------------------------------------------------------------------------

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

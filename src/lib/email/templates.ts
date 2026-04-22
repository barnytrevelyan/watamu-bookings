// Plain HTML email templates. Kept inline (no MJML/JSX) so they work
// anywhere, and because ZeptoMail accepts raw HTML.
//
// All templates return { subject, html, text }.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kwetu.ke';
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Kwetu';

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

interface NewListingReviewInput {
  listingId: string;
  listingType: 'property' | 'boat';
  listingName: string;
  hostName?: string | null;
  hostEmail?: string | null;
  placeName?: string | null;
}

export function newListingForReviewEmail(input: NewListingReviewInput): EmailPayload {
  const kind = input.listingType === 'boat' ? 'Boat' : 'Property';
  const reviewUrl = `${SITE_URL}/admin/submissions`;
  const hostLine = input.hostName
    ? `${input.hostName}${input.hostEmail ? ` &lt;${input.hostEmail}&gt;` : ''}`
    : (input.hostEmail ?? 'Unknown host');
  const placeLine = input.placeName ? `<p style="margin:0 0 8px 0;"><strong>Destination:</strong> ${input.placeName}</p>` : '';

  const html = layout({
    title: `New ${kind.toLowerCase()} listing awaiting review`,
    body: `
      <p><strong>A new ${kind.toLowerCase()} listing has been submitted for review.</strong></p>
      <p style="margin:0 0 8px 0;"><strong>Listing:</strong> ${input.listingName}</p>
      <p style="margin:0 0 8px 0;"><strong>Host:</strong> ${hostLine}</p>
      ${placeLine}
      <p style="margin:0 0 24px 0;"><strong>Listing ID:</strong> <code>${input.listingId}</code></p>
      <p>
        <a href="${reviewUrl}" style="display:inline-block;background:#0d7b6c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Review in admin</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">Approve or reject at ${reviewUrl}.</p>
    `,
  });
  const text = `New ${kind.toLowerCase()} listing awaiting review: "${input.listingName}" (${input.listingId}) by ${hostLine}. Review: ${reviewUrl}`;
  return { subject: `[${BRAND_NAME}] ${kind} pending review — ${input.listingName}`, html, text };
}

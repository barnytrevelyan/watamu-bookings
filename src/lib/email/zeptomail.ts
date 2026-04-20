// ZeptoMail sender — thin wrapper around ZeptoMail's transactional API.
// Call sites import `sendTransactional({ to, subject, html, text? })`.
//
// If ZEPTOMAIL_API_KEY or ZEPTOMAIL_FROM is not set, `sendTransactional`
// logs the payload to the server console and returns { ok: true, simulated: true }
// — safe for local dev and safe to deploy even before the ZeptoMail
// account is wired up. Once Barny provisions credentials, set:
//
//   ZEPTOMAIL_API_KEY=Zoho-enczapikey ...
//   ZEPTOMAIL_FROM=billing@watamubookings.com
//   ZEPTOMAIL_FROM_NAME="Watamu Bookings"
//
// and emails will start flowing.

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailInput {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
}

export interface SendEmailResult {
  ok: boolean;
  simulated?: boolean;
  message_id?: string;
  error?: string;
}

export async function sendTransactional(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.ZEPTOMAIL_API_KEY;
  const fromEmail = process.env.ZEPTOMAIL_FROM ?? 'billing@watamubookings.com';
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? 'Watamu Bookings';
  const host = process.env.ZEPTOMAIL_HOST ?? 'api.zeptomail.com';

  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  if (!apiKey) {
    console.warn('[email] ZEPTOMAIL_API_KEY not set — simulating send', {
      to: recipients.map((r) => r.email),
      subject: input.subject,
    });
    return { ok: true, simulated: true };
  }

  const body = {
    from: { address: fromEmail, name: fromName },
    to: recipients.map((r) => ({ email_address: { address: r.email, name: r.name ?? r.email } })),
    subject: input.subject,
    htmlbody: input.html,
    textbody: input.text,
    ...(input.cc ? { cc: input.cc.map((r) => ({ email_address: { address: r.email, name: r.name ?? r.email } })) } : {}),
    ...(input.bcc ? { bcc: input.bcc.map((r) => ({ email_address: { address: r.email, name: r.name ?? r.email } })) } : {}),
    ...(input.reply_to ? { reply_to: [{ address: input.reply_to }] } : {}),
  };

  try {
    const res = await fetch(`https://${host}/v1.1/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey.startsWith('Zoho-enczapikey') ? apiKey : `Zoho-enczapikey ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[email] ZeptoMail send failed', res.status, json);
      return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, message_id: json?.data?.[0]?.message_id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'send failed';
    console.error('[email] ZeptoMail exception', err);
    return { ok: false, error: msg };
  }
}

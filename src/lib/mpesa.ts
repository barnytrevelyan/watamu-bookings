/**
 * Safaricom Daraja API integration for M-Pesa STK Push.
 *
 * Environment variables required:
 *   MPESA_ENV             — "sandbox" | "production"
 *   MPESA_CONSUMER_KEY    — Daraja app consumer key
 *   MPESA_CONSUMER_SECRET — Daraja app consumer secret
 *   MPESA_SHORTCODE       — Business short code (paybill / till)
 *   MPESA_PASSKEY         — Online passkey provided by Safaricom
 *   MPESA_CALLBACK_URL    — Public URL that receives M-Pesa callbacks
 */

// ----- Base URLs -----

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const PRODUCTION_BASE = 'https://api.safaricom.co.ke';

function getBaseUrl(): string {
  return process.env.MPESA_ENV === 'production'
    ? PRODUCTION_BASE
    : SANDBOX_BASE;
}

// ----- OAuth access token -----

interface AccessTokenResponse {
  access_token: string;
  expires_in: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`,
  ).toString('base64');

  const res = await fetch(
    `${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`M-Pesa OAuth failed (${res.status}): ${body}`);
  }

  const data: AccessTokenResponse = await res.json();

  cachedToken = {
    token: data.access_token,
    // Expire 60 s before the real expiry to be safe
    expiresAt: Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000,
  };

  return cachedToken.token;
}

// ----- STK Push (Lipa Na M-Pesa Online) -----

function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function generatePassword(timestamp: string): string {
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/**
 * Normalize a Kenyan phone number to the 2547XXXXXXXX format.
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  }
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

export interface STKPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/**
 * Trigger an STK push to the customer's phone.
 *
 * @param phone   — Customer phone number (e.g. 0712345678, +254712345678)
 * @param amount  — Amount in KES (whole number)
 * @param bookingId — Internal booking reference
 */
export async function initiateSTKPush(
  phone: string,
  amount: number,
  bookingId: string,
): Promise<STKPushResult> {
  const token = await getAccessToken();
  const timestamp = generateTimestamp();
  const password = generatePassword(timestamp);
  const shortcode = process.env.MPESA_SHORTCODE!;

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: normalizePhone(phone),
    PartyB: shortcode,
    PhoneNumber: normalizePhone(phone),
    CallBackURL: process.env.MPESA_CALLBACK_URL!,
    AccountReference: bookingId,
    TransactionDesc: `Watamu Bookings payment for ${bookingId}`,
  };

  const res = await fetch(
    `${getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`M-Pesa STK Push failed (${res.status}): ${body}`);
  }

  const data: STKPushResult = await res.json();

  if (data.ResponseCode !== '0') {
    throw new Error(
      `M-Pesa STK Push rejected: ${data.ResponseDescription}`,
    );
  }

  return data;
}

// ----- STK Push query (check transaction status) -----

export interface STKQueryResult {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

export async function querySTKPush(
  checkoutRequestId: string,
): Promise<STKQueryResult> {
  const token = await getAccessToken();
  const timestamp = generateTimestamp();
  const password = generatePassword(timestamp);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE!,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await fetch(
    `${getBaseUrl()}/mpesa/stkpushquery/v1/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`M-Pesa STK Query failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ----- Callback payload types -----

export interface MpesaCallbackItem {
  Name: string;
  Value: string | number;
}

export interface MpesaCallbackBody {
  stkCallback: {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResultCode: number;
    ResultDesc: string;
    CallbackMetadata?: {
      Item: MpesaCallbackItem[];
    };
  };
}

/**
 * Extract useful fields from a callback payload.
 */
export function parseCallback(body: MpesaCallbackBody) {
  const cb = body.stkCallback;
  const items = cb.CallbackMetadata?.Item ?? [];

  const get = (name: string) =>
    items.find((i) => i.Name === name)?.Value ?? null;

  return {
    merchantRequestId: cb.MerchantRequestID,
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc,
    success: cb.ResultCode === 0,
    amount: get('Amount') as number | null,
    receiptNumber: get('MpesaReceiptNumber') as string | null,
    transactionDate: get('TransactionDate') as string | null,
    phoneNumber: get('PhoneNumber') as string | null,
  };
}

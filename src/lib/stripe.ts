import Stripe from 'stripe';
import { loadStripe, type Stripe as StripeClient } from '@stripe/stripe-js';
import type { Currency } from './types';

// ----- Server-side Stripe instance -----

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
  typescript: true,
});

// ----- Client-side Stripe loader (singleton) -----

let stripePromise: Promise<StripeClient | null> | null = null;

export function getStripe(): Promise<StripeClient | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}

// ----- Currency helpers -----

const EXCHANGE_RATES: Record<Currency, number> = {
  KES: 1,
  USD: 0.0065,
  EUR: 0.0060,
  GBP: 0.0052,
};

/**
 * Convert an amount from KES to the target currency.
 */
export function convertFromKES(amountKES: number, target: Currency): number {
  if (target === 'KES') return amountKES;
  return Math.round(amountKES * EXCHANGE_RATES[target] * 100) / 100;
}

/**
 * Convert an amount from the source currency to KES.
 */
export function convertToKES(amount: number, source: Currency): number {
  if (source === 'KES') return amount;
  return Math.round(amount / EXCHANGE_RATES[source]);
}

/**
 * Map our currency codes to Stripe's lowercase ISO codes.
 */
function stripeCurrency(currency: Currency): string {
  return currency.toLowerCase();
}

/**
 * Stripe expects amounts in the smallest currency unit.
 * KES, USD, EUR, GBP all use 100 subunits (cents / pence).
 */
function toSmallestUnit(amount: number): number {
  return Math.round(amount * 100);
}

// ----- Payment intent creation -----

export interface CreatePaymentIntentParams {
  bookingId: string;
  amount: number;
  currency: Currency;
  customerEmail: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export default stripe;

export async function createPaymentIntent({
  bookingId,
  amount,
  currency,
  customerEmail,
  description,
  metadata,
}: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
  const intent = await stripe.paymentIntents.create({
    amount: toSmallestUnit(amount),
    currency: stripeCurrency(currency),
    receipt_email: customerEmail,
    description:
      description ??
      `${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Watamu Bookings'} — Booking ${bookingId}`,
    metadata: {
      booking_id: bookingId,
      platform: process.env.NEXT_PUBLIC_BRAND_SLUG ?? 'watamu_bookings',
      ...metadata,
    },
  });

  return {
    clientSecret: intent.client_secret!,
    paymentIntentId: intent.id,
  };
}

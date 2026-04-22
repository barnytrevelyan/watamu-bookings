/**
 * Dual-currency display layer.
 *
 * Prices in the database are stored in **KES** (the settlement currency —
 * M-Pesa pays out in KES and the Stripe account is a Kenyan account).
 * Everything guest-facing on the site can optionally be displayed in a
 * different currency via a `kwetu-currency` cookie set by the navbar
 * toggle.
 *
 * Scope:
 *  - Guest-facing displays (search cards, listing sidebars, pricing tiles)
 *    read the preferred currency and render using `formatPrice`.
 *  - The booking/checkout flow and the admin/host dashboards stay in KES
 *    so nothing gets lost in translation when money actually moves — the
 *    charge to the card/phone is always KES.
 *
 * FX rates are static for now. A follow-up should move them to
 * `wb_settings` (see `src/lib/types.ts` Settings row) with a nightly refresh
 * from an FX source. Until then these are approximations; the rendered
 * price is described as "approx." in the toggle UI.
 */

import type { Currency } from '@/lib/types';

/** Exported so client components can enumerate options without duplicating
 * the list. Order is the display order in the navbar toggle. */
export const CURRENCIES: Currency[] = ['KES', 'USD', 'GBP', 'EUR'];

export const CURRENCY_LABELS: Record<Currency, { code: Currency; symbol: string; name: string; flag: string }> = {
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan shillings', flag: '🇰🇪' },
  USD: { code: 'USD', symbol: '$', name: 'US dollars', flag: '🇺🇸' },
  GBP: { code: 'GBP', symbol: '£', name: 'British pounds', flag: '🇬🇧' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euros', flag: '🇪🇺' },
};

/**
 * KES → target-currency rates. Stored as "how much 1 unit of KES is worth
 * in the target currency" so multiplication works directly:
 *   `displayAmount = kesAmount * RATES[target]`
 *
 * Approximate mid-market rates, mid-April 2026. Refine in wb_settings.
 */
export const FX_RATES_FROM_KES: Record<Currency, number> = {
  KES: 1,
  USD: 1 / 130, // ~130 KES per USD
  GBP: 1 / 165, // ~165 KES per GBP
  EUR: 1 / 140, // ~140 KES per EUR
};

/** Locale used by Intl for each currency. Keeps number grouping sensible
 * (en-KE groups with commas, en-GB groups with commas, de-DE with dots for
 * Euros, en-US with commas). */
const CURRENCY_LOCALE: Record<Currency, string> = {
  KES: 'en-KE',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'en-IE',
};

export const CURRENCY_COOKIE = 'kwetu-currency';

/** Is this value a supported currency code? */
export function isCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);
}

/** Convert a KES amount to the target currency. Returns the **display value**,
 * i.e. the number to render (rounded to an integer — we don't quote cents on
 * cards). */
export function convertFromKes(kesAmount: number, target: Currency): number {
  if (target === 'KES') return Math.round(kesAmount);
  const rate = FX_RATES_FROM_KES[target] ?? 1;
  return Math.round(kesAmount * rate);
}

/**
 * Format a price held in KES into the target currency.
 *
 *   formatPrice(25000, 'USD') -> "$192"
 *   formatPrice(25000, 'KES') -> "KSh 25,000"
 *   formatPrice(25000, 'GBP') -> "£152"
 *   formatPrice(25000, 'EUR') -> "€179"
 */
export function formatPrice(kesAmount: number, target: Currency = 'KES'): string {
  const display = convertFromKes(kesAmount, target);
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[target], {
      style: 'currency',
      currency: target,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      currencyDisplay: target === 'KES' ? 'symbol' : 'narrowSymbol',
    }).format(display);
  } catch {
    // Older environments don't support `narrowSymbol`. Fall back to symbol.
    return new Intl.NumberFormat(CURRENCY_LOCALE[target], {
      style: 'currency',
      currency: target,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(display);
  }
}


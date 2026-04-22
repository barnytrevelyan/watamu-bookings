/**
 * Server-only currency helpers.
 *
 * Kept separate from `src/lib/currency.ts` so client components can import
 * `CURRENCY_COOKIE`, `formatPrice`, etc. without pulling in `next/headers`
 * (which is server-only and will break the build when reached from a
 * 'use client' module).
 */

import 'server-only';
import { cookies } from 'next/headers';
import type { Currency } from '@/lib/types';
import { CURRENCY_COOKIE, isCurrency } from '@/lib/currency';

/** Read the preferred currency from the `kwetu-currency` cookie on the
 * server. Falls back to KES when no cookie is present or the value is
 * unrecognised. Use inside server components / route handlers only —
 * client components should read `useBrand().preferredCurrency` instead. */
export async function getPreferredCurrency(): Promise<Currency> {
  try {
    const jar = await cookies();
    const raw = jar.get(CURRENCY_COOKIE)?.value;
    if (raw && isCurrency(raw)) return raw;
  } catch {
    // cookies() throws outside a request context — return the default.
  }
  return 'KES';
}

'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlaceFeature } from '@/lib/types';
import type { Currency } from '@/lib/types';
import { CURRENCY_COOKIE, isCurrency } from '@/lib/currency';

export interface BrandDestination {
  slug: string;
  name: string;
}

interface Brand {
  name: string;
  short: string;
  supportEmail: string | null;
  supportWhatsapp: string | null;
  /** Current place name, falls back to brand_short. */
  placeName: string;
  /** Current place slug, null on multi-place shells. */
  placeSlug: string | null;
  /** Features available at the current place; used for nav gating. */
  features: PlaceFeature[];
  /** All user-visible destinations, for the navbar destination switcher. */
  destinations: BrandDestination[];
  /** Guest-facing display currency (prices are stored in KES). Set via the
   *  navbar toggle; persisted in a `kwetu-currency` cookie. */
  preferredCurrency: Currency;
  /** Change the preferred currency. Writes the cookie and triggers a
   *  router refresh so server-rendered price displays update. */
  setPreferredCurrency: (next: Currency) => void;
}

const BrandContext = createContext<Brand | null>(null);

/** Initial-state input — everything except the setter, which we build inside
 *  the provider so it can close over the router. */
export interface BrandProviderValue {
  name: string;
  short: string;
  supportEmail: string | null;
  supportWhatsapp: string | null;
  placeName: string;
  placeSlug: string | null;
  features: PlaceFeature[];
  destinations: BrandDestination[];
  preferredCurrency: Currency;
}

export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandProviderValue;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // Mirror the server-rendered currency in client state so updates feel
  // instant; cookie + refresh take care of server-side rendering next tick.
  const [currency, setCurrency] = useState<Currency>(brand.preferredCurrency);

  const setPreferredCurrency = useCallback(
    (next: Currency) => {
      if (!isCurrency(next)) return;
      // 1 year cookie, site-wide.
      document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      setCurrency(next);
      // Refresh so server components re-render their server-formatted prices.
      router.refresh();
    },
    [router],
  );

  const value = useMemo<Brand>(
    () => ({
      ...brand,
      preferredCurrency: currency,
      setPreferredCurrency,
    }),
    [brand, currency, setPreferredCurrency],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

/** Read brand from context. Safe to call outside a provider — returns sensible
 * Kwetu defaults so pages still render on server if the provider is absent
 * (e.g. during storybook/tests). */
export function useBrand(): Brand {
  const ctx = useContext(BrandContext);
  if (ctx) return ctx;
  return {
    name: 'Kwetu',
    short: 'Kwetu',
    supportEmail: 'hello@kwetu.ke',
    supportWhatsapp: null,
    placeName: 'Kenya',
    placeSlug: null,
    features: [],
    destinations: [],
    preferredCurrency: 'KES',
    setPreferredCurrency: () => {},
  };
}

/** Convenience: does the current place expose this feature? */
export function useHasFeature(feature: PlaceFeature): boolean {
  return useBrand().features.includes(feature);
}

/** Convenience hook for price-rendering components. */
export function useCurrency(): Currency {
  return useBrand().preferredCurrency;
}

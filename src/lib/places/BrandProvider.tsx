'use client';

import { createContext, useContext } from 'react';
import type { PlaceFeature } from '@/lib/types';

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
}

const BrandContext = createContext<Brand | null>(null);

export function BrandProvider({
  brand,
  children,
}: {
  brand: Brand;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
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
  };
}

/** Convenience: does the current place expose this feature? */
export function useHasFeature(feature: PlaceFeature): boolean {
  return useBrand().features.includes(feature);
}

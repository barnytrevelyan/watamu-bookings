'use client';

import { createContext, useContext } from 'react';

interface Brand {
  name: string;
  short: string;
  supportEmail: string | null;
  supportWhatsapp: string | null;
  /** Current place name, falls back to brand_short. */
  placeName: string;
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
  };
}

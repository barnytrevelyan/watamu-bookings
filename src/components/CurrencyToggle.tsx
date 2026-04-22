'use client';

/**
 * Compact currency picker for the top nav. Reads and writes the brand
 * context's `preferredCurrency`; the provider handles cookie persistence
 * and router refresh so server-rendered prices re-fetch.
 *
 * Visual language matches the destination switcher: pill button + menu.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useBrand } from '@/lib/places/BrandProvider';
import { CURRENCIES, CURRENCY_LABELS } from '@/lib/currency';

export default function CurrencyToggle({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { preferredCurrency, setPreferredCurrency } = useBrand();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = CURRENCY_LABELS[preferredCurrency];

  if (variant === 'mobile') {
    return (
      <div className="flex gap-1 p-1 bg-gray-100 rounded-full" role="tablist" aria-label="Display currency">
        {CURRENCIES.map((code) => {
          const active = code === preferredCurrency;
          const info = CURRENCY_LABELS[code];
          return (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPreferredCurrency(code)}
              className={
                (active
                  ? 'bg-white text-[var(--color-primary-700)] shadow-sm ring-1 ring-[var(--color-primary-200)] font-semibold'
                  : 'text-gray-600 hover:text-gray-900 font-medium') +
                ' flex-1 text-center px-2 py-2 text-xs rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-400)]'
              }
              title={info.name}
            >
              {info.flag} {info.code}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-400)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Display currency: ${current.name}`}
      >
        <span aria-hidden="true">{current.flag}</span>
        <span>{current.code}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-lg py-1 animate-scale-in z-50"
        >
          {CURRENCIES.map((code) => {
            const info = CURRENCY_LABELS[code];
            const active = code === preferredCurrency;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setPreferredCurrency(code);
                  setOpen(false);
                }}
                className={
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 ' +
                  (active ? 'text-[var(--color-primary-700)] font-semibold' : 'text-gray-700')
                }
              >
                <span className="text-base" aria-hidden="true">
                  {info.flag}
                </span>
                <span className="flex-1">{info.name}</span>
                <span className="text-xs text-gray-400">{info.code}</span>
              </button>
            );
          })}
          <div className="border-t border-gray-100 my-1" />
          <p className="px-3 py-1.5 text-[11px] leading-snug text-gray-500">
            Charged in KES at checkout. Non-KES prices are approximate.
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';

interface SortSelectProps {
  current?: string;
  options?: { value: string; label: string }[];
}

const DEFAULT_OPTIONS = [
  { value: '', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
];

export default function SortSelect({ current, options = DEFAULT_OPTIONS }: SortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value) {
      params.set('sort', value);
    } else {
      params.delete('sort');
    }
    // Reset to page 1 whenever sort changes
    params.delete('page');
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <select
      name="sort"
      value={current || ''}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] disabled:opacity-60"
      aria-label="Sort results"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

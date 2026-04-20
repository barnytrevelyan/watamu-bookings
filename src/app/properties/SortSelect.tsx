"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Listings sort dropdown.
 * Updates the URL's ?sort=… query param and navigates on change, preserving
 * every other search param. Falls back to a visible Apply button when JS
 * is disabled (progressive enhancement).
 */
export default function SortSelect({ current }: { current?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const value = e.target.value;
    if (value) params.set("sort", value);
    else params.delete("sort");
    params.delete("page"); // reset pagination
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  }

  return (
    <form method="get">
      <select
        name="sort"
        defaultValue={current || ""}
        onChange={handleChange}
        disabled={isPending}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
        aria-label="Sort results"
      >
        <option value="">Recommended</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="rating">Top Rated</option>
        <option value="newest">Newest</option>
      </select>
      <noscript>
        <button type="submit" className="ml-2 text-sm text-teal-600 underline">
          Apply
        </button>
      </noscript>
    </form>
  );
}

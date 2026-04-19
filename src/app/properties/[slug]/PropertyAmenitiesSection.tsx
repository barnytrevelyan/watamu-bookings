"use client";

import { useEffect, useState } from "react";
import {
  Snowflake,
  Plane,
  Car,
  Dog,
  Shirt,
  Wifi,
  Sun,
  Flame,
  Umbrella,
  Trees,
  Eye,
  Waves,
  Coffee,
  Refrigerator,
  UtensilsCrossed,
  Cross,
  Zap,
  ShieldCheck,
  SatelliteDish,
  Tv,
  Thermometer,
  BugOff,
  BedDouble,
  X,
  Check,
  type LucideIcon,
} from "lucide-react";
import type { Amenity } from "@/lib/types";

/**
 * Airbnb-style amenities section.
 * - Renders up to 10 amenities in a 2-column icon grid.
 * - "Show all amenities" opens a modal listing every amenity, grouped by category.
 *
 * The previous version used coloured chip-style badges which don't read as a
 * hotel-grade amenity list — this is the Airbnb idiom: two columns, each row
 * is `[icon][label]` with a faint divider, grouped by category in the modal.
 */

const ICON_MAP: Record<string, LucideIcon> = {
  snowflake: Snowflake,
  plane: Plane,
  car: Car,
  dog: Dog,
  shirt: Shirt,
  wifi: Wifi,
  sun: Sun,
  flame: Flame,
  umbrella: Umbrella,
  "tree-palm": Trees,
  eye: Eye,
  waves: Waves,
  coffee: Coffee,
  refrigerator: Refrigerator,
  "utensils-crossed": UtensilsCrossed,
  cross: Cross,
  zap: Zap,
  shield: ShieldCheck,
  "satellite-dish": SatelliteDish,
  tv: Tv,
  thermometer: Thermometer,
  "bug-off": BugOff,
  "bed-double": BedDouble,
};

const CATEGORY_LABEL: Record<string, string> = {
  general: "Essentials",
  outdoor: "Outdoor",
  kitchen: "Kitchen & dining",
  safety: "Safety",
  entertainment: "Entertainment",
  bathroom: "Bathroom",
  bedroom_amenity: "Bedroom",
  accessibility: "Accessibility",
};

function iconFor(slug?: string | null): LucideIcon {
  if (!slug) return Check;
  return ICON_MAP[slug] ?? Check;
}

function AmenityRow({ amenity }: { amenity: Amenity }) {
  const Icon = iconFor(amenity.icon);
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-b-0">
      <Icon className="w-6 h-6 flex-shrink-0 text-gray-700" strokeWidth={1.6} aria-hidden />
      <span className="text-gray-800 text-[15px]">{amenity.name}</span>
    </div>
  );
}

export default function PropertyAmenitiesSection({ amenities }: { amenities: Amenity[] }) {
  const [open, setOpen] = useState(false);

  // Close modal on Escape and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (amenities.length === 0) return null;

  const previewCount = 10;
  const preview = amenities.slice(0, previewCount);

  // Group full list by category for the modal.
  const byCategory = amenities.reduce<Record<string, Amenity[]>>((acc, a) => {
    const key = a.category || "general";
    (acc[key] ??= []).push(a);
    return acc;
  }, {});

  const categoryOrder = [
    "general",
    "outdoor",
    "kitchen",
    "bedroom_amenity",
    "bathroom",
    "entertainment",
    "safety",
    "accessibility",
  ];
  const sortedCategories = categoryOrder.filter((k) => byCategory[k]?.length);

  return (
    <>
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What this place offers</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
          {preview.map((a) => (
            <AmenityRow key={a.id} amenity={a} />
          ))}
        </div>

        {amenities.length > previewCount && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-6 inline-flex items-center rounded-lg border border-gray-900 px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
          >
            Show all {amenities.length} amenities
          </button>
        )}
      </section>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-8 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="amenities-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl my-auto">
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 id="amenities-dialog-title" className="text-lg font-semibold text-gray-900">
                What this place offers
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            <div className="px-6 py-4">
              {sortedCategories.map((cat) => (
                <div key={cat} className="mb-6 last:mb-0">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    {CATEGORY_LABEL[cat] ?? cat}
                  </h4>
                  <div>
                    {byCategory[cat].map((a) => (
                      <AmenityRow key={a.id} amenity={a} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Check, X } from 'lucide-react';

export interface AmenityOption {
  id: string;
  name: string;
  icon?: string | null;
  category?: string | null;
}

interface AmenityFilterPopoverProps {
  amenities: AmenityOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

/**
 * Dropdown chip picker for amenity filters. Renders as a button showing the
 * currently-selected count, opens a popover with toggle chips grouped by
 * category. Closes on outside click / Escape.
 */
export default function AmenityFilterPopover({
  amenities,
  selected,
  onChange,
  label = 'Amenities',
}: AmenityFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    onChange(next);
  };

  const clear = () => onChange([]);

  // Group by category for visual separation
  const grouped = amenities.reduce<Record<string, AmenityOption[]>>((acc, a) => {
    const cat = a.category || 'general';
    (acc[cat] ||= []).push(a);
    return acc;
  }, {});

  const categoryOrder = [
    'outdoor',
    'general',
    'kitchen',
    'bathroom',
    'entertainment',
    'bedroom_amenity',
    'safety',
  ];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border bg-white text-sm transition-colors ${
          selected.length > 0
            ? 'border-teal-600 text-teal-700 bg-teal-50/50'
            : 'border-gray-200 text-gray-700 hover:border-gray-300'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          {selected.length === 0
            ? 'Any amenities'
            : `${selected.length} selected`}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filter by amenities"
          className="absolute z-40 mt-2 w-[min(92vw,360px)] right-0 sm:left-0 sm:right-auto bg-white rounded-xl shadow-xl border border-gray-200 max-h-[70vh] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Amenities</span>
            <div className="flex items-center gap-2">
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto px-3 py-3 flex-1">
            {sortedCategories.map((cat) => (
              <div key={cat} className="mb-4 last:mb-0">
                <div className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {cat.replace('_', ' ')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {grouped[cat].map((a) => {
                    const active = selected.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggle(a.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        aria-pressed={active}
                      >
                        {active && <Check className="w-3 h-3" />}
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

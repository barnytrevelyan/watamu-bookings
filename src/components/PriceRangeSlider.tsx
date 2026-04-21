'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface PriceRangeSliderProps {
  min?: number;
  max?: number;
  step?: number;
  /** initial / controlled min value */
  value?: [number, number];
  onChange?: (value: [number, number]) => void;
  currency?: string;
  label?: string;
  className?: string;
}

const FMT = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });

/**
 * Dual-handle range slider (Airbnb-style) with two stacked native <input type="range">
 * elements. Handles collision-guard so min can't cross max and vice-versa.
 */
export default function PriceRangeSlider({
  min = 3000,
  max = 300000,
  step = 1000,
  value,
  onChange,
  currency = 'KES',
  label = 'Price per night',
  className = '',
}: PriceRangeSliderProps) {
  // Controlled / uncontrolled bridge — if `value` is passed we use it, otherwise
  // maintain internal state.
  const [internal, setInternal] = useState<[number, number]>(value ?? [min, max]);
  const current = value ?? internal;

  useEffect(() => {
    if (value) setInternal(value);
  }, [value]);

  const updateRange = useCallback(
    (next: [number, number]) => {
      const clamped: [number, number] = [
        Math.max(min, Math.min(next[0], max - step)),
        Math.min(max, Math.max(next[1], min + step)),
      ];
      setInternal(clamped);
      onChange?.(clamped);
    },
    [min, max, step, onChange]
  );

  const [lo, hi] = current;
  const range = max - min;
  const loPct = useMemo(() => ((lo - min) / range) * 100, [lo, min, range]);
  const hiPct = useMemo(() => ((hi - min) / range) * 100, [hi, min, range]);

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <span className="text-sm font-semibold text-gray-900 tabular-nums">
            {currency} {FMT.format(lo)} &ndash; {hi >= max ? `${FMT.format(max)}+` : FMT.format(hi)}
          </span>
        </div>
      )}

      {/* Track + handles */}
      <div className="relative mt-4 h-6 select-none">
        {/* Background track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gray-200" />
        {/* Selected range */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-teal-600"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        {/* Low handle — native input (interaction) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => updateRange([Number(e.target.value), hi])}
          aria-label={`Minimum ${label?.toLowerCase() ?? 'price'}`}
          className="absolute inset-0 w-full h-6 bg-transparent appearance-none pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-teal-600 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-teal-600 [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-grab"
          style={{ zIndex: loPct > 50 ? 5 : 4 }}
        />
        {/* High handle */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => updateRange([lo, Number(e.target.value)])}
          aria-label={`Maximum ${label?.toLowerCase() ?? 'price'}`}
          className="absolute inset-0 w-full h-6 bg-transparent appearance-none pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-teal-600 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-grab [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-teal-600 [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-grab"
          style={{ zIndex: 6 }}
        />
      </div>

      <div className="mt-1 flex justify-between text-[11px] text-gray-500 tabular-nums">
        <span>
          {currency} {FMT.format(min)}
        </span>
        <span>
          {currency} {FMT.format(max)}+
        </span>
      </div>
    </div>
  );
}

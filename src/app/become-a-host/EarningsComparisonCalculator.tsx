'use client';

import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';

// Blended host-facing commission rates. Sources:
// - Kwetu: flat 7.5%, no guest fee.
// - Airbnb: typical host 3% + guest 12–14% — the guest fee depresses what the
//   guest will pay, so the effective host-side loss blends to ~15%.
// - Booking.com: host-side commission commonly 15–18%; 17% is a fair midpoint.
// - FishingBooker: 20% host commission on charters.
const RATES = {
  kwetu: 0.075,
  airbnb: 0.15,
  bookingCom: 0.17,
  fishingBooker: 0.2,
} as const;

type ListingKind = 'stay' | 'charter';

const DEFAULTS: Record<ListingKind, { price: number; bookings: number }> = {
  stay: { price: 15000, bookings: 8 },
  charter: { price: 45000, bookings: 6 },
};

function formatKES(value: number) {
  // Round to the nearest 100 so copy reads cleanly ("KES 1,120,500" not
  // "KES 1,120,537"); exact precision here is a false signal anyway.
  const rounded = Math.round(value / 100) * 100;
  return `KES ${rounded.toLocaleString('en-KE')}`;
}

export default function EarningsComparisonCalculator() {
  const [kind, setKind] = useState<ListingKind>('stay');
  const [price, setPrice] = useState<number>(DEFAULTS.stay.price);
  const [bookings, setBookings] = useState<number>(DEFAULTS.stay.bookings);

  // Reset to sensible defaults when switching listing kind — a 45k/night
  // villa or a 15k charter both read weirdly, so we nudge both sliders
  // when the kind changes.
  const setKindAndReset = (next: ListingKind) => {
    setKind(next);
    setPrice(DEFAULTS[next].price);
    setBookings(DEFAULTS[next].bookings);
  };

  const { grossYear, nets, savingsVsAirbnb, savingsVsBooking, rivalRate } = useMemo(() => {
    const grossMonth = price * bookings;
    const grossYear = grossMonth * 12;
    const nets = {
      kwetu: grossYear * (1 - RATES.kwetu),
      airbnb: grossYear * (1 - RATES.airbnb),
      bookingCom: grossYear * (1 - RATES.bookingCom),
      fishingBooker: grossYear * (1 - RATES.fishingBooker),
    };
    return {
      grossYear,
      nets,
      savingsVsAirbnb: nets.kwetu - nets.airbnb,
      savingsVsBooking: nets.kwetu - nets.bookingCom,
      // For charters the natural rival is FishingBooker, not Airbnb.
      rivalRate: kind === 'charter' ? RATES.fishingBooker : RATES.airbnb,
    };
  }, [price, bookings, kind]);

  // Bar widths are normalised against the highest net (always Kwetu) so the
  // bars tell the story visually at a glance.
  const widthFor = (net: number) => `${Math.round((net / nets.kwetu) * 100)}%`;

  const priceLabel = kind === 'stay' ? 'Avg. nightly price (KES)' : 'Avg. trip price (KES)';
  const bookingsLabel = kind === 'stay' ? 'Booked nights / month' : 'Trips / month';
  const rivalLabel = kind === 'charter' ? 'FishingBooker' : 'Airbnb';
  const savingsVsRival = kind === 'charter' ? nets.kwetu - nets.fishingBooker : savingsVsAirbnb;

  return (
    <section className="bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-teal-600">
            Run your numbers
          </p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            See what you&rsquo;d earn on Kwetu
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            Punch in a rough price and how often you book. We&rsquo;ll show the
            annual take on Kwetu vs. the platforms that take more.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* ----- Controls ----- */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            {/* Listing-kind tabs */}
            <div
              className="mb-6 inline-flex rounded-full bg-gray-100 p-1"
              role="tablist"
              aria-label="Listing type"
            >
              {(['stay', 'charter'] as const).map((k) => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setKindAndReset(k)}
                    className={
                      (active
                        ? 'bg-white text-teal-700 shadow-sm ring-1 ring-teal-200 font-semibold'
                        : 'text-gray-600 hover:text-gray-900 font-medium') +
                      ' px-4 py-1.5 text-sm rounded-full transition-colors'
                    }
                  >
                    {k === 'stay' ? 'Property / stay' : 'Fishing / charter'}
                  </button>
                );
              })}
            </div>

            <SliderField
              label={priceLabel}
              value={price}
              min={kind === 'stay' ? 2000 : 10000}
              max={kind === 'stay' ? 80000 : 200000}
              step={kind === 'stay' ? 500 : 1000}
              onChange={setPrice}
              format={(v) => `KES ${v.toLocaleString('en-KE')}`}
            />

            <div className="mt-6">
              <SliderField
                label={bookingsLabel}
                value={bookings}
                min={1}
                max={30}
                step={1}
                onChange={setBookings}
                format={(v) => `${v}`}
              />
            </div>

            <div className="mt-6 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900">
              Estimated annual gross:{' '}
              <span className="font-semibold">{formatKES(grossYear)}</span>
            </div>
          </div>

          {/* ----- Results ----- */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Annual net to you
                </p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {formatKES(nets.kwetu)}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  after Kwetu&rsquo;s 7.5% commission
                </p>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <TrendingUp className="mr-1 inline h-3.5 w-3.5" />+{formatKES(savingsVsRival)} vs {rivalLabel}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <ComparisonBar
                label={`Kwetu (${(RATES.kwetu * 100).toFixed(1)}%)`}
                net={nets.kwetu}
                width={widthFor(nets.kwetu)}
                tone="win"
              />
              <ComparisonBar
                label={`Airbnb (~${Math.round(RATES.airbnb * 100)}%)`}
                net={nets.airbnb}
                width={widthFor(nets.airbnb)}
                tone="rival"
              />
              <ComparisonBar
                label={`Booking.com (~${Math.round(RATES.bookingCom * 100)}%)`}
                net={nets.bookingCom}
                width={widthFor(nets.bookingCom)}
                tone="rival"
              />
              {kind === 'charter' && (
                <ComparisonBar
                  label={`FishingBooker (~${Math.round(RATES.fishingBooker * 100)}%)`}
                  net={nets.fishingBooker}
                  width={widthFor(nets.fishingBooker)}
                  tone="rival"
                />
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <MiniStat
                label="Extra vs Airbnb / yr"
                value={formatKES(savingsVsAirbnb)}
              />
              <MiniStat
                label="Extra vs Booking.com / yr"
                value={formatKES(savingsVsBooking)}
              />
            </div>

            <p className="mt-5 text-xs text-gray-500">
              Rival commissions use blended host-side averages ({rivalLabel} ~{Math.round(rivalRate * 100)}%); your exact
              rate on other platforms may vary. Gross assumes the same booking
              on either side — Airbnb and Booking.com&rsquo;s guest-side fees
              typically depress what the guest will pay, so real-world savings
              on Kwetu tend to be <em>larger</em> than the chart suggests.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------- subcomponents -------- */

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-semibold text-gray-900">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-teal-600"
      />
      <div className="mt-1 flex justify-between text-[11px] text-gray-400">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function ComparisonBar({
  label,
  net,
  width,
  tone,
}: {
  label: string;
  net: number;
  width: string;
  tone: 'win' | 'rival';
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className={tone === 'win' ? 'font-semibold text-teal-700' : 'text-gray-600'}>
          {label}
        </span>
        <span className={tone === 'win' ? 'font-semibold text-gray-900' : 'text-gray-700'}>
          {formatKES(net)}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={
            tone === 'win'
              ? 'h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600'
              : 'h-full rounded-full bg-gray-300'
          }
          style={{ width }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

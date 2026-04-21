'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, Info } from 'lucide-react';

const FMT = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });

function fmt(n: number) {
  return `KSh ${FMT.format(Math.max(0, Math.round(n)))}`;
}

interface Platform {
  name: string;
  commission: number; // decimal
  colour: string;
  highlight?: boolean;
}

const PLATFORMS: Platform[] = [
  { name: 'Watamu Bookings', commission: 0.08, colour: 'teal', highlight: true },
  { name: 'Airbnb', commission: 0.15, colour: 'rose' },
  { name: 'Booking.com', commission: 0.16, colour: 'sky' },
];

export default function EarningsCalculator() {
  const [rate, setRate] = useState(15000);
  const [nights, setNights] = useState(18);

  const monthlyGross = rate * nights;

  const results = useMemo(() => {
    return PLATFORMS.map((p) => {
      const monthlyNet = monthlyGross * (1 - p.commission);
      const annualNet = monthlyNet * 12;
      return { ...p, monthlyNet, annualNet };
    });
  }, [monthlyGross]);

  const watamuAnnual = results[0].annualNet;
  const savingsVsAirbnb = watamuAnnual - results[1].annualNet;
  const savingsVsBooking = watamuAnnual - results[2].annualNet;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 md:text-3xl">
            See what you&rsquo;d keep
          </h3>
          <p className="mt-2 text-slate-600">
            Adjust the sliders to your situation and compare against the big platforms.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700">
          <TrendingUp className="h-4 w-4" />
          Based on 8% commission
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">
                Average nightly rate
              </label>
              <span className="text-lg font-bold text-slate-900">{fmt(rate)}</span>
            </div>
            <input
              type="range"
              min={3000}
              max={300000}
              step={1000}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="mt-3 w-full accent-teal-600"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>KSh 3,000</span>
              <span>KSh 300,000</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">
                Booked nights per month
              </label>
              <span className="text-lg font-bold text-slate-900">{nights}</span>
            </div>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={nights}
              onChange={(e) => setNights(Number(e.target.value))}
              className="mt-3 w-full accent-teal-600"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>1 night</span>
              <span>30 nights</span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Monthly gross
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {fmt(monthlyGross)}
            </div>
            <div className="mt-1 text-xs text-slate-500 flex items-start gap-1">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Before platform commission, taxes and cleaning fees.</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {results.map((r) => (
            <div
              key={r.name}
              className={`rounded-2xl border p-4 transition ${
                r.highlight
                  ? 'border-teal-200 bg-gradient-to-br from-teal-50 to-white shadow-sm'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    {(r.commission * 100).toFixed(0)}% commission
                  </div>
                </div>
                {r.highlight && (
                  <span className="rounded-full bg-teal-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    You
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Monthly payout
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {fmt(r.monthlyNet)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Annual payout
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {fmt(r.annualNet)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {(savingsVsAirbnb > 0 || savingsVsBooking > 0) && (
            <div className="rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 p-5 text-white">
              <div className="text-xs font-semibold uppercase tracking-wide text-teal-50">
                Extra in your pocket every year
              </div>
              <div className="mt-2 grid gap-1 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-teal-50">vs Airbnb</span>
                  <span className="text-lg font-bold">{fmt(savingsVsAirbnb)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-teal-50">vs Booking.com</span>
                  <span className="text-lg font-bold">{fmt(savingsVsBooking)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

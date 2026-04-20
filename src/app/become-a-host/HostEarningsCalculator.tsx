"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";

/**
 * HostEarningsCalculator
 *
 * A side-by-side "what would I earn on Watamu Bookings vs Airbnb vs
 * Booking.com" calculator. The commission rates we quote here are
 * conservative mid-points of each platform's public ranges:
 *
 *   • Watamu Bookings:  8%   flat host service fee (no guest-side fee)
 *   • Airbnb:           15%  blended (3% host + 12% guest-side split-fee)
 *                            → host nets ~85% of the rate they publish
 *   • Booking.com:      16%  charged to the host on the guest-paid rate
 *
 * We deliberately model this as "the host sets the same nightly rate on
 * all three platforms and wants to know who takes the biggest bite".
 * That's how hosts actually think about it.
 */

const WB_RATE = 0.08;
const AIRBNB_RATE = 0.15;
const BOOKING_RATE = 0.16;

function kes(value: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)));
}

export default function HostEarningsCalculator() {
  const [nightly, setNightly] = useState(15000); // KES
  const [nightsPerMonth, setNightsPerMonth] = useState(18);

  const {
    monthlyGross,
    yearlyGross,
    wbTake,
    airbnbTake,
    bookingTake,
    wbYear,
    airbnbYear,
    bookingYear,
    extraVsAirbnb,
    extraVsBooking,
  } = useMemo(() => {
    const monthlyGross = nightly * nightsPerMonth;
    const yearlyGross = monthlyGross * 12;
    const wbTake = monthlyGross * (1 - WB_RATE);
    const airbnbTake = monthlyGross * (1 - AIRBNB_RATE);
    const bookingTake = monthlyGross * (1 - BOOKING_RATE);
    return {
      monthlyGross,
      yearlyGross,
      wbTake,
      airbnbTake,
      bookingTake,
      wbYear: wbTake * 12,
      airbnbYear: airbnbTake * 12,
      bookingYear: bookingTake * 12,
      extraVsAirbnb: (wbTake - airbnbTake) * 12,
      extraVsBooking: (wbTake - bookingTake) * 12,
    };
  }, [nightly, nightsPerMonth]);

  return (
    <div className="rounded-3xl bg-white shadow-lg ring-1 ring-gray-100 overflow-hidden">
      <div className="bg-gradient-to-br from-[var(--color-primary-500,#14b8a6)] to-[var(--color-primary-700,#0f766e)] text-white px-7 py-5">
        <div className="flex items-center gap-2 text-xs font-medium text-white/80 uppercase tracking-wider mb-1">
          <TrendingUp className="h-3.5 w-3.5" />
          Earnings calculator
        </div>
        <h3 className="text-xl font-semibold">Your coast, your numbers.</h3>
      </div>

      <div className="px-7 py-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Nightly rate
            </label>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {kes(nightly)}
            </span>
          </div>
          <input
            type="range"
            min={3000}
            max={60000}
            step={500}
            value={nightly}
            onChange={(e) => setNightly(parseInt(e.target.value))}
            className="w-full accent-[var(--color-primary-500,#14b8a6)]"
            aria-label="Nightly rate in Kenyan shillings"
          />
          <div className="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>KES 3,000</span>
            <span>KES 60,000</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Booked nights per month
            </label>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {nightsPerMonth} nights
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={nightsPerMonth}
            onChange={(e) => setNightsPerMonth(parseInt(e.target.value))}
            className="w-full accent-[var(--color-primary-500,#14b8a6)]"
            aria-label="Booked nights per month"
          />
          <div className="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>1 night</span>
            <span>30 nights</span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-3 flex items-center justify-between">
            <span>Your monthly payout, after platform fees</span>
            <span className="tabular-nums">{kes(monthlyGross)} gross / mo</span>
          </div>

          <div className="space-y-2.5">
            <PayoutRow
              label="Watamu Bookings"
              subLabel="8% flat host fee"
              amount={wbTake}
              pct={0.08}
              highlight
            />
            <PayoutRow
              label="Airbnb"
              subLabel="~15% blended"
              amount={airbnbTake}
              pct={0.15}
            />
            <PayoutRow
              label="Booking.com"
              subLabel="~16% host commission"
              amount={bookingTake}
              pct={0.16}
            />
          </div>
        </div>

        <div className="rounded-xl bg-[var(--color-primary-50,#f0fdfa)] border border-[var(--color-primary-100,#ccfbf1)] px-5 py-4">
          <div className="text-xs text-[var(--color-primary-700,#0f766e)] font-medium uppercase tracking-wider mb-1">
            That&apos;s an extra
          </div>
          <div className="text-2xl font-bold text-gray-900 tabular-nums">
            {kes(extraVsAirbnb)}
            <span className="text-sm text-gray-500 font-normal"> /year vs Airbnb</span>
          </div>
          <div className="text-sm text-gray-700 mt-1 tabular-nums">
            {kes(extraVsBooking)}{" "}
            <span className="text-gray-500 font-normal">/year vs Booking.com</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
            On {kes(yearlyGross)} of gross bookings per year. Rates shown are
            midpoints of each platform&apos;s public commission bands; actual
            Airbnb and Booking.com fees vary by listing and region.
          </p>
        </div>
      </div>
    </div>
  );
}

function PayoutRow({
  label,
  subLabel,
  amount,
  pct,
  highlight = false,
}: {
  label: string;
  subLabel: string;
  amount: number;
  pct: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-4 py-3 ${
        highlight
          ? "bg-[var(--color-primary-50,#f0fdfa)] ring-1 ring-[var(--color-primary-200,#99f6e4)]"
          : "bg-gray-50/70"
      }`}
    >
      <div>
        <div
          className={`text-sm font-semibold ${
            highlight ? "text-[var(--color-primary-700,#0f766e)]" : "text-gray-900"
          }`}
        >
          {label}
        </div>
        <div className="text-[11px] text-gray-500">{subLabel}</div>
      </div>
      <div className="text-right">
        <div
          className={`text-base font-semibold tabular-nums ${
            highlight ? "text-[var(--color-primary-700,#0f766e)]" : "text-gray-900"
          }`}
        >
          {new Intl.NumberFormat("en-KE", {
            style: "currency",
            currency: "KES",
            maximumFractionDigits: 0,
          }).format(Math.max(0, Math.round(amount)))}
        </div>
        <div className="text-[11px] text-gray-500">after {Math.round(pct * 100)}% fee</div>
      </div>
    </div>
  );
}

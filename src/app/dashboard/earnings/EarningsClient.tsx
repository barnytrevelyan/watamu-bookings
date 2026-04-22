'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import {
  TrendingUp,
  Wallet,
  Receipt,
  Info,
  Home,
  Anchor,
  ArrowRight,
} from 'lucide-react';

interface Booking {
  id: string;
  total_price: number;
  currency: string | null;
  status: string;
  check_in: string | null;
  created_at: string;
  listing_name: string;
  listing_type: 'property' | 'boat';
}

interface Rates {
  kwetu: number;
  airbnb: number;
  bookingCom: number;
  fishingBooker: number;
}

interface Props {
  bookings: Booking[];
  rates: Rates;
}

type Range = 'all' | 'ytd' | '30d' | '90d';

function fmtKES(n: number) {
  return `KES ${Math.round(n).toLocaleString()}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EarningsClient({ bookings, rates }: Props) {
  const [range, setRange] = useState<Range>('all');

  const cutoff = useMemo(() => {
    const now = new Date();
    if (range === '30d') return new Date(now.getTime() - 30 * 864e5);
    if (range === '90d') return new Date(now.getTime() - 90 * 864e5);
    if (range === 'ytd') return new Date(now.getFullYear(), 0, 1);
    return null;
  }, [range]);

  const scoped = useMemo(() => {
    if (!cutoff) return bookings;
    return bookings.filter((b) => new Date(b.created_at) >= cutoff);
  }, [bookings, cutoff]);

  const totals = useMemo(() => {
    const gross = scoped.reduce((s, b) => s + b.total_price, 0);
    return {
      gross,
      commission: gross * rates.kwetu,
      net: gross * (1 - rates.kwetu),
      airbnbNet: gross * (1 - rates.airbnb),
      bookingNet: gross * (1 - rates.bookingCom),
      count: scoped.length,
      savedVsAirbnb: gross * (rates.airbnb - rates.kwetu),
      savedVsBooking: gross * (rates.bookingCom - rates.kwetu),
    };
  }, [scoped, rates]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Earnings</h1>
          <p className="text-sm text-gray-500 mt-1">
            What you net on every booking &mdash; and what you would have lost elsewhere.
          </p>
        </div>
        <RangeSelector range={range} onChange={setRange} />
      </div>

      {/* Top three — gross, commission, net */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <HeroStat
          label="Gross bookings"
          value={fmtKES(totals.gross)}
          sub={`${totals.count} confirmed ${totals.count === 1 ? 'booking' : 'bookings'}`}
          icon={<Receipt className="h-5 w-5" />}
          tone="gray"
        />
        <HeroStat
          label={`Kwetu commission (${(rates.kwetu * 100).toFixed(1)}%)`}
          value={`− ${fmtKES(totals.commission)}`}
          sub="Platform fee"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="amber"
        />
        <HeroStat
          label="You keep"
          value={fmtKES(totals.net)}
          sub={`${((1 - rates.kwetu) * 100).toFixed(1)}% of gross`}
          icon={<Wallet className="h-5 w-5" />}
          tone="teal"
        />
      </div>

      {/* Gross → Net waterfall */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-900">Where your money goes</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          On {fmtKES(totals.gross)} of bookings, Kwetu&rsquo;s {(rates.kwetu * 100).toFixed(1)}% commission leaves you with {fmtKES(totals.net)}.
        </p>
        <div className="mt-5">
          <Waterfall
            gross={totals.gross}
            commission={totals.commission}
            net={totals.net}
          />
        </div>
      </Card>

      {/* Side-by-side with competitors */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              If the same bookings had gone through another platform
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Airbnb&rsquo;s blended take is ~15% (host + guest fees). Booking.com is typically 15&ndash;18% host-side.
              Lower commission = more in your pocket.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400">
            <Info className="h-3.5 w-3.5" /> Indicative rates
          </div>
        </div>

        <div className="space-y-3">
          <CompetitorRow
            label="Kwetu"
            sublabel={`${(rates.kwetu * 100).toFixed(1)}%`}
            net={totals.net}
            maxNet={totals.net}
            tone="teal"
            highlight
          />
          <CompetitorRow
            label="Airbnb"
            sublabel={`${(rates.airbnb * 100).toFixed(0)}% blended`}
            net={totals.airbnbNet}
            maxNet={totals.net}
            tone="rose"
          />
          <CompetitorRow
            label="Booking.com"
            sublabel={`${(rates.bookingCom * 100).toFixed(0)}% host-side`}
            net={totals.bookingNet}
            maxNet={totals.net}
            tone="indigo"
          />
        </div>

        <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
          <p className="text-sm text-teal-900">
            Over this period you kept{' '}
            <span className="font-semibold">{fmtKES(totals.savedVsAirbnb)}</span> more than you would have on Airbnb, and{' '}
            <span className="font-semibold">{fmtKES(totals.savedVsBooking)}</span> more than on Booking.com.
          </p>
        </div>
      </Card>

      {/* Per-booking breakdown */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Per-booking breakdown</h2>
          <span className="text-xs text-gray-500">{scoped.length} rows</span>
        </div>

        {scoped.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-500">No confirmed bookings in this range yet.</p>
            <Link
              href="/dashboard/bookings"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              View all bookings <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-2">Listing</th>
                  <th className="px-2 py-2">Booked</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  <th className="px-2 py-2 text-right">Commission</th>
                  <th className="px-5 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scoped.slice(0, 25).map((b) => {
                  const commission = b.total_price * rates.kwetu;
                  const net = b.total_price - commission;
                  const Icon = b.listing_type === 'boat' ? Anchor : Home;
                  return (
                    <tr key={b.id} className="text-gray-900">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[220px]" title={b.listing_name}>{b.listing_name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(b.created_at)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{fmtKES(b.total_price)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-amber-700">− {fmtKES(commission)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-teal-700">{fmtKES(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {scoped.length > 25 && (
              <p className="px-5 pt-3 text-xs text-gray-400">
                Showing the 25 most recent. {scoped.length - 25} more in this range.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Footnote */}
      <p className="text-[11px] text-gray-400">
        Competitor rates are industry averages &mdash; your actual experience on Airbnb or Booking.com may differ.
        Kwetu&rsquo;s 7.5% is taken from the booking total; there&rsquo;s no separate guest service fee, which also tends to improve conversion.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function RangeSelector({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const options: Array<{ key: Range; label: string }> = [
    { key: 'all', label: 'All time' },
    { key: 'ytd', label: 'YTD' },
    { key: '90d', label: 'Last 90 days' },
    { key: '30d', label: 'Last 30 days' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 self-start">
      {options.map((o) => {
        const active = range === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: 'teal' | 'amber' | 'gray';
}) {
  const toneClass =
    tone === 'teal'
      ? 'bg-teal-50 text-teal-700 ring-teal-100'
      : tone === 'amber'
      ? 'bg-amber-50 text-amber-700 ring-amber-100'
      : 'bg-gray-50 text-gray-600 ring-gray-100';
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${toneClass}`}>
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function Waterfall({ gross, commission, net }: { gross: number; commission: number; net: number }) {
  const max = Math.max(gross, 1);
  const grossW = 100;
  const commissionW = (commission / max) * 100;
  const netW = (net / max) * 100;
  return (
    <div className="space-y-3">
      <Bar label="Gross bookings" value={fmtKES(gross)} widthPct={grossW} barClass="bg-gray-900" labelClass="text-gray-900" />
      <Bar
        label={`Kwetu commission`}
        value={`− ${fmtKES(commission)}`}
        widthPct={commissionW}
        barClass="bg-amber-400"
        labelClass="text-amber-700"
      />
      <Bar
        label="You keep (net)"
        value={fmtKES(net)}
        widthPct={netW}
        barClass="bg-teal-600"
        labelClass="text-teal-700 font-semibold"
      />
    </div>
  );
}

function Bar({
  label,
  value,
  widthPct,
  barClass,
  labelClass,
}: {
  label: string;
  value: string;
  widthPct: number;
  barClass: string;
  labelClass: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className={labelClass}>{label}</span>
        <span className="tabular-nums text-gray-900">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass} transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, widthPct))}%` }}
        />
      </div>
    </div>
  );
}

function CompetitorRow({
  label,
  sublabel,
  net,
  maxNet,
  tone,
  highlight = false,
}: {
  label: string;
  sublabel: string;
  net: number;
  maxNet: number;
  tone: 'teal' | 'rose' | 'indigo';
  highlight?: boolean;
}) {
  const pct = maxNet > 0 ? (net / maxNet) * 100 : 0;
  const barClass =
    tone === 'teal' ? 'bg-teal-600' : tone === 'rose' ? 'bg-rose-400' : 'bg-indigo-400';
  return (
    <div className={highlight ? 'rounded-xl bg-teal-50/50 p-3 ring-1 ring-teal-100' : 'p-3'}>
      <div className="flex items-baseline justify-between mb-1.5 text-sm">
        <div>
          <span className="font-semibold text-gray-900">{label}</span>
          <span className="ml-2 text-xs text-gray-500">{sublabel}</span>
        </div>
        <span className="tabular-nums font-semibold text-gray-900">{fmtKES(net)}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass} transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

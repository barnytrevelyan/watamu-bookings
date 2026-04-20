'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  BarChart3,
  TrendingUp,
  CalendarCheck,
  Wallet,
  Home,
  Anchor,
  Star,
  AlertCircle,
  Activity,
} from 'lucide-react';

interface AnalyticsData {
  totalRevenue: number;
  totalBookings: number;
  averageOccupancy: number;
  revenueByListing: { name: string; type: string; revenue: number }[];
  ratingDistribution: number[];
  monthlyRevenue: { month: string; revenue: number }[];
  monthlyBookings: { month: string; count: number }[];
}

type Period = 'week' | 'month' | 'quarter' | 'year';

export default function OverallAnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('year');
  const [hasListings, setHasListings] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, period]);

  async function fetchAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      const now = new Date();
      let startDate: Date;
      if (period === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === 'quarter') {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), qMonth, 1);
      } else {
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      // Get owner's property and boat IDs
      const [propsRes, boatsRes] = await Promise.all([
        supabase.from('wb_properties').select('id, name').eq('owner_id', user!.id),
        supabase.from('wb_boats').select('id, name').eq('owner_id', user!.id),
      ]);

      const ownerProps = propsRes.data || [];
      const ownerBoats = boatsRes.data || [];
      const propIds = ownerProps.map((p: any) => p.id);
      const boatIds = ownerBoats.map((b: any) => b.id);

      if (propIds.length === 0 && boatIds.length === 0) {
        setHasListings(false);
        setLoading(false);
        return;
      }

      setHasListings(true);

      // Fetch bookings for owner's listings
      const allBookings: any[] = [];

      if (propIds.length > 0) {
        const { data: propBookings } = await supabase
          .from('wb_bookings')
          .select('id, total_price, status, created_at, property_id, boat_id')
          .in('property_id', propIds)
          .gte('created_at', startDate.toISOString());
        if (propBookings) allBookings.push(...propBookings);
      }

      if (boatIds.length > 0) {
        const { data: boatBookings } = await supabase
          .from('wb_bookings')
          .select('id, total_price, status, created_at, property_id, boat_id')
          .in('boat_id', boatIds)
          .gte('created_at', startDate.toISOString());
        if (boatBookings) allBookings.push(...boatBookings);
      }

      // Deduplicate
      const seen = new Set<string>();
      const bookings = allBookings.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });

      // Fetch reviews for owner's listings
      const allReviews: any[] = [];
      if (propIds.length > 0) {
        const { data: propReviews } = await supabase
          .from('wb_reviews')
          .select('rating')
          .in('property_id', propIds);
        if (propReviews) allReviews.push(...propReviews);
      }
      if (boatIds.length > 0) {
        const { data: boatReviews } = await supabase
          .from('wb_reviews')
          .select('rating')
          .in('boat_id', boatIds);
        if (boatReviews) allReviews.push(...boatReviews);
      }

      // Fetch availability for occupancy calc
      const { data: availability } = await supabase
        .from('wb_availability')
        .select('date, is_blocked, property_id')
        .in('property_id', propIds)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', now.toISOString().split('T')[0]);

      const completed = bookings.filter(
        (b) => b.status === 'completed' || b.status === 'confirmed'
      );

      const totalRevenue = completed.reduce(
        (sum, b) => sum + (b.total_price || 0),
        0
      );

      // Build name lookup
      const nameMap: Record<string, { name: string; type: string }> = {};
      ownerProps.forEach((p: any) => { nameMap[p.id] = { name: p.name, type: 'property' }; });
      ownerBoats.forEach((b: any) => { nameMap[b.id] = { name: b.name, type: 'boat' }; });

      // Revenue by listing
      const revenueMap: Record<string, { name: string; type: string; revenue: number }> = {};
      completed.forEach((b: any) => {
        const key = b.property_id || b.boat_id || 'unknown';
        const info = nameMap[key] || { name: 'Unknown', type: 'unknown' };
        if (!revenueMap[key]) {
          revenueMap[key] = { name: info.name, type: info.type, revenue: 0 };
        }
        revenueMap[key].revenue += b.total_price || 0;
      });

      // Rating distribution
      const ratingDist = [0, 0, 0, 0, 0];
      allReviews.forEach((r: any) => {
        if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating - 1]++;
      });

      // Occupancy
      const ownerAvailability = availability || [];
      const totalDays = ownerAvailability.length || 1;
      const bookedDays = ownerAvailability.filter((a: any) => a.is_blocked).length;
      const avgOccupancy = Math.round((bookedDays / totalDays) * 100);

      // Monthly grouping
      const monthlyRevMap: Record<string, number> = {};
      const monthlyCountMap: Record<string, number> = {};
      completed.forEach((b) => {
        const m = b.created_at.substring(0, 7);
        monthlyRevMap[m] = (monthlyRevMap[m] || 0) + (b.total_price || 0);
        monthlyCountMap[m] = (monthlyCountMap[m] || 0) + 1;
      });

      const monthlyRevenue = Object.entries(monthlyRevMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue }));

      const monthlyBookings = Object.entries(monthlyCountMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count }));

      setData({
        totalRevenue,
        totalBookings: bookings.length,
        averageOccupancy: avgOccupancy,
        revenueByListing: Object.values(revenueMap).sort(
          (a, b) => b.revenue - a.revenue
        ),
        ratingDistribution: ratingDist,
        monthlyRevenue,
        monthlyBookings,
      });
    } catch (err) {
      console.error(err);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  const periodLabels: Record<Period, string> = {
    week: 'Last 7 days',
    month: 'This month',
    quarter: 'This quarter',
    year: 'This year',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <AnalyticsHeader period={period} setPeriod={setPeriod} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (!hasListings) {
    return (
      <div className="space-y-6">
        <AnalyticsHeader period={period} setPeriod={setPeriod} />
        <Card className="flex flex-col items-center justify-center p-14 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] to-[var(--color-primary-100,#bde0f6)]">
            <BarChart3 className="h-8 w-8 text-[var(--color-primary-600,#0077b6)]" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">No analytics yet</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md">
            Add your first property or boat to start tracking performance and revenue.
          </p>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <AnalyticsHeader period={period} setPeriod={setPeriod} />
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-800 font-medium">{error || 'No data'}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchAnalytics()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const maxMonthlyRev = Math.max(...data.monthlyRevenue.map((m) => m.revenue), 1);
  const maxMonthlyBookings = Math.max(...data.monthlyBookings.map((m) => m.count), 1);
  const maxListingRev = Math.max(...data.revenueByListing.map((l) => l.revenue), 1);
  const maxRating = Math.max(...data.ratingDistribution, 1);
  const totalReviews = data.ratingDistribution.reduce((a, b) => a + b, 0);
  const avgRating = totalReviews > 0
    ? data.ratingDistribution.reduce((sum, count, i) => sum + count * (i + 1), 0) / totalReviews
    : 0;

  return (
    <div className="space-y-6">
      <AnalyticsHeader period={period} setPeriod={setPeriod} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label="Total revenue"
          value={`KES ${(data.totalRevenue / 1000).toFixed(data.totalRevenue >= 10000 ? 0 : 1)}k`}
          rawValue={`KES ${data.totalRevenue.toLocaleString()}`}
          tone="primary"
          hint={periodLabels[period]}
        />
        <KpiCard
          icon={<CalendarCheck className="h-5 w-5" />}
          label="Total bookings"
          value={data.totalBookings.toString()}
          tone="emerald"
          hint={periodLabels[period]}
        />
        <KpiCard
          icon={<Activity className="h-5 w-5" />}
          label="Avg. occupancy"
          value={`${data.averageOccupancy}%`}
          tone="sandy"
          hint="of booked nights"
        />
        <KpiCard
          icon={<Star className="h-5 w-5" />}
          label="Avg. rating"
          value={avgRating > 0 ? avgRating.toFixed(1) : '—'}
          tone="coral"
          hint={`${totalReviews} ${totalReviews === 1 ? 'review' : 'reviews'}`}
        />
      </div>

      {/* Revenue Over Time */}
      <ChartCard
        icon={<TrendingUp className="h-4 w-4" />}
        title="Revenue over time"
        subtitle="Confirmed and completed bookings"
      >
        {data.monthlyRevenue.length === 0 ? (
          <EmptyChart />
        ) : (
          <div className="flex h-56 items-end gap-2 pt-4">
            {data.monthlyRevenue.map((m) => {
              const h = (m.revenue / maxMonthlyRev) * 100;
              return (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5 group">
                  <span className="text-[11px] font-semibold text-gray-700 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                    {(m.revenue / 1000).toFixed(0)}k
                  </span>
                  <div className="w-full h-full flex items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-[var(--color-primary-600,#0077b6)] to-[var(--color-primary-400,#4ab1dd)] group-hover:from-[var(--color-primary-700,#034078)] group-hover:to-[var(--color-primary-500,#0a93db)] transition-all shadow-sm"
                      style={{
                        height: `${h}%`,
                        minHeight: m.revenue > 0 ? '4px' : '0px',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">
                    {new Date(m.month + '-01').toLocaleDateString('en', { month: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* Bookings Trend */}
      <ChartCard
        icon={<CalendarCheck className="h-4 w-4" />}
        title="Bookings trend"
        subtitle="All bookings in the period"
      >
        {data.monthlyBookings.length === 0 ? (
          <EmptyChart />
        ) : (
          <div className="flex h-40 items-end gap-2 pt-4">
            {data.monthlyBookings.map((m) => {
              const h = (m.count / maxMonthlyBookings) * 100;
              return (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5 group">
                  <span className="text-[11px] font-semibold text-gray-700 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                    {m.count}
                  </span>
                  <div className="w-full h-full flex items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-700 group-hover:to-emerald-500 transition-all shadow-sm"
                      style={{
                        height: `${h}%`,
                        minHeight: m.count > 0 ? '4px' : '0px',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">
                    {new Date(m.month + '-01').toLocaleDateString('en', { month: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Revenue by Listing */}
        <ChartCard
          icon={<Home className="h-4 w-4" />}
          title="Revenue by listing"
          subtitle="Your top earners this period"
        >
          {data.revenueByListing.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="space-y-3.5">
              {data.revenueByListing.map((listing, i) => {
                const pct = (listing.revenue / maxListingRev) * 100;
                const Icon = listing.type === 'boat' ? Anchor : Home;
                return (
                  <div key={i}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-gray-800 font-medium inline-flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-gray-400" />
                        {listing.name}
                      </span>
                      <span className="font-bold text-gray-900 tabular-nums">
                        KES {listing.revenue.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary-500,#0a93db)] to-[var(--color-primary-700,#034078)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>

        {/* Rating Distribution */}
        <ChartCard
          icon={<Star className="h-4 w-4" />}
          title="Rating distribution"
          subtitle="All guest reviews to date"
        >
          {totalReviews === 0 ? (
            <EmptyChart message="No reviews yet" />
          ) : (
            <div className="space-y-2.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = data.ratingDistribution[star - 1];
                const pct = (count / maxRating) * 100;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="w-10 text-sm text-gray-700 tabular-nums font-medium inline-flex items-center gap-0.5">
                      {star}
                      <Star className="h-3 w-3 text-[var(--color-sandy-500,#d4a72c)] fill-[var(--color-sandy-500,#d4a72c)]" />
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--color-sandy-400,#e8c06f)] to-[var(--color-sandy-600,#b88a1a)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm text-gray-600 tabular-nums font-medium">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function AnalyticsHeader({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  const periods: { key: Period; label: string }[] = [
    { key: 'week', label: '7 days' },
    { key: 'month', label: 'Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year', label: 'Year' },
  ];
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Revenue, bookings and performance trends.</p>
      </div>
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              period === p.key
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  rawValue,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  rawValue?: string;
  hint?: string;
  tone: 'primary' | 'emerald' | 'sandy' | 'coral';
}) {
  const tones: Record<typeof tone, { ring: string; iconBg: string; iconText: string }> = {
    primary: { ring: 'ring-[var(--color-primary-100,#bde0f6)]', iconBg: 'bg-[var(--color-primary-50,#e8f4fb)]', iconText: 'text-[var(--color-primary-700,#034078)]' },
    emerald: { ring: 'ring-emerald-100', iconBg: 'bg-emerald-50', iconText: 'text-emerald-700' },
    sandy:   { ring: 'ring-[var(--color-sandy-200,#f2d88f)]/70', iconBg: 'bg-[var(--color-sandy-50,#fdf6e3)]', iconText: 'text-[var(--color-sandy-700,#9c7518)]' },
    coral:   { ring: 'ring-rose-100', iconBg: 'bg-rose-50', iconText: 'text-rose-700' },
  } as any;
  const t = tones[tone];
  return (
    <Card className={`p-5 relative overflow-hidden ring-1 ${t.ring}`} title={rawValue}>
      <div className="flex items-center justify-between mb-3">
        <div className={`h-9 w-9 rounded-xl ${t.iconBg} ${t.iconText} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </Card>
  );
}

function ChartCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] to-[var(--color-primary-100,#bde0f6)] text-[var(--color-primary-700,#034078)] flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function EmptyChart({ message = 'No data for this period' }: { message?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
        <BarChart3 className="h-5 w-5 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

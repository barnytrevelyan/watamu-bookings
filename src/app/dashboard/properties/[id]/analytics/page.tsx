'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
// Select replaced with plain <select> for compatibility
import { StarRating } from '@/components/StarRating';

interface MonthlyData {
  month: string;
  bookings: number;
  revenue: number;
}

interface AnalyticsData {
  propertyName: string;
  totalBookings: number;
  totalRevenue: number;
  averageRating: number;
  reviewCount: number;
  occupancyRate: number;
  monthlyData: MonthlyData[];
  bookingSources: Record<string, number>;
  ratingDistribution: number[];
}

interface FunnelData {
  windowDays: number;
  views: number;
  galleryOpens: number;
  dateChecks: number;
  bookingStarts: number;
  bookingConfirms: number;
  uniqueSessions: number;
  topReferrers: { label: string; count: number }[];
  topPaths: { label: string; count: number }[];
  daily: { date: string; views: number; bookings: number }[];
}

export default function PropertyAnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('year');

  useEffect(() => {
    if (!user) return;
    fetchAnalytics();
    fetchFunnel();
  }, [user, propertyId, period]);

  async function fetchFunnel() {
    setFunnelLoading(true);
    try {
      // Map the period selector to a window in days. Funnel analytics
      // live outside the bookings ledger so they don't need to match
      // the bookings query exactly — 30/90/365 is a good approximation.
      const days = period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
      const res = await fetch(
        `/api/analytics/property-funnel?propertyId=${propertyId}&days=${days}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('funnel fetch failed');
      const json = (await res.json()) as FunnelData;
      setFunnel(json);
    } catch {
      // Funnel is a secondary widget — silently degrade rather than
      // blanking the whole analytics page if the events table is empty
      // or the route errored.
      setFunnel(null);
    } finally {
      setFunnelLoading(false);
    }
  }

  async function fetchAnalytics() {
    try {
      const supabase = createClient();

      const { data: property } = await supabase
        .from('wb_properties')
        .select('name')
        .eq('id', propertyId)
        .eq('owner_id', user!.id)
        .single();

      if (!property) {
        setError('Property not found');
        setLoading(false);
        return;
      }

      // Compute date range
      const now = new Date();
      let startDate: Date;
      if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === 'quarter') {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), qMonth, 1);
      } else {
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      const { data: bookings } = await supabase
        .from('wb_bookings')
        .select('id, check_in, check_out, total_price, status, source, created_at')
        .eq('property_id', propertyId)
        .gte('created_at', startDate.toISOString());

      const { data: reviews } = await supabase
        .from('wb_reviews')
        .select('rating')
        .eq('property_id', propertyId);

      const { data: availability } = await supabase
        .from('wb_availability')
        .select('date, is_blocked')
        .eq('property_id', propertyId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', now.toISOString().split('T')[0]);

      const allBookings = bookings || [];
      const completedBookings = allBookings.filter(
        (b) => b.status === 'completed' || b.status === 'confirmed'
      );

      const totalRevenue = completedBookings.reduce(
        (sum, b) => sum + (b.total_price || 0),
        0
      );

      const allReviews = reviews || [];
      const avgRating =
        allReviews.length > 0
          ? allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length
          : 0;

      // Rating distribution (1-5 stars)
      const ratingDist = [0, 0, 0, 0, 0];
      allReviews.forEach((r) => {
        if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating - 1]++;
      });

      // Occupancy
      const totalDays = (availability || []).length || 1;
      const bookedDays = (availability || []).filter((a) => a.is_blocked).length;
      const occupancyRate = Math.round((bookedDays / totalDays) * 100);

      // Monthly grouping
      const monthlyMap: Record<string, { bookings: number; revenue: number }> = {};
      completedBookings.forEach((b) => {
        const m = b.created_at.substring(0, 7); // YYYY-MM
        if (!monthlyMap[m]) monthlyMap[m] = { bookings: 0, revenue: 0 };
        monthlyMap[m].bookings++;
        monthlyMap[m].revenue += b.total_price || 0;
      });

      const monthlyData = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, vals]) => ({ month, ...vals }));

      // Booking sources
      const sources: Record<string, number> = {};
      allBookings.forEach((b) => {
        const src = b.source || 'direct';
        sources[src] = (sources[src] || 0) + 1;
      });

      setData({
        propertyName: property.name,
        totalBookings: allBookings.length,
        totalRevenue,
        averageRating: Math.round(avgRating * 10) / 10,
        reviewCount: allReviews.length,
        occupancyRate,
        monthlyData,
        bookingSources: sources,
        ratingDistribution: ratingDist,
      });
    } catch (err) {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error || 'No data available'}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const maxMonthlyRevenue = Math.max(...data.monthlyData.map((m) => m.revenue), 1);
  const maxRating = Math.max(...data.ratingDistribution, 1);
  const totalSources = Object.values(data.bookingSources).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push(`/dashboard/properties/${propertyId}`)}>
            &larr; Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500">{data.propertyName}</p>
          </div>
        </div>
        <select className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={period} onChange={(e) => setPeriod(e.target.value as any)}>
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
          <option value="year">This Year</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Bookings</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.totalBookings}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">KES {data.totalRevenue.toLocaleString()}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Occupancy Rate</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.occupancyRate}%</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Average Rating</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-2xl font-bold text-gray-900">{data.averageRating || '—'}</p>
            {data.averageRating > 0 && <StarRating rating={data.averageRating} size="sm" />}
          </div>
          <p className="text-xs text-gray-400">{data.reviewCount} reviews</p>
        </Card>
      </div>

      {/* Views-to-bookings funnel */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Views to bookings</h2>
            <p className="mt-1 text-xs text-gray-500">
              Unique sessions through each stage of the guest funnel.
              {funnel
                ? ` Last ${funnel.windowDays} days.`
                : ''}
            </p>
          </div>
          {funnel && funnel.views > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Conversion</p>
              <p className="text-2xl font-bold text-gray-900">
                {Math.round((funnel.bookingConfirms / funnel.views) * 100)}%
              </p>
            </div>
          )}
        </div>

        {funnelLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : !funnel || funnel.views === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No events recorded yet. Funnel data will appear once guests
            start viewing this listing.
          </p>
        ) : (
          <div className="space-y-3">
            {[
              { label: 'Viewed listing', value: funnel.views, key: 'view' },
              { label: 'Opened gallery', value: funnel.galleryOpens, key: 'gallery' },
              { label: 'Checked dates', value: funnel.dateChecks, key: 'dates' },
              { label: 'Started booking', value: funnel.bookingStarts, key: 'start' },
              { label: 'Confirmed booking', value: funnel.bookingConfirms, key: 'confirm' },
            ].map((stage, i, arr) => {
              const pct = funnel.views > 0 ? (stage.value / funnel.views) * 100 : 0;
              const stepDrop =
                i > 0 && arr[i - 1].value > 0
                  ? Math.round(((arr[i - 1].value - stage.value) / arr[i - 1].value) * 100)
                  : 0;
              return (
                <div key={stage.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-700">{stage.label}</span>
                    <span className="text-gray-500">
                      {stage.value}
                      {i > 0 && stepDrop > 0 && (
                        <span className="ml-2 text-xs text-gray-400">
                          −{stepDrop}% from prev
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary-500)]"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {funnel && (funnel.topReferrers.length > 0 || funnel.topPaths.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Top referrers</h2>
            {funnel.topReferrers.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No referrer data yet</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {funnel.topReferrers.map((r) => (
                  <li key={r.label} className="flex items-center justify-between">
                    <span className="truncate text-gray-700">{r.label}</span>
                    <span className="text-gray-500">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Top landing paths</h2>
            {funnel.topPaths.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No path data yet</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {funnel.topPaths.map((p) => (
                  <li key={p.label} className="flex items-center justify-between">
                    <span className="truncate text-gray-700">{p.label}</span>
                    <span className="text-gray-500">{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Monthly Bookings Chart */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Revenue Over Time</h2>
        {data.monthlyData.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No data for this period</p>
        ) : (
          <div className="flex h-48 items-end gap-2">
            {data.monthlyData.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-gray-700">
                  KES {(m.revenue / 1000).toFixed(0)}k
                </span>
                <div
                  className="w-full rounded-t bg-teal-500"
                  style={{
                    height: `${(m.revenue / maxMonthlyRevenue) * 100}%`,
                    minHeight: m.revenue > 0 ? '4px' : '0px',
                  }}
                />
                <span className="text-xs text-gray-500">
                  {new Date(m.month + '-01').toLocaleDateString('en', { month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Rating Distribution */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Rating Distribution</h2>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="flex items-center gap-3">
                <span className="w-8 text-right text-sm text-gray-600">{star}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-yellow-400"
                    style={{
                      width: `${(data.ratingDistribution[star - 1] / maxRating) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-6 text-sm text-gray-500">{data.ratingDistribution[star - 1]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Booking Sources */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Booking Sources</h2>
          {Object.keys(data.bookingSources).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No booking data</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.bookingSources)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => (
                  <div key={source}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="capitalize text-gray-700">{source}</span>
                      <span className="text-gray-500">
                        {count} ({Math.round((count / totalSources) * 100)}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${(count / totalSources) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

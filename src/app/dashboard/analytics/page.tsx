'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';

interface AnalyticsData {
  totalRevenue: number;
  totalBookings: number;
  averageOccupancy: number;
  revenueByListing: { name: string; type: string; revenue: number }[];
  ratingDistribution: number[];
  bookingSources: Record<string, number>;
  monthlyRevenue: { month: string; revenue: number }[];
  monthlyBookings: { month: string; count: number }[];
}

export default function OverallAnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('year');

  useEffect(() => {
    if (!user) return;
    fetchAnalytics();
  }, [user, period]);

  async function fetchAnalytics() {
    setLoading(true);
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

      // Fetch all bookings for period
      const { data: bookings } = await supabase
        .from('wb_bookings')
        .select(
          `
          id, total_amount, status, source, created_at, property_id, boat_id,
          wb_properties(name),
          wb_boats(name)
        `
        )
        .eq('owner_id', user!.id)
        .gte('created_at', startDate.toISOString());

      // Fetch reviews
      const { data: reviews } = await supabase
        .from('wb_reviews')
        .select('rating')
        .eq('owner_id', user!.id);

      // Fetch availability
      const { data: availability } = await supabase
        .from('wb_availability')
        .select('date, is_available, property_id')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', now.toISOString().split('T')[0]);

      // Filter to owner's properties only
      const { data: ownerProps } = await supabase
        .from('wb_properties')
        .select('id')
        .eq('owner_id', user!.id);

      const ownerPropIds = new Set((ownerProps || []).map((p: any) => p.id));
      const ownerAvailability = (availability || []).filter((a: any) =>
        ownerPropIds.has(a.property_id)
      );

      const allBookings = bookings || [];
      const completed = allBookings.filter(
        (b) => b.status === 'completed' || b.status === 'confirmed'
      );

      const totalRevenue = completed.reduce(
        (sum, b) => sum + (b.total_amount || 0),
        0
      );

      // Revenue by listing
      const revenueMap: Record<string, { name: string; type: string; revenue: number }> = {};
      completed.forEach((b: any) => {
        const key = b.property_id || b.boat_id || 'unknown';
        if (!revenueMap[key]) {
          revenueMap[key] = {
            name: b.wb_properties?.name || b.wb_boats?.name || 'Unknown',
            type: b.property_id ? 'property' : 'boat',
            revenue: 0,
          };
        }
        revenueMap[key].revenue += b.total_amount || 0;
      });

      // Rating distribution
      const ratingDist = [0, 0, 0, 0, 0];
      (reviews || []).forEach((r: any) => {
        if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating - 1]++;
      });

      // Sources
      const sources: Record<string, number> = {};
      allBookings.forEach((b) => {
        const src = (b as any).source || 'direct';
        sources[src] = (sources[src] || 0) + 1;
      });

      // Occupancy
      const totalDays = ownerAvailability.length || 1;
      const bookedDays = ownerAvailability.filter((a) => !a.is_available).length;
      const avgOccupancy = Math.round((bookedDays / totalDays) * 100);

      // Monthly grouping
      const monthlyRevMap: Record<string, number> = {};
      const monthlyCountMap: Record<string, number> = {};
      completed.forEach((b) => {
        const m = b.created_at.substring(0, 7);
        monthlyRevMap[m] = (monthlyRevMap[m] || 0) + (b.total_amount || 0);
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
        totalBookings: allBookings.length,
        averageOccupancy: avgOccupancy,
        revenueByListing: Object.values(revenueMap).sort(
          (a, b) => b.revenue - a.revenue
        ),
        ratingDistribution: ratingDist,
        bookingSources: sources,
        monthlyRevenue,
        monthlyBookings,
      });
    } catch (err) {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error || 'No data'}</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchAnalytics()}>
          Retry
        </Button>
      </div>
    );
  }

  const maxMonthlyRev = Math.max(...data.monthlyRevenue.map((m) => m.revenue), 1);
  const maxMonthlyBookings = Math.max(...data.monthlyBookings.map((m) => m.count), 1);
  const maxListingRev = Math.max(...data.revenueByListing.map((l) => l.revenue), 1);
  const maxRating = Math.max(...data.ratingDistribution, 1);
  const totalSources = Object.values(data.bookingSources).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
          className="w-40"
        >
          <option value="week">Last 7 Days</option>
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
          <option value="year">This Year</option>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            KES {data.totalRevenue.toLocaleString()}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Bookings</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.totalBookings}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Avg. Occupancy Rate</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.averageOccupancy}%</p>
        </Card>
      </div>

      {/* Revenue Over Time */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Revenue Over Time</h2>
        {data.monthlyRevenue.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No revenue data for this period</p>
        ) : (
          <div className="flex h-48 items-end gap-2">
            {data.monthlyRevenue.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-gray-700">
                  {(m.revenue / 1000).toFixed(0)}k
                </span>
                <div
                  className="w-full rounded-t bg-teal-500"
                  style={{
                    height: `${(m.revenue / maxMonthlyRev) * 100}%`,
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

      {/* Bookings Trend */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Bookings Trend</h2>
        {data.monthlyBookings.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No booking data</p>
        ) : (
          <div className="flex h-40 items-end gap-2">
            {data.monthlyBookings.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-gray-700">{m.count}</span>
                <div
                  className="w-full rounded-t bg-blue-500"
                  style={{
                    height: `${(m.count / maxMonthlyBookings) * 100}%`,
                    minHeight: m.count > 0 ? '4px' : '0px',
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
        {/* Revenue by Listing */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Revenue by Listing</h2>
          {data.revenueByListing.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No data</p>
          ) : (
            <div className="space-y-3">
              {data.revenueByListing.map((listing, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-700">
                      {listing.name}{' '}
                      <span className="text-xs text-gray-400">({listing.type})</span>
                    </span>
                    <span className="font-medium text-gray-900">
                      KES {listing.revenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${(listing.revenue / maxListingRev) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Rating Distribution */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Rating Distribution</h2>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="flex items-center gap-3">
                <span className="w-8 text-right text-sm text-gray-600">{star} star</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-yellow-400"
                    style={{
                      width: `${(data.ratingDistribution[star - 1] / maxRating) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-6 text-sm text-gray-500">
                  {data.ratingDistribution[star - 1]}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Booking Sources */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Booking Sources</h2>
          {Object.keys(data.bookingSources).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No source data</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.bookingSources)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => (
                  <div key={source} className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm capitalize text-gray-500">{source}</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{count}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${(count / totalSources) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {Math.round((count / totalSources) * 100)}% of total
                    </p>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

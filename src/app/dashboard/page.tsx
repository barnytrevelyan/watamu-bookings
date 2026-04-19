'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StarRating } from '@/components/StarRating';

interface DashboardStats {
  totalProperties: number;
  totalBoats: number;
  activeBookings: number;
  revenueThisMonth: number;
  averageRating: number;
}

interface RecentBooking {
  id: string;
  guest_name: string;
  listing_name: string;
  listing_type: 'property' | 'boat';
  check_in: string;
  check_out: string;
  total_price: number;
  currency: string;
  status: string;
}

interface RecentReview {
  id: string;
  guest_name: string;
  listing_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalProperties: 0,
    totalBoats: 0,
    activeBookings: 0,
    revenueThisMonth: 0,
    averageRating: 0,
  });
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    async function fetchDashboardData() {
      try {
        const supabase = createClient();

        // Step 1: Get owner's listing IDs (bookings/reviews don't have owner_id)
        const [propsRes, boatsRes] = await Promise.all([
          supabase.from('wb_properties').select('id, avg_rating').eq('owner_id', user!.id),
          supabase.from('wb_boats').select('id, avg_rating').eq('owner_id', user!.id),
        ]);

        const ownerProps = propsRes.data || [];
        const ownerBoats = boatsRes.data || [];
        const propIds = ownerProps.map((p: any) => p.id);
        const boatIds = ownerBoats.map((b: any) => b.id);

        // Calculate average rating from listings directly
        const allRatings = [...ownerProps, ...ownerBoats]
          .map((l: any) => l.avg_rating)
          .filter((r: any) => r && r > 0);
        const averageRating = allRatings.length > 0
          ? allRatings.reduce((sum: number, r: number) => sum + r, 0) / allRatings.length
          : 0;

        // Step 2: Fetch bookings for owner's listings
        const allBookings: any[] = [];
        if (propIds.length > 0) {
          const { data } = await supabase
            .from('wb_bookings')
            .select('id, check_in, check_out, total_price, currency, status, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_properties!property_id(name)')
            .in('property_id', propIds)
            .order('created_at', { ascending: false });
          if (data) allBookings.push(...data);
        }
        if (boatIds.length > 0) {
          const { data } = await supabase
            .from('wb_bookings')
            .select('id, check_in, check_out, total_price, currency, status, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_boats!boat_id(name)')
            .in('boat_id', boatIds)
            .order('created_at', { ascending: false });
          if (data) allBookings.push(...data);
        }

        // Deduplicate
        const seenBookings = new Set<string>();
        const uniqueBookings = allBookings.filter((b) => {
          if (seenBookings.has(b.id)) return false;
          seenBookings.add(b.id);
          return true;
        });
        uniqueBookings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Active bookings count
        const activeBookingsCount = uniqueBookings.filter(
          (b) => b.status === 'confirmed' || b.status === 'pending_payment'
        ).length;

        // Revenue this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const revenueThisMonth = uniqueBookings
          .filter((b) => (b.status === 'completed' || b.status === 'confirmed') && new Date(b.created_at) >= startOfMonth)
          .reduce((sum, b) => sum + (b.total_price || 0), 0);

        setStats({
          totalProperties: ownerProps.length,
          totalBoats: ownerBoats.length,
          activeBookings: activeBookingsCount,
          revenueThisMonth,
          averageRating: Math.round(averageRating * 10) / 10,
        });

        // Recent bookings (top 5)
        const formattedBookings: RecentBooking[] = uniqueBookings.slice(0, 5).map(
          (b: any) => ({
            id: b.id,
            guest_name: b.wb_profiles?.full_name || 'Guest',
            listing_name: b.wb_properties?.name || b.wb_boats?.name || 'N/A',
            listing_type: b.property_id ? 'property' : 'boat',
            check_in: b.check_in,
            check_out: b.check_out,
            total_price: b.total_price || 0,
            currency: b.currency || 'KES',
            status: b.status,
          })
        );
        setRecentBookings(formattedBookings);

        // Recent reviews
        const allReviews: any[] = [];
        if (propIds.length > 0) {
          const { data } = await supabase
            .from('wb_reviews')
            .select('id, rating, comment, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_properties!property_id(name)')
            .in('property_id', propIds)
            .order('created_at', { ascending: false })
            .limit(5);
          if (data) allReviews.push(...data);
        }
        if (boatIds.length > 0) {
          const { data } = await supabase
            .from('wb_reviews')
            .select('id, rating, comment, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_boats!boat_id(name)')
            .in('boat_id', boatIds)
            .order('created_at', { ascending: false })
            .limit(5);
          if (data) allReviews.push(...data);
        }

        const seenReviews = new Set<string>();
        const uniqueReviews = allReviews.filter((r) => {
          if (seenReviews.has(r.id)) return false;
          seenReviews.add(r.id);
          return true;
        });
        uniqueReviews.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const formattedReviews: RecentReview[] = uniqueReviews.slice(0, 3).map(
          (r: any) => ({
            id: r.id,
            guest_name: r.wb_profiles?.full_name || 'Guest',
            listing_name: r.wb_properties?.name || r.wb_boats?.name || 'N/A',
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
          })
        );
        setRecentReviews(formattedReviews);
      } catch (err) {
        setError('Failed to load dashboard data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user]);

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-gray-200"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button
          onClick={() => window.location.reload()}
          className="mt-4"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}
        </h1>
        <div className="flex gap-3">
          <Button onClick={() => router.push('/dashboard/properties/new')}>
            + Add Property
          </Button>
          <Button
            onClick={() => router.push('/dashboard/boats/new')}
            variant="outline"
          >
            + Add Boat
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <p className="text-sm font-medium text-gray-500">
            Properties &amp; Boats
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats.totalProperties + stats.totalBoats}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {stats.totalProperties} properties, {stats.totalBoats} boats
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-medium text-gray-500">Active Bookings</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats.activeBookings}
          </p>
          <p className="mt-1 text-sm text-gray-500">Pending &amp; confirmed</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-medium text-gray-500">
            Revenue This Month
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            KES {stats.revenueThisMonth.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-gray-500">Completed bookings</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-medium text-gray-500">Average Rating</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-3xl font-bold text-gray-900">
              {stats.averageRating || '—'}
            </p>
            {stats.averageRating > 0 && (
              <StarRating rating={stats.averageRating} />
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">Across all listings</p>
        </Card>
      </div>

      {/* Occupancy Mini Chart Placeholder */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Occupancy Overview
        </h2>
        <div className="flex h-40 items-end gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
            (day, i) => {
              const heights = [40, 60, 55, 75, 80, 95, 90];
              return (
                <div key={day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-teal-500 transition-all"
                    style={{ height: `${heights[i]}%` }}
                  />
                  <span className="text-xs text-gray-500">{day}</span>
                </div>
              );
            }
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Recent Bookings */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Recent Bookings
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard/bookings')}
              >
                View All
              </Button>
            </div>
            {recentBookings.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                No bookings yet. Your bookings will appear here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 font-medium">Guest</th>
                      <th className="pb-3 font-medium">Listing</th>
                      <th className="pb-3 font-medium">Dates</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recentBookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-gray-50">
                        <td className="py-3">{booking.guest_name}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span>{booking.listing_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {booking.listing_type}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          {new Date(booking.check_in).toLocaleDateString()} —{' '}
                          {new Date(booking.check_out).toLocaleDateString()}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          {booking.currency}{' '}
                          {booking.total_price.toLocaleString()}
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                              statusColor[booking.status] ||
                              'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {booking.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Recent Reviews */}
        <div>
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Recent Reviews
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard/reviews')}
              >
                View All
              </Button>
            </div>
            {recentReviews.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                No reviews yet. Reviews from guests will appear here.
              </p>
            ) : (
              <div className="space-y-4">
                {recentReviews.map((review) => (
                  <div
                    key={review.id}
                    className="border-b pb-4 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">
                        {review.guest_name}
                      </p>
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {review.listing_name} &middot;{' '}
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                      {review.comment}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

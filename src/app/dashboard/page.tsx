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
  total_amount: number;
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

        // Fetch properties count
        const { count: propertiesCount } = await supabase
          .from('wb_properties')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', user!.id);

        // Fetch boats count
        const { count: boatsCount } = await supabase
          .from('wb_boats')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', user!.id);

        // Fetch active bookings
        const { count: activeBookingsCount } = await supabase
          .from('wb_bookings')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', user!.id)
          .in('status', ['confirmed', 'pending']);

        // Fetch revenue this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data: monthlyBookings } = await supabase
          .from('wb_bookings')
          .select('total_amount')
          .eq('owner_id', user!.id)
          .eq('status', 'completed')
          .gte('created_at', startOfMonth.toISOString());

        const revenueThisMonth = (monthlyBookings || []).reduce(
          (sum, b) => sum + (b.total_amount || 0),
          0
        );

        // Fetch average rating
        const { data: reviews } = await supabase
          .from('wb_reviews')
          .select('rating')
          .eq('owner_id', user!.id);

        const averageRating =
          reviews && reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;

        setStats({
          totalProperties: propertiesCount || 0,
          totalBoats: boatsCount || 0,
          activeBookings: activeBookingsCount || 0,
          revenueThisMonth,
          averageRating: Math.round(averageRating * 10) / 10,
        });

        // Fetch recent bookings
        const { data: bookingsData } = await supabase
          .from('wb_bookings')
          .select(
            `
            id,
            check_in,
            check_out,
            total_amount,
            currency,
            status,
            wb_profiles!guest_id(full_name),
            wb_properties(name),
            wb_boats(name)
          `
          )
          .eq('owner_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(5);

        const formattedBookings: RecentBooking[] = (bookingsData || []).map(
          (b: any) => ({
            id: b.id,
            guest_name: b.wb_profiles?.full_name || 'Guest',
            listing_name: b.wb_properties?.name || b.wb_boats?.name || 'N/A',
            listing_type: b.wb_properties ? 'property' : 'boat',
            check_in: b.check_in,
            check_out: b.check_out,
            total_amount: b.total_amount,
            currency: b.currency || 'KES',
            status: b.status,
          })
        );
        setRecentBookings(formattedBookings);

        // Fetch recent reviews
        const { data: reviewsData } = await supabase
          .from('wb_reviews')
          .select(
            `
            id,
            rating,
            comment,
            created_at,
            wb_profiles!guest_id(full_name),
            wb_properties(name),
            wb_boats(name)
          `
          )
          .eq('owner_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(3);

        const formattedReviews: RecentReview[] = (reviewsData || []).map(
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
                          {booking.total_amount.toLocaleString()}
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

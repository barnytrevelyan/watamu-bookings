'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface AdminStats {
  totalOwners: number;
  totalProperties: number;
  totalBoats: number;
  totalBookings: number;
  totalRevenue: number;
  platformCommission: number;
}

interface RecentSignup {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

interface RecentBooking {
  id: string;
  guest_name: string;
  listing_name: string;
  total_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

const COMMISSION_RATE = 0.1; // 10% platform commission

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    totalOwners: 0,
    totalProperties: 0,
    totalBoats: 0,
    totalBookings: 0,
    totalRevenue: 0,
    platformCommission: 0,
  });
  const [recentSignups, setRecentSignups] = useState<RecentSignup[]>([]);
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    try {
      const supabase = createClient();

      const [
        { count: ownersCount },
        { count: propertiesCount },
        { count: boatsCount },
        { count: bookingsCount },
        { data: allBookings },
        { data: signups },
        { data: bookingsRecent },
      ] = await Promise.all([
        supabase
          .from('wb_profiles')
          .select('*', { count: 'exact', head: true })
          .in('role', ['owner', 'admin']),
        supabase
          .from('wb_properties')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('wb_boats')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('wb_bookings')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('wb_bookings')
          .select('total_amount')
          .in('status', ['completed', 'confirmed']),
        supabase
          .from('wb_profiles')
          .select('id, full_name, email, role, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('wb_bookings')
          .select(
            `
            id, total_amount, currency, status, created_at,
            wb_profiles!guest_id(full_name),
            wb_properties(name),
            wb_boats(name)
          `
          )
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const totalRevenue = (allBookings || []).reduce(
        (sum, b) => sum + (b.total_amount || 0),
        0
      );

      setStats({
        totalOwners: ownersCount || 0,
        totalProperties: propertiesCount || 0,
        totalBoats: boatsCount || 0,
        totalBookings: bookingsCount || 0,
        totalRevenue,
        platformCommission: Math.round(totalRevenue * COMMISSION_RATE),
      });

      setRecentSignups(
        (signups || []).map((s: any) => ({
          id: s.id,
          full_name: s.full_name || 'N/A',
          email: s.email,
          role: s.role,
          created_at: s.created_at,
        }))
      );

      setRecentBookings(
        (bookingsRecent || []).map((b: any) => ({
          id: b.id,
          guest_name: b.wb_profiles?.full_name || 'Guest',
          listing_name: b.wb_properties?.name || b.wb_boats?.name || 'N/A',
          total_amount: b.total_amount,
          currency: b.currency || 'KES',
          status: b.status,
          created_at: b.created_at,
        }))
      );
    } catch (err) {
      setError('Failed to load admin dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Platform Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Owners</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalOwners}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Properties</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalProperties}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Boats</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalBoats}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Bookings</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalBookings}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            KES {stats.totalRevenue.toLocaleString()}
          </p>
        </Card>
        <Card className="border-indigo-200 bg-indigo-50 p-5">
          <p className="text-sm text-indigo-600">Platform Commission (10%)</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            KES {stats.platformCommission.toLocaleString()}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Recent Signups */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Signups</h2>
          {recentSignups.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No signups yet</p>
          ) : (
            <div className="divide-y">
              {recentSignups.map((signup) => (
                <div key={signup.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">{signup.full_name}</p>
                    <p className="text-xs text-gray-500">{signup.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs capitalize">
                      {signup.role}
                    </Badge>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(signup.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Bookings */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Bookings</h2>
          {recentBookings.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No bookings yet</p>
          ) : (
            <div className="divide-y">
              {recentBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">{booking.guest_name}</p>
                    <p className="text-xs text-gray-500">{booking.listing_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {booking.currency} {booking.total_amount.toLocaleString()}
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusColor[booking.status] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {booking.status}
                    </span>
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

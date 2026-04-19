'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { CalendarCheck } from 'lucide-react';

interface Booking {
  id: string;
  guest_name: string;
  guest_email: string;
  listing_name: string;
  listing_type: 'property' | 'boat';
  check_in: string;
  check_out: string;
  guests_count: number;
  total_price: number;
  currency: string;
  status: string;
  special_requests: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
};

export default function BookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchBookings();
  }, [user, statusFilter, typeFilter, dateFrom, dateTo]);

  async function fetchBookings() {
    setLoading(true);
    try {
      const supabase = createClient();

      // Get owner's property and boat IDs first
      const [propsRes, boatsRes] = await Promise.all([
        supabase.from('wb_properties').select('id').eq('owner_id', user!.id),
        supabase.from('wb_boats').select('id').eq('owner_id', user!.id),
      ]);

      const propIds = (propsRes.data || []).map((p: any) => p.id);
      const boatIds = (boatsRes.data || []).map((b: any) => b.id);

      if (propIds.length === 0 && boatIds.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      // Fetch bookings for owner's listings
      // We need to do two queries if owner has both properties and boats
      const allBookings: any[] = [];

      if (propIds.length > 0) {
        let query = supabase
          .from('wb_bookings')
          .select(
            `
            id, check_in, check_out, guests_count, total_price, currency, status,
            special_requests, created_at, property_id, boat_id,
            wb_profiles!guest_id(full_name, email),
            wb_properties!property_id(name)
          `
          )
          .in('property_id', propIds)
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (dateFrom) query = query.gte('check_in', dateFrom);
        if (dateTo) query = query.lte('check_out', dateTo);

        const { data } = await query;
        if (data) allBookings.push(...data);
      }

      if (boatIds.length > 0) {
        let query = supabase
          .from('wb_bookings')
          .select(
            `
            id, check_in, check_out, guests_count, total_price, currency, status,
            special_requests, created_at, property_id, boat_id,
            wb_profiles!guest_id(full_name, email),
            wb_boats!boat_id(name)
          `
          )
          .in('boat_id', boatIds)
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (dateFrom) query = query.gte('check_in', dateFrom);
        if (dateTo) query = query.lte('check_out', dateTo);

        const { data } = await query;
        if (data) allBookings.push(...data);
      }

      // Deduplicate and sort
      const seen = new Set<string>();
      const unique = allBookings.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      let formatted: Booking[] = unique.map((b: any) => ({
        id: b.id,
        guest_name: b.wb_profiles?.full_name || 'Guest',
        guest_email: b.wb_profiles?.email || '',
        listing_name: b.wb_properties?.name || b.wb_boats?.name || 'N/A',
        listing_type: b.property_id ? 'property' : 'boat',
        check_in: b.check_in,
        check_out: b.check_out,
        guests_count: b.guests_count,
        total_price: b.total_price || 0,
        currency: b.currency || 'KES',
        status: b.status,
        special_requests: b.special_requests,
        created_at: b.created_at,
      }));

      if (typeFilter !== 'all') {
        formatted = formatted.filter((b) => b.listing_type === typeFilter);
      }

      setBookings(formatted);
    } catch (err) {
      console.error(err);
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  async function updateBookingStatus(bookingId: string, newStatus: string) {
    setUpdatingId(bookingId);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from('wb_bookings')
        .update({ status: newStatus })
        .eq('id', bookingId);

      if (updateErr) throw updateErr;

      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <Button
            size="sm"
            variant="outline"
            className="ml-3"
            onClick={() => {
              setError(null);
              fetchBookings();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="property">Properties</option>
              <option value="boat">Boats</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </Card>

      {bookings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <CalendarCheck className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No bookings yet</h2>
          <p className="mt-2 text-center text-gray-500 max-w-md">
            {statusFilter !== 'all' || typeFilter !== 'all' || dateFrom || dateTo
              ? 'No bookings match your filters. Try adjusting them.'
              : 'Bookings will appear here once guests start booking your properties or boats.'}
          </p>
        </Card>
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
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bookings.map((booking) => (
                <React.Fragment key={booking.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      setExpandedId(
                        expandedId === booking.id ? null : booking.id
                      )
                    }
                  >
                    <td className="py-3">
                      <div>
                        <p className="font-medium text-gray-900">{booking.guest_name}</p>
                        <p className="text-xs text-gray-500">{booking.guest_email}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span>{booking.listing_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {booking.listing_type}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      {new Date(booking.check_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} —{' '}
                      {new Date(booking.check_out).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3 whitespace-nowrap font-medium">
                      {booking.currency} {booking.total_price.toLocaleString()}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                          STATUS_COLORS[booking.status] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {booking.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {booking.status === 'pending_payment' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === booking.id}
                            onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                          >
                            Confirm
                          </Button>
                        )}
                        {(booking.status === 'pending_payment' || booking.status === 'confirmed') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={updatingId === booking.id}
                            onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                          >
                            Cancel
                          </Button>
                        )}
                        {booking.status === 'confirmed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === booking.id}
                            onClick={() => updateBookingStatus(booking.id, 'completed')}
                          >
                            Complete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === booking.id && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-6 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                          <div>
                            <p className="text-xs font-medium text-gray-500">Guests</p>
                            <p className="text-gray-900">{booking.guests_count || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">Booked On</p>
                            <p className="text-gray-900">
                              {new Date(booking.created_at).toLocaleDateString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric'
                              })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500">Special Requests</p>
                            <p className="text-gray-900">{booking.special_requests || 'None'}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

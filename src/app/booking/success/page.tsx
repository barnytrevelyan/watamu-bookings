'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics/track';

interface BookingDetails {
  id: string;
  listing_type: 'property' | 'boat';
  check_in: string | null;
  check_out: string | null;
  trip_date: string | null;
  total_price: number;
  guests_count: number;
  status: string;
  created_at: string;
  // Only columns that actually exist on the tables (verified against schema).
  property?: { name: string; city: string | null };
  boat?: { name: string; home_port: string | null };
  payment?: {
    payment_method: string;
    mpesa_receipt_number: string | null;
    paid_at: string | null;
  };
}

export default function BookingSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <BookingSuccessContent />
    </Suspense>
  );
}

function BookingSuccessContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');
  const { user, loading: authLoading } = useAuth();

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || !bookingId) return;

    async function fetchBooking() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('wb_bookings')
          .select(
            `
            *,
            property:wb_properties(name, city),
            boat:wb_boats(name, home_port)
          `
          )
          .eq('id', bookingId!)
          .eq('guest_id', user!.id)
          .single();

        if (fetchError || !data) {
          setError('Booking not found.');
          return;
        }

        // Also fetch the latest payment record
        const { data: paymentData } = await supabase
          .from('wb_payments')
          .select('payment_method, mpesa_receipt_number, paid_at')
          .eq('booking_id', bookingId!)
          .eq('payment_status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        setBooking({ ...data, payment: paymentData } as BookingDetails);

        // Funnel signal: guest reached the post-payment success page.
        // Closes the loop started by booking_started on the sidebar.
        // Typed loose because BookingDetails omits the foreign keys.
        const d = data as unknown as {
          id: string;
          property_id?: string | null;
          boat_id?: string | null;
          total_price: number;
        };
        track({
          event_name: 'booking_confirmed',
          property_id: d.property_id ?? null,
          boat_id: d.boat_id ?? null,
          payload: { booking_id: d.id, total: d.total_price },
        });
      } catch {
        setError('Failed to load booking details.');
      } finally {
        setLoading(false);
      }
    }

    fetchBooking();
  }, [bookingId, user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm p-8 text-center space-y-4">
          <p className="text-gray-700">{error || 'Booking not found.'}</p>
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            Back to Homepage
          </Link>
        </div>
      </div>
    );
  }

  const listingName =
    booking.listing_type === 'property'
      ? booking.property?.name
      : booking.boat?.name;
  const referenceNumber = booking.id.slice(0, 8).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm p-8 space-y-6">
        {/* Success icon */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Booking Confirmed!
          </h1>
          <p className="text-gray-600">
            Your reservation has been secured. You will receive a confirmation
            email shortly.
          </p>
        </div>

        {/* Booking reference */}
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-500">Booking Reference</p>
          <p className="text-2xl font-mono font-bold text-gray-900 mt-1">
            {referenceNumber}
          </p>
        </div>

        {/* Details */}
        <div className="divide-y">
          <div className="py-3 flex justify-between">
            <span className="text-gray-500 text-sm">
              {booking.listing_type === 'property' ? 'Property' : 'Boat'}
            </span>
            <span className="text-gray-900 font-medium text-sm text-right">
              {listingName}
            </span>
          </div>

          {booking.listing_type === 'property' ? (
            <>
              <div className="py-3 flex justify-between">
                <span className="text-gray-500 text-sm">Check-in</span>
                <span className="text-gray-900 font-medium text-sm">
                  {new Date(booking.check_in!).toLocaleDateString('en-KE', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-gray-500 text-sm">Check-out</span>
                <span className="text-gray-900 font-medium text-sm">
                  {new Date(booking.check_out!).toLocaleDateString('en-KE', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </>
          ) : (
            <div className="py-3 flex justify-between">
              <span className="text-gray-500 text-sm">Trip Date</span>
              <span className="text-gray-900 font-medium text-sm">
                {new Date(booking.trip_date!).toLocaleDateString('en-KE', {
                  weekday: 'short',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}

          <div className="py-3 flex justify-between">
            <span className="text-gray-500 text-sm">Guests</span>
            <span className="text-gray-900 font-medium text-sm">
              {booking.guests_count}
            </span>
          </div>

          <div className="py-3 flex justify-between">
            <span className="text-gray-500 text-sm">Payment Method</span>
            <span className="text-gray-900 font-medium text-sm">
              {booking.payment?.payment_method === 'mpesa'
                ? 'M-Pesa'
                : 'Card (Stripe)'}
            </span>
          </div>

          {booking.payment?.mpesa_receipt_number && (
            <div className="py-3 flex justify-between">
              <span className="text-gray-500 text-sm">M-Pesa Receipt</span>
              <span className="text-gray-900 font-mono font-medium text-sm">
                {booking.payment.mpesa_receipt_number}
              </span>
            </div>
          )}

          <div className="py-3 flex justify-between">
            <span className="text-gray-900 font-semibold">Amount Paid</span>
            <span className="text-gray-900 font-bold text-lg">
              KES {booking.total_price.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/dashboard/bookings"
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold text-center hover:bg-blue-700 transition-colors"
          >
            View My Bookings
          </Link>
          <Link
            href="/"
            className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-semibold text-center hover:bg-gray-200 transition-colors"
          >
            Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

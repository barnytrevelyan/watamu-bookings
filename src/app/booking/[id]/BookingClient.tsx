'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Booking {
  id: string;
  listing_type: 'property' | 'boat';
  property_id: string | null;
  boat_id: string | null;
  trip_id: string | null;
  guest_id: string;
  check_in: string | null;
  check_out: string | null;
  trip_date: string | null;
  total_price: number;
  guests: number;
  status: string;
  created_at: string;
  property?: { name: string; location: string; image_url: string | null };
  boat?: { name: string; image_url: string | null };
}

interface PaymentRecord {
  id: string;
  booking_id: string;
  payment_method: string;
  payment_status: string;
}

type PaymentTab = 'card' | 'mpesa';

/* ------------------------------------------------------------------ */
/*  Countdown timer                                                    */
/* ------------------------------------------------------------------ */

function CountdownTimer({ expiresAt }: { expiresAt: Date }) {
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    function tick() {
      const diff = expiresAt.getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setRemaining('00:00');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (expired) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
        <p className="text-red-700 font-semibold">
          This booking has expired. Please create a new booking.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
      <p className="text-amber-800 text-sm">
        Complete payment within{' '}
        <span className="font-mono font-bold text-lg">{remaining}</span>{' '}
        or this booking will expire
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status indicator                                                   */
/* ------------------------------------------------------------------ */

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed';

function PaymentStatusIndicator({ status }: { status: PaymentStatus }) {
  const steps: { key: PaymentStatus; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'completed', label: 'Confirmed' },
  ];

  if (status === 'failed') {
    return (
      <div className="flex items-center gap-2 text-red-600 font-medium">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        Payment failed
      </div>
    );
  }

  const currentIdx = steps.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, idx) => {
        const isActive = idx <= currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isActive
                  ? idx === currentIdx
                    ? 'bg-blue-600 animate-pulse'
                    : 'bg-green-500'
                  : 'bg-gray-300'
              }`}
            />
            <span
              className={`text-sm ${
                isActive ? 'text-gray-900 font-medium' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
            {idx < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  idx < currentIdx ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe card form (wrapped inside <Elements>)                       */
/* ------------------------------------------------------------------ */

function CardPaymentForm({
  bookingId,
  onStatusChange,
}: {
  bookingId: string;
  onStatusChange: (s: PaymentStatus) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);
    onStatusChange('processing');

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/booking/success?id=${bookingId}`,
      },
    });

    // Only reached if there's an immediate error (redirect handles success)
    if (submitError) {
      setError(submitError.message ?? 'Payment failed. Please try again.');
      onStatusChange('failed');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Processing...' : 'Pay Now'}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  M-Pesa form                                                        */
/* ------------------------------------------------------------------ */

function MpesaPaymentForm({
  bookingId,
  amount,
  onStatusChange,
}: {
  bookingId: string;
  amount: number;
  onStatusChange: (s: PaymentStatus) => void;
}) {
  const [phone, setPhone] = useState('254');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stkSent, setStkSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate Kenyan phone number
    const phoneRegex = /^254[17]\d{8}$/;
    if (!phoneRegex.test(phone)) {
      setError('Enter a valid Kenyan phone number (e.g. 254712345678)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/payments/mpesa-stk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate M-Pesa payment');
      }

      setStkSent(true);
      onStatusChange('processing');
    } catch (err: any) {
      setError(err.message);
      onStatusChange('failed');
    } finally {
      setLoading(false);
    }
  }

  if (stkSent) {
    return (
      <div className="text-center space-y-4 py-6">
        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          Check your phone
        </h3>
        <p className="text-gray-600">
          An M-Pesa payment prompt has been sent to{' '}
          <span className="font-mono font-medium">{phone}</span>.
          Enter your PIN to complete the payment of{' '}
          <span className="font-semibold">KES {amount.toLocaleString()}</span>.
        </p>
        <p className="text-sm text-gray-500">
          Waiting for confirmation...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="mpesa-phone" className="block text-sm font-medium text-gray-700 mb-1">
          M-Pesa phone number
        </label>
        <input
          id="mpesa-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="254712345678"
          maxLength={12}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-mono"
        />
        <p className="text-xs text-gray-500 mt-1">
          Format: 254 followed by your number (e.g. 254712345678)
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending...' : `Pay KES ${amount.toLocaleString()} via M-Pesa`}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function BookingPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PaymentTab>('card');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [clientSecretLoading, setClientSecretLoading] = useState(false);

  const bookingId = params.id;

  // Fetch booking details
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/auth/login?redirect=/booking/${bookingId}`);
      return;
    }

    async function fetchBooking() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('wb_bookings')
          .select(
            `
            *,
            property:wb_properties(name, location, image_url),
            boat:wb_boats(name, image_url)
          `
          )
          .eq('id', bookingId)
          .eq('guest_id', user!.id)
          .single();

        if (fetchError || !data) {
          setError('Booking not found or you do not have access.');
          return;
        }

        if (data.status === 'confirmed') {
          router.push(`/booking/success?id=${data.id}`);
          return;
        }

        if (data.status === 'cancelled' || data.status === 'expired') {
          setError(`This booking has been ${data.status}. Please create a new booking.`);
          return;
        }

        setBooking(data as Booking);
      } catch {
        setError('Failed to load booking details.');
      } finally {
        setLoading(false);
      }
    }

    fetchBooking();
  }, [bookingId, user, authLoading, router]);

  // Create Stripe PaymentIntent when card tab is selected
  useEffect(() => {
    if (activeTab !== 'card' || !booking || clientSecret) return;

    async function createIntent() {
      setClientSecretLoading(true);
      try {
        const res = await fetch('/api/payments/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking!.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setClientSecret(data.clientSecret);
      } catch (err: any) {
        setError(err.message || 'Failed to initialize payment.');
      } finally {
        setClientSecretLoading(false);
      }
    }

    createIntent();
  }, [activeTab, booking, clientSecret]);

  // Subscribe to payment status updates via Supabase Realtime
  useEffect(() => {
    if (!booking) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`payment-${booking.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wb_payments',
          filter: `booking_id=eq.${booking.id}`,
        },
        (payload: any) => {
          const record = payload.new as PaymentRecord;
          if (record.payment_status === 'completed') {
            setPaymentStatus('completed');
            setTimeout(() => {
              router.push(`/booking/success?id=${booking.id}`);
            }, 1500);
          } else if (record.payment_status === 'failed') {
            setPaymentStatus('failed');
          } else if (record.payment_status === 'processing') {
            setPaymentStatus('processing');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [booking, router]);

  // Also poll as a fallback in case Realtime is unavailable
  useEffect(() => {
    if (!booking || paymentStatus === 'completed') return;

    const interval = setInterval(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('wb_bookings')
        .select('status')
        .eq('id', booking.id)
        .single();

      if (data?.status === 'confirmed') {
        setPaymentStatus('completed');
        clearInterval(interval);
        router.push(`/booking/success?id=${booking.id}`);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [booking, paymentStatus, router]);

  /* ---- Loading / error states ---- */

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-700">{error}</p>
          <a href="/" className="inline-block text-blue-600 hover:underline text-sm">
            Back to Homepage
          </a>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const expiresAt = new Date(
    new Date(booking.created_at).getTime() + 30 * 60 * 1000
  );
  const listingName =
    booking.listing_type === 'property'
      ? booking.property?.name
      : booking.boat?.name;
  const listingImage =
    booking.listing_type === 'property'
      ? booking.property?.image_url
      : booking.boat?.image_url;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Complete Your Booking
          </h1>
          <p className="text-gray-600 mt-1">
            Confirm your details and pay to secure your reservation.
          </p>
        </div>

        {/* Countdown */}
        <CountdownTimer expiresAt={expiresAt} />

        {/* Payment status */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <PaymentStatusIndicator status={paymentStatus} />
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Booking summary — right side on desktop */}
          <div className="md:col-span-2 md:order-2">
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4 sticky top-8">
              {listingImage && (
                <img
                  src={listingImage}
                  alt={listingName ?? ''}
                  className="w-full h-40 object-cover rounded-lg"
                />
              )}

              <h2 className="text-lg font-semibold text-gray-900">
                {listingName}
              </h2>

              {booking.listing_type === 'property' && booking.property?.location && (
                <p className="text-sm text-gray-500">{booking.property.location}</p>
              )}

              <div className="border-t pt-4 space-y-2 text-sm">
                {booking.listing_type === 'property' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Check-in</span>
                      <span className="font-medium">
                        {new Date(booking.check_in!).toLocaleDateString('en-KE', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Check-out</span>
                      <span className="font-medium">
                        {new Date(booking.check_out!).toLocaleDateString('en-KE', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trip date</span>
                    <span className="font-medium">
                      {new Date(booking.trip_date!).toLocaleDateString('en-KE', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-600">Guests</span>
                  <span className="font-medium">{booking.guests}</span>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>KES {booking.total_price.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment form — left side */}
          <div className="md:col-span-3 md:order-1">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b">
                <button
                  onClick={() => setActiveTab('card')}
                  className={`flex-1 py-4 px-6 text-sm font-medium transition-colors ${
                    activeTab === 'card'
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Card Payment
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('mpesa')}
                  className={`flex-1 py-4 px-6 text-sm font-medium transition-colors ${
                    activeTab === 'mpesa'
                      ? 'text-green-600 border-b-2 border-green-600 bg-green-50/50'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    M-Pesa
                  </span>
                </button>
              </div>

              {/* Tab content */}
              <div className="p-6">
                {activeTab === 'card' && (
                  <>
                    {clientSecretLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full" />
                      </div>
                    ) : clientSecret ? (
                      <Elements
                        stripe={stripePromise}
                        options={{
                          clientSecret,
                          appearance: {
                            theme: 'stripe',
                            variables: { colorPrimary: '#2563eb' },
                          },
                        }}
                      >
                        <CardPaymentForm
                          bookingId={booking.id}
                          onStatusChange={setPaymentStatus}
                        />
                      </Elements>
                    ) : (
                      <p className="text-gray-500 text-center py-8">
                        Unable to load payment form. Please refresh the page.
                      </p>
                    )}
                  </>
                )}

                {activeTab === 'mpesa' && (
                  <MpesaPaymentForm
                    bookingId={booking.id}
                    amount={booking.total_price}
                    onStatusChange={setPaymentStatus}
                  />
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mt-4">
              Your payment is secured with industry-standard encryption.
              Watamu Bookings will never store your card details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPaymentIntent } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { error: 'bookingId is required.' },
        { status: 400 }
      );
    }

    // Fetch booking and verify ownership
    const { data: booking, error: bookingError } = await supabase
      .from('wb_bookings')
      .select('id, guest_id, total_price, status')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found.' },
        { status: 404 }
      );
    }

    if (booking.guest_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    if (booking.status !== 'pending_payment') {
      return NextResponse.json(
        { error: `Cannot pay for a booking with status "${booking.status}".` },
        { status: 400 }
      );
    }

    // Check if there is already a pending Stripe intent for this booking
    const { data: existingPayment } = await supabase
      .from('wb_payments')
      .select('stripe_payment_intent_id')
      .eq('booking_id', bookingId)
      .eq('payment_method', 'stripe')
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let clientSecret: string;

    if (existingPayment?.stripe_payment_intent_id) {
      // Retrieve existing intent so we don't create duplicates
      const stripe = (await import('@/lib/stripe')).default;
      const existingIntent = await stripe.paymentIntents.retrieve(
        existingPayment.stripe_payment_intent_id
      );
      clientSecret = existingIntent.client_secret!;
    } else {
      // Create a new PaymentIntent
      const paymentIntent = await createPaymentIntent({
        bookingId: booking.id,
        amount: booking.total_price,
        currency: 'KES',
        customerEmail: user.email || '',
        metadata: {
          user_id: user.id,
        },
      });

      clientSecret = paymentIntent.clientSecret;

      // Record the payment in wb_payments
      const { error: insertError } = await supabase
        .from('wb_payments')
        .insert({
          booking_id: booking.id,
          payment_method: 'stripe',
          payment_status: 'pending',
          amount: booking.total_price,
          currency: 'KES',
          stripe_payment_intent_id: paymentIntent.paymentIntentId,
        });

      if (insertError) {
        console.error('Payment record insert error:', insertError);
        // Don't fail the request — the intent was already created at Stripe
      }
    }

    return NextResponse.json({ clientSecret });
  } catch (err) {
    console.error('Create payment intent error:', err);
    return NextResponse.json(
      { error: 'Failed to create payment intent.' },
      { status: 500 }
    );
  }
}

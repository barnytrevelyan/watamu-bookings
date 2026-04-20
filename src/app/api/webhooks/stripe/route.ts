import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import stripe from '@/lib/stripe';
import { createClient } from '@/lib/supabase/admin';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header.' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature.' },
      { status: 400 }
    );
  }

  const supabase = createClient();

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;

        if (!bookingId) {
          console.warn('PaymentIntent succeeded without booking_id metadata:', paymentIntent.id);
          break;
        }

        // Update wb_payments status to 'completed'
        const { error: updateError } = await supabase
          .from('wb_payments')
          .update({
            payment_status: 'completed',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .eq('payment_status', 'pending');

        if (updateError) {
          console.error(
            'Failed to update payment record for intent:',
            paymentIntent.id,
            updateError
          );
        }

        // The DB trigger `wb_confirm_booking_on_payment` will automatically
        // set the booking status to 'confirmed' when the payment row changes
        // to 'completed'. However, as a safety net we also update directly:
        const { error: bookingUpdateError } = await supabase
          .from('wb_bookings')
          .update({ status: 'confirmed' })
          .eq('id', bookingId)
          .eq('status', 'pending_payment');

        if (bookingUpdateError) {
          console.error(
            'Failed to confirm booking:',
            bookingId,
            bookingUpdateError
          );
        }

        console.log(`Payment confirmed for booking ${bookingId} via Stripe.`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;

        const failureMessage =
          paymentIntent.last_payment_error?.message || 'Payment failed';

        const { error: updateError } = await supabase
          .from('wb_payments')
          .update({
            payment_status: 'failed',
            failure_reason: failureMessage,
          })
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .eq('payment_status', 'pending');

        if (updateError) {
          console.error(
            'Failed to update failed payment record:',
            paymentIntent.id,
            updateError
          );
        }

        console.log(
          `Payment failed for booking ${bookingId}: ${failureMessage}`
        );
        break;
      }

      default:
        // Unhandled event types are silently acknowledged
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    return NextResponse.json(
      { error: 'Webhook handler error.' },
      { status: 500 }
    );
  }
}

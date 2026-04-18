import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { initiateSTKPush } from '@/lib/mpesa';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, phone } = await request.json();

    if (!bookingId || !phone) {
      return NextResponse.json(
        { error: 'bookingId and phone are required.' },
        { status: 400 }
      );
    }

    // Validate phone format (Kenyan: 254XXXXXXXXX)
    const phoneRegex = /^254[17]\d{8}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number. Use format 254XXXXXXXXX.' },
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

    // Initiate STK Push via Daraja API
    const stkResponse = await initiateSTKPush(
      phone,
      Math.round(booking.total_price), // M-Pesa uses whole KES amounts
      booking.id
    );

    if (!stkResponse.CheckoutRequestID) {
      console.error('STK Push response:', stkResponse);
      return NextResponse.json(
        { error: 'Failed to initiate M-Pesa payment. Please try again.' },
        { status: 502 }
      );
    }

    // Record the payment in wb_payments
    const { error: insertError } = await supabase.from('wb_payments').insert({
      booking_id: booking.id,
      payment_method: 'mpesa',
      payment_status: 'pending',
      amount: booking.total_price,
      currency: 'KES',
      mpesa_checkout_request_id: stkResponse.CheckoutRequestID,
      mpesa_phone: phone,
    });

    if (insertError) {
      console.error('Payment record insert error:', insertError);
    }

    return NextResponse.json({
      checkoutRequestId: stkResponse.CheckoutRequestID,
      message: 'STK push sent. Please check your phone and enter your M-Pesa PIN.',
    });
  } catch (err) {
    console.error('M-Pesa STK push error:', err);
    return NextResponse.json(
      { error: 'Failed to initiate M-Pesa payment.' },
      { status: 500 }
    );
  }
}

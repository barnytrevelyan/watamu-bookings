import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

/**
 * M-Pesa Daraja API callback structure:
 *
 * {
 *   "Body": {
 *     "stkCallback": {
 *       "MerchantRequestID": "...",
 *       "CheckoutRequestID": "ws_CO_...",
 *       "ResultCode": 0,
 *       "ResultDesc": "The service request is processed successfully.",
 *       "CallbackMetadata": {
 *         "Item": [
 *           { "Name": "Amount", "Value": 1000 },
 *           { "Name": "MpesaReceiptNumber", "Value": "ABC123DEF" },
 *           { "Name": "TransactionDate", "Value": 20260418143045 },
 *           { "Name": "PhoneNumber", "Value": 254712345678 }
 *         ]
 *       }
 *     }
 *   }
 * }
 */

interface CallbackMetadataItem {
  Name: string;
  Value: string | number;
}

interface STKCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: {
    Item: CallbackMetadataItem[];
  };
}

function getMetadataValue(
  items: CallbackMetadataItem[],
  name: string
): string | number | undefined {
  return items.find((item) => item.Name === name)?.Value;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const callback: STKCallback | undefined = body?.Body?.stkCallback;

    if (!callback) {
      console.error('Invalid M-Pesa callback body:', JSON.stringify(body));
      return NextResponse.json(
        { ResultCode: 1, ResultDesc: 'Invalid callback format.' },
        { status: 400 }
      );
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } =
      callback;

    console.log(
      `M-Pesa callback for ${CheckoutRequestID}: ResultCode=${ResultCode}, Desc="${ResultDesc}"`
    );

    const supabase = createClient();

    if (ResultCode === 0) {
      // --- Payment successful ---
      const items = CallbackMetadata?.Item ?? [];
      const mpesaReceiptNumber = getMetadataValue(items, 'MpesaReceiptNumber') as string | undefined;
      const amount = getMetadataValue(items, 'Amount') as number | undefined;
      const phoneNumber = getMetadataValue(items, 'PhoneNumber') as number | undefined;

      // Update the payment record
      const { data: payment, error: updateError } = await supabase
        .from('wb_payments')
        .update({
          payment_status: 'completed',
          mpesa_receipt_number: mpesaReceiptNumber || null,
          paid_at: new Date().toISOString(),
        })
        .eq('mpesa_checkout_request_id', CheckoutRequestID)
        .eq('payment_status', 'pending')
        .select('booking_id')
        .single();

      if (updateError) {
        console.error(
          'Failed to update M-Pesa payment record:',
          CheckoutRequestID,
          updateError
        );
        // Still return 200 to Safaricom so they don't retry endlessly
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      // Safety-net: confirm the booking directly (DB trigger should also do this)
      if (payment?.booking_id) {
        const { error: bookingUpdateError } = await supabase
          .from('wb_bookings')
          .update({ status: 'confirmed' })
          .eq('id', payment.booking_id)
          .eq('status', 'pending_payment');

        if (bookingUpdateError) {
          console.error(
            'Failed to confirm booking via M-Pesa:',
            payment.booking_id,
            bookingUpdateError
          );
        } else {
          console.log(
            `Booking ${payment.booking_id} confirmed via M-Pesa. Receipt: ${mpesaReceiptNumber}`
          );
        }
      }
    } else {
      // --- Payment failed ---
      const { error: updateError } = await supabase
        .from('wb_payments')
        .update({
          payment_status: 'failed',
          failure_reason: ResultDesc,
        })
        .eq('mpesa_checkout_request_id', CheckoutRequestID)
        .eq('payment_status', 'pending');

      if (updateError) {
        console.error(
          'Failed to update failed M-Pesa payment:',
          CheckoutRequestID,
          updateError
        );
      }

      console.log(
        `M-Pesa payment failed for ${CheckoutRequestID}: ${ResultDesc}`
      );
    }

    // Always return success to Safaricom
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('M-Pesa webhook handler error:', err);
    // Return success to prevent Safaricom from retrying
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
}

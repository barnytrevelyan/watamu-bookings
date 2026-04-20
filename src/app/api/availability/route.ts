import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const boatId = url.searchParams.get('boatId');
    const checkIn = url.searchParams.get('checkIn');
    const checkOut = url.searchParams.get('checkOut');
    const tripDate = url.searchParams.get('tripDate');

    const supabase = await createClient();

    // --- Property availability ---
    if (propertyId) {
      if (!checkIn || !checkOut) {
        return NextResponse.json(
          { error: 'checkIn and checkOut are required for property availability.' },
          { status: 400 }
        );
      }

      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);

      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format.' },
          { status: 400 }
        );
      }

      if (checkInDate >= checkOutDate) {
        return NextResponse.json(
          { error: 'checkOut must be after checkIn.' },
          { status: 400 }
        );
      }

      // Check availability via RPC
      const { data: available, error: rpcError } = await supabase.rpc(
        'wb_check_property_availability',
        {
          p_property_id: propertyId,
          p_check_in: checkIn,
          p_check_out: checkOut,
        }
      );

      if (rpcError) {
        console.error('Property availability check error:', rpcError);
        return NextResponse.json(
          { error: 'Failed to check availability.' },
          { status: 500 }
        );
      }

      // Get property price for breakdown. billing_mode='subscription' means
      // the host has opted into a flat monthly fee instead of commission —
      // the guest sees no service fee line in that case.
      const { data: property } = await supabase
        .from('wb_properties')
        .select('base_price_per_night, cleaning_fee, service_fee_percent, billing_mode')
        .eq('id', propertyId)
        .single();

      if (!property) {
        return NextResponse.json(
          { error: 'Property not found.' },
          { status: 404 }
        );
      }

      const nights = Math.ceil(
        (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const accommodationCost = property.base_price_per_night * nights;
      const cleaningFee = property.cleaning_fee ?? 0;
      const onSubscription = property.billing_mode === 'subscription';
      const serviceFeePercent = onSubscription ? 0 : (property.service_fee_percent ?? 8);
      const serviceFee = onSubscription ? 0 : Math.round(accommodationCost * (serviceFeePercent / 100));
      const totalPrice = accommodationCost + cleaningFee + serviceFee;

      return NextResponse.json({
        available: !!available,
        priceBreakdown: {
          pricePerNight: property.base_price_per_night,
          nights,
          accommodationCost,
          cleaningFee,
          serviceFeePercent,
          serviceFee,
          totalPrice,
          currency: 'KES',
        },
      });
    }

    // --- Boat availability ---
    if (boatId) {
      if (!tripDate) {
        return NextResponse.json(
          { error: 'tripDate is required for boat availability.' },
          { status: 400 }
        );
      }

      const tripDateParsed = new Date(tripDate);
      if (isNaN(tripDateParsed.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format.' },
          { status: 400 }
        );
      }

      const { data: available, error: rpcError } = await supabase.rpc(
        'wb_check_boat_availability',
        {
          p_boat_id: boatId,
          p_trip_date: tripDate,
        }
      );

      if (rpcError) {
        console.error('Boat availability check error:', rpcError);
        return NextResponse.json(
          { error: 'Failed to check availability.' },
          { status: 500 }
        );
      }

      // Get boat/trip price
      const { data: boat } = await supabase
        .from('wb_boats')
        .select('price_from, capacity')
        .eq('id', boatId)
        .single();

      if (!boat) {
        return NextResponse.json(
          { error: 'Boat not found.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        available: !!available,
        priceBreakdown: {
          pricePerTrip: boat.price_from,
          maxPassengers: boat.capacity,
          totalPrice: boat.price_from,
          currency: 'KES',
        },
      });
    }

    return NextResponse.json(
      { error: 'Either propertyId or boatId is required.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Availability check error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

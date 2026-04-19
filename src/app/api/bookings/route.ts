import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/* ------------------------------------------------------------------ */
/*  POST /api/bookings — Create a new booking                         */
/* ------------------------------------------------------------------ */

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

    const body = await request.json();
    const {
      listingType,
      propertyId,
      boatId,
      tripId,
      checkIn,
      checkOut,
      tripDate,
      guests,
    } = body;

    // --- Validate required fields ---

    if (!listingType || !['property', 'boat'].includes(listingType)) {
      return NextResponse.json(
        { error: 'Invalid listing type. Must be "property" or "boat".' },
        { status: 400 }
      );
    }

    if (listingType === 'property') {
      if (!propertyId || !checkIn || !checkOut) {
        return NextResponse.json(
          { error: 'Property bookings require propertyId, checkIn, and checkOut.' },
          { status: 400 }
        );
      }

      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      if (checkInDate >= checkOutDate) {
        return NextResponse.json(
          { error: 'Check-out must be after check-in.' },
          { status: 400 }
        );
      }
      if (checkInDate < new Date(new Date().toDateString())) {
        return NextResponse.json(
          { error: 'Check-in date cannot be in the past.' },
          { status: 400 }
        );
      }
    }

    if (listingType === 'boat') {
      if (!boatId || !tripDate) {
        return NextResponse.json(
          { error: 'Boat bookings require boatId and tripDate.' },
          { status: 400 }
        );
      }
      if (new Date(tripDate) < new Date(new Date().toDateString())) {
        return NextResponse.json(
          { error: 'Trip date cannot be in the past.' },
          { status: 400 }
        );
      }
    }

    if (!guests || guests < 1) {
      return NextResponse.json(
        { error: 'At least 1 guest is required.' },
        { status: 400 }
      );
    }

    // --- Check availability ---

    if (listingType === 'property') {
      const { data: available, error: rpcError } = await supabase.rpc(
        'wb_check_property_availability',
        {
          p_property_id: propertyId,
          p_check_in: checkIn,
          p_check_out: checkOut,
        }
      );

      if (rpcError) {
        console.error('Availability check error:', rpcError);
        return NextResponse.json(
          { error: 'Failed to check availability.' },
          { status: 500 }
        );
      }

      if (!available) {
        return NextResponse.json(
          { error: 'Property is not available for the selected dates.' },
          { status: 409 }
        );
      }
    } else {
      const { data: available, error: rpcError } = await supabase.rpc(
        'wb_check_boat_availability',
        {
          p_boat_id: boatId,
          p_trip_date: tripDate,
          ...(tripId ? { p_trip_id: tripId } : {}),
        }
      );

      if (rpcError) {
        console.error('Availability check error:', rpcError);
        return NextResponse.json(
          { error: 'Failed to check availability.' },
          { status: 500 }
        );
      }

      if (!available) {
        return NextResponse.json(
          { error: 'Boat is not available for the selected date.' },
          { status: 409 }
        );
      }
    }

    // --- Calculate total price ---

    let totalPrice = 0;

    if (listingType === 'property') {
      const { data: property, error: propError } = await supabase
        .from('wb_properties')
        .select('price_per_night')
        .eq('id', propertyId)
        .single();

      if (propError || !property) {
        return NextResponse.json(
          { error: 'Property not found.' },
          { status: 404 }
        );
      }

      const nights = Math.ceil(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      totalPrice = property.price_per_night * nights;
    } else {
      // For boat trips, price comes from the trip or boat
      if (tripId) {
        const { data: trip, error: tripError } = await supabase
          .from('wb_boat_trips')
          .select('price_per_person')
          .eq('id', tripId)
          .single();

        if (tripError || !trip) {
          return NextResponse.json(
            { error: 'Trip not found.' },
            { status: 404 }
          );
        }
        totalPrice = trip.price_per_person * guests;
      } else {
        const { data: boat, error: boatError } = await supabase
          .from('wb_boats')
          .select('price_per_trip')
          .eq('id', boatId)
          .single();

        if (boatError || !boat) {
          return NextResponse.json(
            { error: 'Boat not found.' },
            { status: 404 }
          );
        }
        totalPrice = boat.price_per_trip;
      }
    }

    // --- Create booking ---

    const { data: booking, error: insertError } = await supabase
      .from('wb_bookings')
      .insert({
        listing_type: listingType,
        property_id: listingType === 'property' ? propertyId : null,
        boat_id: listingType === 'boat' ? boatId : null,
        trip_id: listingType === 'boat' ? tripId : null,
        guest_id: user.id,
        check_in: listingType === 'property' ? checkIn : null,
        check_out: listingType === 'property' ? checkOut : null,
        trip_date: listingType === 'boat' ? tripDate : null,
        guests,
        total_price: totalPrice,
        status: 'pending_payment',
      })
      .select('id, total_price, status')
      .single();

    if (insertError) {
      console.error('Booking insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create booking.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { booking },
      { status: 201 }
    );
  } catch (err) {
    console.error('Booking creation error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/bookings — Get current user's bookings                    */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '20', 10),
      50
    );
    const offset = (page - 1) * limit;

    let query = supabase
      .from('wb_bookings')
      .select(
        `
        *,
        property:wb_properties(id, name, location, image_url),
        boat:wb_boats(id, name, image_url)
      `,
        { count: 'exact' }
      )
      .eq('guest_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: bookings, error: fetchError, count } = await query;

    if (fetchError) {
      console.error('Bookings fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch bookings.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bookings,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error('Bookings fetch error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

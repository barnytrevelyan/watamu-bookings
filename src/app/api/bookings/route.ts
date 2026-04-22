import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveFlexiConfig, computeFlexiPrice, daysUntil } from '@/lib/flexi';

/* ------------------------------------------------------------------ */
/*  POST /api/bookings — Create a new booking                         */
/*                                                                    */
/*  All bookings are commission-mode now: inserted with status        */
/*  'pending_payment' and booking_mode 'platform'. Frontend then      */
/*  routes to Stripe / M-Pesa to collect payment.                     */
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
      guestName,
      guestPhone,
      guestMessage,
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

    // --- Look up the listing (host, price) ---

    type ListingInfo = {
      id: string;
      name: string;
      slug: string;
      owner_id: string;
      price: number; // per-night for property, trip/from for boat
      tripName?: string | null;
      flexi?: ReturnType<typeof resolveFlexiConfig> | null;
    };

    let listing: ListingInfo;

    if (listingType === 'property') {
      const { data: property, error: propError } = await supabase
        .from('wb_properties')
        .select(
          'id, name, slug, owner_id, base_price_per_night, flexi_enabled, flexi_window_days, flexi_cutoff_days, flexi_floor_percent, owner:wb_profiles!wb_properties_owner_id_fkey(flexi_default_enabled, flexi_default_window_days, flexi_default_cutoff_days, flexi_default_floor_percent)',
        )
        .eq('id', propertyId)
        .single();

      if (propError || !property) {
        return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
      }

      // Supabase returns the joined profile as an object when the FK is
      // one-to-one, but the generic typings treat it as possibly an array —
      // normalise.
      const ownerProfile = Array.isArray((property as any).owner)
        ? (property as any).owner[0]
        : (property as any).owner;
      const flexi = resolveFlexiConfig(property as any, ownerProfile ?? null);

      // Enforce the host's booking-notice cutoff server-side.
      if (flexi.enabled) {
        const daysOut = daysUntil(checkIn);
        if (daysOut < flexi.cutoffDays) {
          return NextResponse.json(
            {
              error:
                flexi.cutoffDays === 1
                  ? "This host needs at least 1 day's notice — please pick a later check-in."
                  : `This host needs at least ${flexi.cutoffDays} days' notice — please pick a later check-in.`,
            },
            { status: 400 },
          );
        }
      }

      listing = {
        id: property.id,
        name: property.name,
        slug: property.slug,
        owner_id: property.owner_id,
        price: Number(property.base_price_per_night) || 0,
        flexi,
      };
    } else {
      const { data: boat, error: boatError } = await supabase
        .from('wb_boats')
        .select('id, name, slug, owner_id')
        .eq('id', boatId)
        .single();

      if (boatError || !boat) {
        return NextResponse.json({ error: 'Boat not found.' }, { status: 404 });
      }

      let price = 0;
      let tripName: string | null = null;
      if (tripId) {
        const { data: trip, error: tripError } = await supabase
          .from('wb_boat_trips')
          .select('name, price_total')
          .eq('id', tripId)
          .single();
        if (tripError || !trip) {
          return NextResponse.json({ error: 'Trip not found.' }, { status: 404 });
        }
        price = Number(trip.price_total) || 0;
        tripName = trip.name ?? null;
      } else {
        const { data: cheapest } = await supabase
          .from('wb_boat_trips')
          .select('price_total')
          .eq('boat_id', boatId)
          .eq('is_active', true)
          .order('price_total', { ascending: true })
          .limit(1)
          .maybeSingle();
        price = Number(cheapest?.price_total) || 0;
      }

      listing = {
        id: boat.id,
        name: boat.name,
        slug: boat.slug,
        owner_id: boat.owner_id,
        price,
        tripName,
      };
    }

    // --- Availability check ---

    if (listingType === 'property') {
      const { data: available, error: rpcError } = await supabase.rpc(
        'wb_check_property_availability',
        { p_property_id: propertyId, p_check_in: checkIn, p_check_out: checkOut }
      );
      if (rpcError) {
        console.error('Availability check error:', rpcError);
        return NextResponse.json({ error: 'Failed to check availability.' }, { status: 500 });
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
        { p_boat_id: boatId, p_trip_date: tripDate }
      );
      if (rpcError) {
        console.error('Availability check error:', rpcError);
        return NextResponse.json({ error: 'Failed to check availability.' }, { status: 500 });
      }
      if (!available) {
        return NextResponse.json(
          { error: 'Boat is not available for the selected date.' },
          { status: 409 }
        );
      }
    }

    // --- Calculate totals ---

    let totalPrice = 0;

    if (listingType === 'property') {
      const nights = Math.ceil(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000
      );
      if (listing.flexi?.enabled) {
        // Apply the flexi ramp night-by-night so the server price matches
        // what the guest saw in the sidebar.
        const start = new Date(checkIn);
        let total = 0;
        for (let i = 0; i < nights; i++) {
          const d = new Date(start);
          d.setUTCDate(d.getUTCDate() + i);
          const r = computeFlexiPrice(listing.price, listing.flexi, d);
          total += r.effectivePrice;
        }
        totalPrice = total;
      } else {
        totalPrice = listing.price * nights;
      }
    } else {
      totalPrice = listing.price;
    }

    // --- Snapshot guest contact (use profile fallback) ---

    const { data: profile } = await supabase
      .from('wb_profiles')
      .select('full_name, email, phone')
      .eq('id', user.id)
      .single();

    const guestContactName =
      guestName ||
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'Guest';
    const guestContactEmail = profile?.email || user.email || '';
    const guestContactPhone = guestPhone || profile?.phone || null;

    // --- Create booking ---

    const { data: booking, error: insertError } = await supabase
      .from('wb_bookings')
      .insert({
        listing_type: listingType,
        property_id: listingType === 'property' ? propertyId : null,
        boat_id: listingType === 'boat' ? boatId : null,
        trip_id: listingType === 'boat' ? (tripId ?? null) : null,
        guest_id: user.id,
        check_in: listingType === 'property' ? checkIn : null,
        check_out: listingType === 'property' ? checkOut : null,
        trip_date: listingType === 'boat' ? tripDate : null,
        guests_count: guests,
        total_price: totalPrice,
        status: 'pending_payment',
        guest_contact_name: guestContactName,
        guest_contact_email: guestContactEmail,
        guest_contact_phone: guestContactPhone,
        special_requests: guestMessage || null,
      })
      .select('id, total_price, status')
      .single();

    if (insertError) {
      console.error('Booking insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create booking.' }, { status: 500 });
    }

    return NextResponse.json(
      { booking, availabilityWarning: null },
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
        property:wb_properties(id, name, city, slug),
        boat:wb_boats(id, name, slug)
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

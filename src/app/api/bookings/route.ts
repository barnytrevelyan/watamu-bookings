import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTransactional } from '@/lib/email/zeptomail';
import { hostEnquiryEmail, guestEnquiryAckEmail, type EnquiryContext } from '@/lib/email/enquiry-templates';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.watamubookings.com';

/* ------------------------------------------------------------------ */
/*  POST /api/bookings — Create a new booking                         */
/*                                                                    */
/*  Commission-mode listings → insert with status 'pending_payment'   */
/*                              and booking_mode 'platform'.          */
/*                              Frontend then routes to Stripe/M-Pesa.*/
/*                                                                    */
/*  Subscription-mode listings → insert with status 'enquiry' and     */
/*                                booking_mode 'direct'. No payment.  */
/*                                Host + guest emails are fired off.  */
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
      // Enquiry-mode extras — safe to send even for commission bookings
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

    // --- Look up the listing (billing_mode, deposit_percent, host, price) ---

    type ListingInfo = {
      id: string;
      name: string;
      slug: string;
      owner_id: string;
      billing_mode: 'commission' | 'subscription';
      deposit_percent: number;
      price: number; // per-night for property, trip/from for boat
      tripName?: string | null;
    };

    let listing: ListingInfo;

    if (listingType === 'property') {
      const { data: property, error: propError } = await supabase
        .from('wb_properties')
        .select('id, name, slug, owner_id, billing_mode, deposit_percent, base_price_per_night')
        .eq('id', propertyId)
        .single();

      if (propError || !property) {
        return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
      }
      listing = {
        id: property.id,
        name: property.name,
        slug: property.slug,
        owner_id: property.owner_id,
        billing_mode: property.billing_mode,
        deposit_percent: Number(property.deposit_percent) || 25,
        price: Number(property.base_price_per_night) || 0,
      };
    } else {
      // Boat — require a trip to determine price (wb_boats has no price_from column;
      // pricing lives on wb_boat_trips). Fall back to the cheapest trip if the
      // client doesn't send a tripId, so the UI still functions.
      const { data: boat, error: boatError } = await supabase
        .from('wb_boats')
        .select('id, name, slug, owner_id, billing_mode, deposit_percent')
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
        // No trip selected — use the cheapest active trip as a reasonable default.
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
        billing_mode: boat.billing_mode,
        deposit_percent: Number(boat.deposit_percent) || 25,
        price,
        tripName,
      };
    }

    const isSubscriptionMode = listing.billing_mode === 'subscription';
    const bookingMode: 'platform' | 'direct' = isSubscriptionMode ? 'direct' : 'platform';
    const status = isSubscriptionMode ? 'enquiry' : 'pending_payment';

    // --- Availability check — only applies to bookings that hold the calendar. ---
    // For subscription enquiries the check is advisory (we warn but don't block,
    // so a guest can still enquire even if another guest has a pending enquiry).

    let availabilityWarning: string | null = null;
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
        if (isSubscriptionMode) {
          availabilityWarning = 'Another booking is already confirmed for those dates — the host may decline.';
        } else {
          return NextResponse.json(
            { error: 'Property is not available for the selected dates.' },
            { status: 409 }
          );
        }
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
        if (isSubscriptionMode) {
          availabilityWarning = 'Another booking is already confirmed for that date — the host may decline.';
        } else {
          return NextResponse.json(
            { error: 'Boat is not available for the selected date.' },
            { status: 409 }
          );
        }
      }
    }

    // --- Calculate totals ---

    let totalPrice = 0;
    let nights: number | undefined;

    if (listingType === 'property') {
      nights = Math.ceil(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000
      );
      totalPrice = listing.price * nights;
    } else {
      totalPrice = listing.price;
    }

    const depositAmount = isSubscriptionMode
      ? Math.round((totalPrice * listing.deposit_percent) / 100)
      : null;

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

    const enquiryToken = isSubscriptionMode ? crypto.randomUUID() : null;

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
        status,
        booking_mode: bookingMode,
        deposit_amount: depositAmount,
        enquiry_token: enquiryToken,
        guest_contact_name: guestContactName,
        guest_contact_email: guestContactEmail,
        guest_contact_phone: guestContactPhone,
        special_requests: guestMessage || null,
      })
      .select('id, total_price, status, booking_mode, deposit_amount, enquiry_token')
      .single();

    if (insertError) {
      console.error('Booking insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create booking.' }, { status: 500 });
    }

    // --- Subscription enquiry: fire the host + guest emails. ---
    // We don't fail the booking if email sending fails — the host can still
    // see the enquiry in their dashboard, and the guest can still view the
    // booking page. Errors get logged.

    if (isSubscriptionMode && depositAmount != null && enquiryToken) {
      // Host profile
      const { data: hostProfile } = await supabase
        .from('wb_profiles')
        .select('full_name, email, phone')
        .eq('id', listing.owner_id)
        .single();

      const hostName = hostProfile?.full_name || 'Host';
      const hostEmail = hostProfile?.email || '';
      const hostPhone = hostProfile?.phone || null;

      const ctx: EnquiryContext = {
        bookingId: booking.id,
        enquiryToken,
        listingName: listing.name,
        listingUrl: `${SITE_URL}/${listingType === 'property' ? 'properties' : 'boats'}/${listing.slug}`,
        listingType,
        checkIn: listingType === 'property' ? checkIn : null,
        checkOut: listingType === 'property' ? checkOut : null,
        nights,
        tripDate: listingType === 'boat' ? tripDate : null,
        tripName: listing.tripName ?? null,
        guests,
        totalPrice,
        depositAmount,
        depositPercent: listing.deposit_percent,
        guestName: guestContactName,
        guestEmail: guestContactEmail,
        guestPhone: guestContactPhone,
        guestMessage: guestMessage || null,
        hostName,
        hostEmail,
        hostPhone,
      };

      if (hostEmail) {
        const host = hostEnquiryEmail(ctx);
        sendTransactional({
          to: { email: hostEmail, name: hostName },
          reply_to: guestContactEmail,
          subject: host.subject,
          html: host.html,
          text: host.text,
        }).catch((e) => console.error('[enquiry] host email failed', e));
      } else {
        console.warn('[enquiry] host has no email on profile', listing.owner_id);
      }

      if (guestContactEmail) {
        const ack = guestEnquiryAckEmail(ctx);
        sendTransactional({
          to: { email: guestContactEmail, name: guestContactName },
          reply_to: hostEmail || undefined,
          subject: ack.subject,
          html: ack.html,
          text: ack.text,
        }).catch((e) => console.error('[enquiry] guest ack email failed', e));
      }
    }

    return NextResponse.json(
      { booking, availabilityWarning },
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

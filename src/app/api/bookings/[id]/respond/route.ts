import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { sendTransactional } from '@/lib/email/zeptomail';
import { guestConfirmedEmail, guestDeclinedEmail, type EnquiryContext } from '@/lib/email/enquiry-templates';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.watamubookings.com';

/**
 * POST /api/bookings/[id]/respond
 *
 * Two ways to authorise:
 *   1. enquiry_token in body (from the email action link — host doesn't need to be logged in)
 *   2. session user = booking's listing owner (from the host dashboard)
 *
 * Body: { action: 'confirm' | 'decline', token?: string, reason?: string }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  let body: { action?: string; token?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'confirm' && action !== 'decline') {
    return NextResponse.json({ error: 'action must be "confirm" or "decline".' }, { status: 400 });
  }

  // Read booking with admin client so we can validate the token without hitting RLS.
  // RLS will still enforce the WRITE once we re-derive the auth context.
  const admin = createAdminClient();
  const { data: booking, error: bookingErr } = await admin
    .from('wb_bookings')
    .select('id, status, booking_mode, enquiry_token, listing_type, property_id, boat_id, trip_id, check_in, check_out, trip_date, guests, total_price, deposit_amount, guest_id, guest_contact_name, guest_contact_email, guest_contact_phone, special_requests')
    .eq('id', id)
    .single();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }

  if (booking.status !== 'enquiry') {
    return NextResponse.json(
      { error: `This booking is already ${booking.status}. Nothing to do.` },
      { status: 409 }
    );
  }
  if (booking.booking_mode !== 'direct') {
    return NextResponse.json(
      { error: 'This booking is on the commission flow — confirm via payment, not via this endpoint.' },
      { status: 409 }
    );
  }

  // --- Authorise ---
  let authorised = false;
  const tokenProvided = body.token;

  if (tokenProvided && booking.enquiry_token && tokenProvided === booking.enquiry_token) {
    authorised = true;
  } else {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      // Check the session user owns the listing.
      const ownerQuery = booking.listing_type === 'property'
        ? admin.from('wb_properties').select('owner_id').eq('id', booking.property_id).single()
        : admin.from('wb_boats').select('owner_id').eq('id', booking.boat_id).single();
      const { data: owner } = await ownerQuery;
      if (owner && owner.owner_id === session.user.id) authorised = true;
    }
  }

  if (!authorised) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  }

  // --- Look up listing + host for the guest email ---
  const listingQuery = booking.listing_type === 'property'
    ? admin.from('wb_properties').select('id, name, slug, owner_id, deposit_percent').eq('id', booking.property_id).single()
    : admin.from('wb_boats').select('id, name, slug, owner_id, deposit_percent').eq('id', booking.boat_id).single();
  const { data: listing } = await listingQuery;
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }

  const { data: hostProfile } = await admin
    .from('wb_profiles')
    .select('full_name, email, phone')
    .eq('id', listing.owner_id)
    .single();

  // --- CONFIRM path ---

  if (action === 'confirm') {
    // Hard availability check: another booking may have been confirmed in the
    // interval since the enquiry was submitted. If so, refuse and surface a
    // clear error rather than double-booking.
    if (booking.listing_type === 'property') {
      const { data: overlap } = await admin
        .from('wb_bookings')
        .select('id, check_in, check_out, status')
        .eq('property_id', booking.property_id)
        .in('status', ['confirmed', 'pending_payment', 'completed'])
        .neq('id', booking.id)
        .lt('check_in', booking.check_out)
        .gt('check_out', booking.check_in);
      if (overlap && overlap.length > 0) {
        return NextResponse.json(
          { error: 'Another booking has already been confirmed for these dates. Decline this enquiry instead.' },
          { status: 409 }
        );
      }
    } else if (booking.listing_type === 'boat') {
      const { data: overlap } = await admin
        .from('wb_bookings')
        .select('id, trip_id, status')
        .eq('boat_id', booking.boat_id)
        .eq('trip_date', booking.trip_date!)
        .in('status', ['confirmed', 'pending_payment', 'completed'])
        .neq('id', booking.id);
      const conflicting = overlap?.filter((b: { trip_id: string | null }) =>
        !booking.trip_id || !b.trip_id || b.trip_id === booking.trip_id
      );
      if (conflicting && conflicting.length > 0) {
        return NextResponse.json(
          { error: 'Another booking has already been confirmed for that date. Decline this enquiry instead.' },
          { status: 409 }
        );
      }
    }

    const { error: updateErr } = await admin
      .from('wb_bookings')
      .update({
        status: 'confirmed',
        host_responded_at: new Date().toISOString(),
        enquiry_token: null, // Burn the token — one-shot use.
      })
      .eq('id', booking.id);

    if (updateErr) {
      console.error('[enquiry confirm] update failed', updateErr);
      return NextResponse.json({ error: 'Failed to confirm booking.' }, { status: 500 });
    }

    // Guest email (best effort)
    if (booking.guest_contact_email) {
      const ctx: EnquiryContext = {
        bookingId: booking.id,
        enquiryToken: '',
        listingName: listing.name,
        listingUrl: `${SITE_URL}/${booking.listing_type === 'property' ? 'properties' : 'boats'}/${listing.slug}`,
        listingType: booking.listing_type,
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        tripDate: booking.trip_date,
        tripName: null,
        guests: booking.guests,
        totalPrice: Number(booking.total_price),
        depositAmount: Number(booking.deposit_amount ?? 0),
        depositPercent: Number(listing.deposit_percent) || 25,
        guestName: booking.guest_contact_name || 'Guest',
        guestEmail: booking.guest_contact_email,
        guestPhone: booking.guest_contact_phone,
        hostName: hostProfile?.full_name || 'Your host',
        hostEmail: hostProfile?.email || '',
        hostPhone: hostProfile?.phone || null,
      };
      const tpl = guestConfirmedEmail(ctx);
      sendTransactional({
        to: { email: booking.guest_contact_email, name: ctx.guestName },
        reply_to: ctx.hostEmail || undefined,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      }).catch((e) => console.error('[enquiry] guest confirmed email failed', e));
    }

    return NextResponse.json({ ok: true, status: 'confirmed' });
  }

  // --- DECLINE path ---

  const { error: updateErr } = await admin
    .from('wb_bookings')
    .update({
      status: 'declined',
      host_responded_at: new Date().toISOString(),
      host_decline_reason: body.reason || null,
      enquiry_token: null,
    })
    .eq('id', booking.id);

  if (updateErr) {
    console.error('[enquiry decline] update failed', updateErr);
    return NextResponse.json({ error: 'Failed to decline booking.' }, { status: 500 });
  }

  if (booking.guest_contact_email) {
    const ctx: EnquiryContext & { declineReason?: string | null } = {
      bookingId: booking.id,
      enquiryToken: '',
      listingName: listing.name,
      listingUrl: `${SITE_URL}/${booking.listing_type === 'property' ? 'properties' : 'boats'}/${listing.slug}`,
      listingType: booking.listing_type,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      tripDate: booking.trip_date,
      tripName: null,
      guests: booking.guests,
      totalPrice: Number(booking.total_price),
      depositAmount: Number(booking.deposit_amount ?? 0),
      depositPercent: Number(listing.deposit_percent) || 25,
      guestName: booking.guest_contact_name || 'Guest',
      guestEmail: booking.guest_contact_email,
      guestPhone: booking.guest_contact_phone,
      hostName: hostProfile?.full_name || 'Your host',
      hostEmail: hostProfile?.email || '',
      hostPhone: hostProfile?.phone || null,
      declineReason: body.reason || null,
    };
    const tpl = guestDeclinedEmail(ctx);
    sendTransactional({
      to: { email: booking.guest_contact_email, name: ctx.guestName },
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) => console.error('[enquiry] guest declined email failed', e));
  }

  return NextResponse.json({ ok: true, status: 'declined' });
}

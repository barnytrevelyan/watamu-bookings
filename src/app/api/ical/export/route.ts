import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

/**
 * GET /api/ical/export?token=xxx
 *
 * Generates an iCal (.ics) feed for a property or boat's bookings.
 * The token is a unique per-listing export token stored in wb_ical_feeds.
 *
 * Airbnb, Booking.com, and Google Calendar can subscribe to this URL
 * to automatically block dates when a booking is made on Watamu Bookings.
 */

function formatDate(date: string): string {
  return date.replace(/-/g, '');
}

function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return new NextResponse('Missing token parameter', { status: 400 });
  }

  const supabase = createClient();

  // Look up the feed by export token
  const { data: feed, error: feedError } = await supabase
    .from('wb_ical_feeds')
    .select('*')
    .eq('export_token', token)
    .eq('is_active', true)
    .single();

  if (feedError || !feed) {
    return new NextResponse('Calendar feed not found', { status: 404 });
  }

  // Fetch confirmed bookings for this listing
  const listingColumn = feed.listing_type === 'property' ? 'property_id' : 'boat_id';

  const { data: bookings } = await supabase
    .from('wb_bookings')
    .select('id, check_in, check_out, guests_count, status, special_requests')
    .eq(listingColumn, feed.listing_id)
    .in('status', ['confirmed', 'pending_payment'])
    .gte('check_out', new Date().toISOString().split('T')[0])
    .order('check_in', { ascending: true });

  // Also fetch manually blocked dates from availability tables
  const availTable = feed.listing_type === 'property' ? 'wb_availability' : 'wb_boat_availability';
  const availColumn = feed.listing_type === 'property' ? 'property_id' : 'boat_id';

  const { data: blockedDates } = await supabase
    .from(availTable)
    .select('date')
    .eq(availColumn, feed.listing_id)
    .eq('is_available', false)
    .gte('date', new Date().toISOString().split('T')[0]);

  // Fetch the listing name for the calendar title
  const listingTable = feed.listing_type === 'property' ? 'wb_properties' : 'wb_boats';
  const { data: listing } = await supabase
    .from(listingTable)
    .select('name')
    .eq('id', feed.listing_id)
    .single();

  const calendarName = listing?.name || 'Watamu Bookings Calendar';
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Build iCal content
  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Watamu Bookings//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(calendarName)}`,
    'X-WR-TIMEZONE:Africa/Nairobi',
  ];

  // Add booking events
  if (bookings) {
    for (const booking of bookings) {
      const uid = `booking-${booking.id}@watamubookings.com`;
      const summary = booking.status === 'confirmed'
        ? `Booked (${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''})`
        : `Pending (${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''})`;

      ical.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${formatDate(booking.check_in)}`,
        `DTEND;VALUE=DATE:${formatDate(booking.check_out)}`,
        `SUMMARY:${escapeIcal(summary)}`,
        booking.special_requests
          ? `DESCRIPTION:${escapeIcal(booking.special_requests)}`
          : 'DESCRIPTION:Booked via Watamu Bookings',
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      );
    }
  }

  // Add manually blocked dates as all-day events
  if (blockedDates) {
    // Group consecutive blocked dates into ranges
    const sorted = blockedDates.map(d => d.date).sort();
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];

    for (let i = 1; i <= sorted.length; i++) {
      const current = sorted[i];
      const prevDate = new Date(rangeEnd);
      prevDate.setDate(prevDate.getDate() + 1);
      const nextExpected = prevDate.toISOString().split('T')[0];

      if (current === nextExpected) {
        rangeEnd = current;
      } else {
        // Emit the range
        if (rangeStart) {
          const endDate = new Date(rangeEnd);
          endDate.setDate(endDate.getDate() + 1);
          const endStr = endDate.toISOString().split('T')[0];

          ical.push(
            'BEGIN:VEVENT',
            `UID:blocked-${rangeStart}@watamubookings.com`,
            `DTSTAMP:${now}`,
            `DTSTART;VALUE=DATE:${formatDate(rangeStart)}`,
            `DTEND;VALUE=DATE:${formatDate(endStr)}`,
            'SUMMARY:Blocked',
            'DESCRIPTION:Not available',
            'STATUS:CONFIRMED',
            'TRANSP:OPAQUE',
            'END:VEVENT',
          );
        }
        rangeStart = current;
        rangeEnd = current;
      }
    }
  }

  ical.push('END:VCALENDAR');

  // Update last sync time
  await supabase
    .from('wb_ical_feeds')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', feed.id);

  return new NextResponse(ical.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${calendarName.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/ical/import
 *
 * Imports dates from an external iCal feed (Airbnb, Booking.com, Google Calendar)
 * and blocks those dates in the listing's availability table.
 *
 * Body: { feed_id: string } — triggers a sync for a specific feed
 *   OR  { listing_type: string, listing_id: string, url: string } — one-off import
 */

interface ICalEvent {
  uid: string;
  dtstart: string;
  dtend: string;
  summary: string;
}

function parseIcal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const blocks = text.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];

    const uid = extractField(block, 'UID') || `imported-${i}`;
    const summary = extractField(block, 'SUMMARY') || 'Blocked';

    // Parse dates - handle both DATE and DATETIME formats
    let dtstart = extractField(block, 'DTSTART') || '';
    let dtend = extractField(block, 'DTEND') || '';

    // Also handle DTSTART;VALUE=DATE:20240101 format
    const dtstartMatch = block.match(/DTSTART[^:]*:(\d{8})/);
    const dtendMatch = block.match(/DTEND[^:]*:(\d{8})/);

    if (dtstartMatch) dtstart = dtstartMatch[1];
    if (dtendMatch) dtend = dtendMatch[1];

    // Convert YYYYMMDD to YYYY-MM-DD
    if (dtstart.length === 8) {
      dtstart = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    } else if (dtstart.length >= 15) {
      // YYYYMMDDTHHMMSS format
      dtstart = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    }

    if (dtend.length === 8) {
      dtend = `${dtend.slice(0, 4)}-${dtend.slice(4, 6)}-${dtend.slice(6, 8)}`;
    } else if (dtend.length >= 15) {
      dtend = `${dtend.slice(0, 4)}-${dtend.slice(4, 6)}-${dtend.slice(6, 8)}`;
    }

    if (dtstart) {
      events.push({ uid, dtstart, dtend: dtend || dtstart, summary });
    }
  }

  return events;
}

function extractField(block: string, field: string): string | null {
  const regex = new RegExp(`^${field}(?:;[^:]*)?:(.+)`, 'm');
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);

  // iCal DTEND for all-day events is exclusive (the day after the last blocked day)
  while (current < endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function syncFeed(feedId: string, adminClient: any) {
  // Fetch the feed details
  const { data: feed, error } = await adminClient
    .from('wb_ical_feeds')
    .select('*')
    .eq('id', feedId)
    .single();

  if (error || !feed || !feed.external_url) {
    throw new Error('Feed not found or has no external URL');
  }

  // Fetch the external calendar
  const response = await fetch(feed.external_url, {
    headers: {
      'User-Agent': `${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Kwetu'}/1.0 iCal Sync`,
      'Accept': 'text/calendar',
    },
  });

  if (!response.ok) {
    const errorMsg = `Failed to fetch calendar: ${response.status}`;
    await adminClient
      .from('wb_ical_feeds')
      .update({ sync_error: errorMsg, last_synced_at: new Date().toISOString() })
      .eq('id', feedId);
    throw new Error(errorMsg);
  }

  const icalText = await response.text();
  const events = parseIcal(icalText);

  // Get dates to block (only future dates)
  const today = new Date().toISOString().split('T')[0];
  const datesToBlock = new Set<string>();

  for (const event of events) {
    const range = getDateRange(event.dtstart, event.dtend);
    for (const date of range) {
      if (date >= today) {
        datesToBlock.add(date);
      }
    }
  }

  if (datesToBlock.size === 0) {
    await adminClient
      .from('wb_ical_feeds')
      .update({ sync_error: null, last_synced_at: new Date().toISOString() })
      .eq('id', feedId);
    return { blocked_dates: 0, events: events.length };
  }

  // Determine which availability table to use
  const availTable = feed.listing_type === 'property' ? 'wb_availability' : 'wb_boat_availability';
  const idColumn = feed.listing_type === 'property' ? 'property_id' : 'boat_id';

  // Upsert blocked dates
  const rows = Array.from(datesToBlock).map((date) => ({
    [idColumn]: feed.listing_id,
    date,
    is_available: false,
  }));

  // Insert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await adminClient
      .from(availTable)
      .upsert(batch, { onConflict: `${idColumn},date` });
  }

  // Update feed sync state
  await adminClient
    .from('wb_ical_feeds')
    .update({
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', feedId);

  return {
    blocked_dates: datesToBlock.size,
    events: events.length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Verify auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const user = session.user;

    const body = await request.json();

    if (body.feed_id) {
      // Sync a specific feed
      // Verify ownership
      const { data: feed } = await supabase
        .from('wb_ical_feeds')
        .select('id')
        .eq('id', body.feed_id)
        .eq('owner_id', user.id)
        .single();

      if (!feed) {
        return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
      }

      const result = await syncFeed(body.feed_id, adminClient);
      return NextResponse.json({
        message: `Synced ${result.blocked_dates} blocked dates from ${result.events} events`,
        ...result,
      });
    }

    if (body.listing_type && body.listing_id && body.url) {
      // Create a new feed and sync it
      const { data: feed, error: feedError } = await supabase
        .from('wb_ical_feeds')
        .insert({
          owner_id: user.id,
          listing_type: body.listing_type,
          listing_id: body.listing_id,
          external_url: body.url,
          external_source: detectSource(body.url),
        })
        .select('id')
        .single();

      if (feedError) throw feedError;

      const result = await syncFeed(feed.id, adminClient);
      return NextResponse.json({
        message: `Calendar connected! Synced ${result.blocked_dates} blocked dates.`,
        feed_id: feed.id,
        ...result,
      });
    }

    return NextResponse.json(
      { error: 'Provide either feed_id or (listing_type, listing_id, url)' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('iCal import error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to sync calendar' },
      { status: 500 }
    );
  }
}

function detectSource(url: string): string {
  if (url.includes('airbnb')) return 'airbnb';
  if (url.includes('booking.com')) return 'booking_com';
  if (url.includes('google')) return 'google';
  return 'other';
}

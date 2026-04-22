import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { detectIcalSource, syncFeed } from '@/lib/ical/sync';

/**
 * POST /api/ical/import
 *
 * Imports dates from an external iCal feed (Airbnb, Booking.com, Google Calendar)
 * and blocks those dates in the listing's availability table.
 *
 * Body: { feed_id: string } — triggers a sync for a specific feed
 *   OR  { listing_type: string, listing_id: string, url: string } — one-off import
 *
 * The scheduled equivalent lives at /api/cron/ical-sync and walks every
 * active feed on a cron cadence (see vercel.json). Both paths share the
 * same core sync logic in @/lib/ical/sync.
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const user = session.user;

    const body = await request.json();

    if (body.feed_id) {
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
      const { data: feed, error: feedError } = await supabase
        .from('wb_ical_feeds')
        .insert({
          owner_id: user.id,
          listing_type: body.listing_type,
          listing_id: body.listing_id,
          external_url: body.url,
          external_source: detectIcalSource(body.url),
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

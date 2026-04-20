import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/ical/feeds?listing_type=property&listing_id=xxx
 *   Returns all calendar feeds for a listing
 *
 * POST /api/ical/feeds
 *   Creates a new external calendar feed
 *   Body: { listing_type, listing_id, external_url }
 *
 * DELETE /api/ical/feeds?id=xxx
 *   Removes a calendar feed
 */

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  const user = session.user;

  const listingType = request.nextUrl.searchParams.get('listing_type');
  const listingId = request.nextUrl.searchParams.get('listing_id');

  if (!listingType || !listingId) {
    return NextResponse.json({ error: 'listing_type and listing_id required' }, { status: 400 });
  }

  const { data: feeds, error } = await supabase
    .from('wb_ical_feeds')
    .select('*')
    .eq('listing_type', listingType)
    .eq('listing_id', listingId)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build export URL for each feed
  const baseUrl = request.nextUrl.origin;
  const feedsWithExportUrl = (feeds || []).map((feed) => ({
    ...feed,
    export_url: `${baseUrl}/api/ical/export?token=${feed.export_token}`,
  }));

  return NextResponse.json({ feeds: feedsWithExportUrl });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  const user = session.user;

  const { listing_type, listing_id, external_url } = await request.json();

  if (!listing_type || !listing_id) {
    return NextResponse.json({ error: 'listing_type and listing_id required' }, { status: 400 });
  }

  // Check if an export-only feed already exists (without external URL)
  const { data: existing } = await supabase
    .from('wb_ical_feeds')
    .select('id')
    .eq('listing_type', listing_type)
    .eq('listing_id', listing_id)
    .eq('owner_id', user.id)
    .is('external_url', null)
    .single();

  if (!existing && !external_url) {
    // Create an export-only feed
    const { data: feed, error } = await supabase
      .from('wb_ical_feeds')
      .insert({
        owner_id: user.id,
        listing_type,
        listing_id,
      })
      .select('*, export_token')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const baseUrl = request.nextUrl.origin;
    return NextResponse.json({
      feed: {
        ...feed,
        export_url: `${baseUrl}/api/ical/export?token=${feed.export_token}`,
      },
    });
  }

  if (external_url) {
    // Create an import feed
    const source = external_url.includes('airbnb') ? 'airbnb'
      : external_url.includes('booking.com') ? 'booking_com'
      : external_url.includes('google') ? 'google'
      : 'other';

    const { data: feed, error } = await supabase
      .from('wb_ical_feeds')
      .insert({
        owner_id: user.id,
        listing_type,
        listing_id,
        external_url,
        external_source: source,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const baseUrl = request.nextUrl.origin;
    return NextResponse.json({
      feed: {
        ...feed,
        export_url: `${baseUrl}/api/ical/export?token=${feed.export_token}`,
      },
    });
  }

  // Already exists
  const baseUrl = request.nextUrl.origin;
  return NextResponse.json({
    feed: {
      ...existing,
      export_url: existing ? `${baseUrl}/api/ical/export?token=${(existing as any).export_token}` : null,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  const user = session.user;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('wb_ical_feeds')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

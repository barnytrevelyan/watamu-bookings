import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/analytics/property-funnel?propertyId=<uuid>&days=<n>
 *
 * Returns a small aggregated funnel payload:
 *   { views, galleryOpens, dateChecks, bookingStarts, bookingConfirms,
 *     uniqueSessions, topReferrers, topPaths, daily: [{ date, views, bookings }] }
 *
 * Gated: the caller must be authenticated AND own the property. Reads
 * wb_events (RLS locked) via the service-role client after the
 * ownership check. Mirrors the pattern on other dashboard endpoints.
 */

const VALID_EVENTS = [
  'property_view',
  'gallery_open',
  'availability_checked',
  'booking_started',
  'booking_confirmed',
] as const;

type FunnelEvent = (typeof VALID_EVENTS)[number];

interface EventRow {
  event_name: string;
  session_id: string;
  referrer: string | null;
  path: string | null;
  created_at: string;
}

function isUuid(v: string | null): v is string {
  return !!v && /^[0-9a-f-]{36}$/i.test(v);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const daysParam = url.searchParams.get('days');
    const days = Math.min(Math.max(parseInt(daysParam ?? '90', 10) || 90, 1), 365);

    if (!isUuid(propertyId)) {
      return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 });
    }

    // Authenticate the caller + confirm ownership.
    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: prop } = await authed
      .from('wb_properties')
      .select('id')
      .eq('id', propertyId)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!prop) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Pull events for this property in the window. Bounded by the
    // property_id + created_at index so this is cheap even at volume.
    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
    const admin = createAdminClient();
    const { data: events, error } = await admin
      .from('wb_events')
      .select('event_name, session_id, referrer, path, created_at')
      .eq('property_id', propertyId)
      .gte('created_at', sinceIso)
      .in('event_name', VALID_EVENTS as unknown as string[])
      .limit(20_000);

    if (error) {
      console.error('[property-funnel] query failed', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const rows = (events ?? []) as EventRow[];

    // Funnel counts (unique sessions per stage — a session that views
    // twice counts once; one that books three times counts once).
    const sessionsByEvent: Record<FunnelEvent, Set<string>> = {
      property_view: new Set(),
      gallery_open: new Set(),
      availability_checked: new Set(),
      booking_started: new Set(),
      booking_confirmed: new Set(),
    };

    for (const r of rows) {
      if ((VALID_EVENTS as readonly string[]).includes(r.event_name)) {
        sessionsByEvent[r.event_name as FunnelEvent].add(r.session_id);
      }
    }

    // Top referrers + paths (property_view only — where traffic lands
    // is most interesting on the entry event).
    const refCounts: Record<string, number> = {};
    const pathCounts: Record<string, number> = {};
    for (const r of rows) {
      if (r.event_name !== 'property_view') continue;
      const ref = normaliseReferrer(r.referrer);
      refCounts[ref] = (refCounts[ref] ?? 0) + 1;
      if (r.path) {
        // Strip query string — same page different filters shouldn't fragment.
        const p = r.path.split('?')[0];
        pathCounts[p] = (pathCounts[p] ?? 0) + 1;
      }
    }

    // Daily views + bookings for the mini chart.
    const dailyMap: Record<string, { views: number; bookings: number }> = {};
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { views: 0, bookings: 0 };
      if (r.event_name === 'property_view') dailyMap[day].views += 1;
      if (r.event_name === 'booking_confirmed') dailyMap[day].bookings += 1;
    }
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return NextResponse.json({
      windowDays: days,
      views: sessionsByEvent.property_view.size,
      galleryOpens: sessionsByEvent.gallery_open.size,
      dateChecks: sessionsByEvent.availability_checked.size,
      bookingStarts: sessionsByEvent.booking_started.size,
      bookingConfirms: sessionsByEvent.booking_confirmed.size,
      uniqueSessions: new Set(rows.map((r) => r.session_id)).size,
      topReferrers: toTopN(refCounts, 6),
      topPaths: toTopN(pathCounts, 6),
      daily,
    });
  } catch (err) {
    console.error('[property-funnel] unexpected error', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

function normaliseReferrer(raw: string | null): string {
  if (!raw) return '(direct)';
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    // Fold our own domain(s) so the chart doesn't scream "most traffic
    // comes from our own site" when most clicks come via internal nav.
    if (host.endsWith('kwetu.ke') || host.endsWith('watamubookings.com')) return '(internal)';
    return host;
  } catch {
    return raw.slice(0, 60);
  }
}

function toTopN(counts: Record<string, number>, n: number) {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

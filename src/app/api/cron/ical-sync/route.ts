import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { syncAllActiveFeeds } from '@/lib/ical/sync';

// Vercel Cron → GET /api/cron/ical-sync (configured in vercel.json).
// Refreshes every active external iCal feed so hosts don't have to hit
// "Sync Now" manually after each new Airbnb / Booking.com reservation.
//
// Protected by CRON_SECRET: Vercel sets `Authorization: Bearer <CRON_SECRET>`
// on scheduled requests. Reject everything else in production.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
  } else {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  try {
    const adminClient = createAdminClient();
    const summary = await syncAllActiveFeeds(adminClient);
    return NextResponse.json({ ok: true, ...summary, ran_at: new Date().toISOString() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron failed';
    console.error('[cron/ical-sync] failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Allow manual trigger via POST (admin button) with same auth rules.
export async function POST(req: NextRequest) {
  return GET(req);
}

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, runBillingCron } from '@/lib/subscriptions/server';

// Vercel Cron → GET /api/cron/billing (configured in vercel.json).
// Protected by CRON_SECRET: Vercel sets `Authorization: Bearer <CRON_SECRET>`
// on scheduled requests. Reject everything else.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // In dev, allow without a secret so local testing works, but warn.
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
    const summary = await runBillingCron(adminDb());
    return NextResponse.json({ ok: true, ...summary, ran_at: new Date().toISOString() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron failed';
    console.error('[cron/billing] failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Allow manual trigger via POST (admin button) with same auth rules.
export async function POST(req: NextRequest) {
  return GET(req);
}

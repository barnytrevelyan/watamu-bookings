import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminDb, toggleListingBillingMode } from '@/lib/subscriptions/server';

const Body = z.object({
  listing_id: z.string().uuid(),
  listing_type: z.enum(['property', 'boat']),
  billing_mode: z.enum(['commission', 'subscription']),
});

export async function POST(req: NextRequest) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = adminDb();
  const table = parsed.data.listing_type === 'property' ? 'wb_properties' : 'wb_boats';
  const { data: row } = await db.from(table).select('owner_id').eq('id', parsed.data.listing_id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  if (row.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // If switching to subscription, host must already have an active/trial subscription
  if (parsed.data.billing_mode === 'subscription') {
    const { data: sub } = await db.from('wb_host_subscriptions').select('status').eq('host_id', user.id).maybeSingle();
    if (!sub || !['trial', 'active', 'grace'].includes(sub.status)) {
      return NextResponse.json({ error: 'Activate a subscription first (POST /api/subscriptions/activate)' }, { status: 409 });
    }
  }

  try {
    await toggleListingBillingMode(db, {
      listing_id: parsed.data.listing_id,
      listing_type: parsed.data.listing_type,
      billing_mode: parsed.data.billing_mode,
      actor_id: user.id,
      actor_role: 'host',
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Toggle failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminDb, activateSubscription, logEvent } from '@/lib/subscriptions/server';

const Body = z.object({
  host_id: z.string().uuid(),
  plan: z.enum(['monthly', 'annual']),
  listing_ids: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(['property', 'boat']),
  })).min(1),
  reason: z.string().min(3).max(500),
});

// Admin-only: force-activate a subscription with trial even if the
// anti-abuse checks would otherwise block it. Audited explicitly.
export async function POST(req: NextRequest) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const db = adminDb();
  const { data: profile } = await db.from('wb_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const properties = parsed.data.listing_ids.filter(x => x.type === 'property').map(x => x.id);
  const boats      = parsed.data.listing_ids.filter(x => x.type === 'boat').map(x => x.id);

  const [{ data: p }, { data: b }, { data: targetProfile }] = await Promise.all([
    properties.length ? db.from('wb_properties').select('id, owner_id, latitude, longitude, name, address, created_at').in('id', properties) : Promise.resolve({ data: [] as any[] }),
    boats.length      ? db.from('wb_boats').select('id, owner_id, latitude, longitude, name, departure_point, created_at').in('id', boats) : Promise.resolve({ data: [] as any[] }),
    db.from('wb_profiles').select('phone').eq('id', parsed.data.host_id).maybeSingle(),
  ]);

  const badOwner = [
    ...(p ?? []).filter((x: any) => x.owner_id !== parsed.data.host_id).map((x: any) => x.id),
    ...(b ?? []).filter((x: any) => x.owner_id !== parsed.data.host_id).map((x: any) => x.id),
  ];
  if (badOwner.length > 0) return NextResponse.json({ error: 'Target host does not own these listings', listing_ids: badOwner }, { status: 400 });

  const listings = [
    ...((p ?? []) as any[]).map((x) => ({ listing_id: x.id, listing_type: 'property' as const, latitude: x.latitude, longitude: x.longitude, title: x.name, address: x.address, created_at: x.created_at })),
    ...((b ?? []) as any[]).map((x) => ({ listing_id: x.id, listing_type: 'boat' as const, latitude: x.latitude, longitude: x.longitude, title: x.name, address: x.departure_point, created_at: x.created_at })),
  ];

  try {
    const result = await activateSubscription(db, {
      host_id: parsed.data.host_id,
      plan: parsed.data.plan,
      listings,
      phone: targetProfile?.phone ?? null,
      admin_override: true,
      actor_id: user.id,
      actor_role: 'admin',
    });

    await logEvent(db, {
      host_id: parsed.data.host_id,
      subscription_id: result.subscription.id,
      event_type: 'admin_trial_override',
      actor_id: user.id,
      actor_role: 'admin',
      payload: { reason: parsed.data.reason, trial_months: result.trial_granted_months },
    });

    return NextResponse.json({ ok: true, subscription: result.subscription, trial_months: result.trial_granted_months });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Override failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

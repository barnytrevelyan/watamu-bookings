import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminDb, activateSubscription } from '@/lib/subscriptions/server';

const Body = z.object({
  plan: z.enum(['monthly', 'annual']),
  listing_ids: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(['property', 'boat']),
  })).min(1),
  device_hash: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  // Auth: must be logged in
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = adminDb();

  // Verify the host owns every nominated listing
  const properties = parsed.data.listing_ids.filter(x => x.type === 'property').map(x => x.id);
  const boats = parsed.data.listing_ids.filter(x => x.type === 'boat').map(x => x.id);
  const [{ data: p }, { data: b }] = await Promise.all([
    properties.length ? db.from('wb_properties').select('id, owner_id, latitude, longitude, name, address, created_at').in('id', properties) : Promise.resolve({ data: [] as any[] }),
    boats.length ? db.from('wb_boats').select('id, owner_id, latitude, longitude, name, departure_point, created_at').in('id', boats) : Promise.resolve({ data: [] as any[] }),
  ]);
  const notOwned = [
    ...(p ?? []).filter((x: any) => x.owner_id !== user.id).map((x: any) => x.id),
    ...(b ?? []).filter((x: any) => x.owner_id !== user.id).map((x: any) => x.id),
  ];
  if (notOwned.length > 0) return NextResponse.json({ error: 'You do not own one or more of these listings', listing_ids: notOwned }, { status: 403 });

  // Load host phone
  const { data: profile } = await db.from('wb_profiles').select('phone').eq('id', user.id).maybeSingle();

  const listings = [
    ...((p ?? []) as any[]).map((x) => ({
      listing_id: x.id,
      listing_type: 'property' as const,
      latitude: x.latitude,
      longitude: x.longitude,
      title: x.name,
      address: x.address,
      created_at: x.created_at,
    })),
    ...((b ?? []) as any[]).map((x) => ({
      listing_id: x.id,
      listing_type: 'boat' as const,
      latitude: x.latitude,
      longitude: x.longitude,
      title: x.name,
      address: x.departure_point,
      created_at: x.created_at,
    })),
  ];

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  try {
    const result = await activateSubscription(db, {
      host_id: user.id,
      plan: parsed.data.plan,
      listings,
      phone: profile?.phone ?? null,
      device_hash: parsed.data.device_hash ?? null,
      ip,
      actor_id: user.id,
      actor_role: 'host',
    });
    return NextResponse.json({
      ok: true,
      subscription: result.subscription,
      trial_months: result.trial_granted_months,
      invoice: result.invoice ?? null,
      soft_flags: result.soft_flags,
    });
  } catch (err: any) {
    console.error('[activate] failed', err);
    return NextResponse.json({ error: err?.message ?? 'Activation failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminDb, checkTrialEligibility } from '@/lib/subscriptions/server';

const Body = z.object({
  device_hash: z.string().optional().nullable(),
  listing_ids: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(['property', 'boat']),
  })).default([]),
});

export async function POST(req: NextRequest) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = adminDb();

  const properties = parsed.data.listing_ids.filter(x => x.type === 'property').map(x => x.id);
  const boats      = parsed.data.listing_ids.filter(x => x.type === 'boat').map(x => x.id);

  const [{ data: p }, { data: b }, { data: profile }] = await Promise.all([
    properties.length ? db.from('wb_properties').select('id, owner_id, latitude, longitude, name, address').in('id', properties) : Promise.resolve({ data: [] as any[] }),
    boats.length      ? db.from('wb_boats').select('id, owner_id, latitude, longitude, name, departure_point').in('id', boats) : Promise.resolve({ data: [] as any[] }),
    db.from('wb_profiles').select('phone').eq('id', user.id).maybeSingle(),
  ]);

  const notOwned = [
    ...(p ?? []).filter((x: any) => x.owner_id !== user.id).map((x: any) => x.id),
    ...(b ?? []).filter((x: any) => x.owner_id !== user.id).map((x: any) => x.id),
  ];
  if (notOwned.length > 0) return NextResponse.json({ error: 'You do not own one or more of these listings', listing_ids: notOwned }, { status: 403 });

  const listings = [
    ...((p ?? []) as any[]).map((x) => ({ listing_id: x.id, listing_type: 'property' as const, latitude: x.latitude, longitude: x.longitude, title: x.name, address: x.address })),
    ...((b ?? []) as any[]).map((x) => ({ listing_id: x.id, listing_type: 'boat' as const, latitude: x.latitude, longitude: x.longitude, title: x.name, address: x.departure_point })),
  ];

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  const eligibility = await checkTrialEligibility(db, {
    host_id: user.id,
    phone: profile?.phone ?? null,
    listings,
    device_hash: parsed.data.device_hash ?? null,
    ip,
  });

  return NextResponse.json(eligibility);
}

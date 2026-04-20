import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminDb, cancelSubscription } from '@/lib/subscriptions/server';

const Body = z.object({
  reason: z.string().max(500).optional().nullable(),
  revert_listings: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await cancelSubscription(adminDb(), {
      host_id: user.id,
      reason: parsed.data.reason ?? undefined,
      revert_listings: parsed.data.revert_listings,
      actor_id: user.id,
      actor_role: 'host',
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cancel failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

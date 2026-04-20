import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminDb, markInvoicePaid } from '@/lib/subscriptions/server';

const Body = z.object({
  invoice_id: z.string().uuid(),
  method: z.enum(['bank_transfer', 'mpesa', 'cash', 'stripe', 'waived']),
  reference: z.string().max(200).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  // Admin check
  const db = adminDb();
  const { data: profile } = await db.from('wb_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await markInvoicePaid(db, {
      invoice_id: parsed.data.invoice_id,
      method: parsed.data.method,
      reference: parsed.data.reference ?? undefined,
      actor_id: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Mark paid failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

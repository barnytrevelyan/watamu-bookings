import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/events — ingest a single guest-funnel analytics event.
 *
 * Called from the browser via navigator.sendBeacon (see
 * src/lib/analytics/track.ts). The client never hits wb_events
 * directly — RLS is locked and we mint rows here with the
 * service-role client after a light shape + size check.
 *
 * We intentionally don't validate every field hard: analytics tags
 * are allowed to be slightly sloppy (the alternative is losing data),
 * and the payload is a JSONB blob so schema drift is cheap.
 */

// Keep the accepted vocabulary in sync with src/lib/analytics/events.ts.
// Duplicated here so a typoed client event gets rejected server-side
// even if someone forgets to update the union type.
const VALID_EVENTS = new Set([
  'property_view',
  'gallery_open',
  'availability_checked',
  'booking_started',
  'booking_confirmed',
  'search_view',
  'filter_applied',
  'card_clicked',
]);

const MAX_STR = 512;
const MAX_PAYLOAD_BYTES = 4_000;

function clip(s: unknown, max = MAX_STR): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_PAYLOAD_BYTES * 2) {
      // Hard ceiling — no legitimate event should push past a few KB.
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let body: {
      event_name?: string;
      session_id?: string;
      property_id?: string | null;
      boat_id?: string | null;
      payload?: Record<string, unknown>;
      path?: string;
      referrer?: string | null;
    };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const event_name = clip(body.event_name, 64);
    if (!event_name || !VALID_EVENTS.has(event_name)) {
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    }

    const session_id = clip(body.session_id, 128);
    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const property_id = isUuid(body.property_id) ? body.property_id : null;
    const boat_id = isUuid(body.boat_id) ? body.boat_id : null;

    // Payload must be a plain object; cap its JSON size.
    let payload: Record<string, unknown> = {};
    if (body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)) {
      const s = JSON.stringify(body.payload);
      if (s.length <= MAX_PAYLOAD_BYTES) payload = body.payload;
    }

    // Resolve user_id from the auth cookie — never trust the client.
    let user_id: string | null = null;
    try {
      const authed = await createServerClient();
      const { data: { user } } = await authed.auth.getUser();
      user_id = user?.id ?? null;
    } catch {
      // No session is fine — most funnel events are anonymous.
    }

    const admin = createAdminClient();
    const { error } = await admin.from('wb_events').insert({
      event_name,
      session_id,
      user_id,
      property_id,
      boat_id,
      payload,
      path: clip(body.path, MAX_STR),
      referrer: clip(body.referrer, MAX_STR),
    });

    if (error) {
      console.error('[events] insert failed', error);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    // 204 keeps sendBeacon happy without forcing a response body.
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[events] unexpected error', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

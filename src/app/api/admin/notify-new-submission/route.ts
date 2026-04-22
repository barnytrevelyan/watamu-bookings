import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { sendTransactional } from '@/lib/email/zeptomail';
import { newListingForReviewEmail } from '@/lib/email/templates';

/**
 * POST /api/admin/notify-new-submission
 *
 * Fires after a host submits a new property/boat for admin review.
 * Body: { listing_id: string, listing_type: 'property' | 'boat' }
 *
 * Auth: the caller must be authenticated AND must be the owner of the listing
 * (or the caller's profile must be role='admin' — for cases like the admin
 * creating listings on behalf of a host). The listing must currently be in
 * status = 'pending_review'. Otherwise we return early without sending mail,
 * so the endpoint can't be spammed to blast admin inboxes.
 *
 * We then look up all wb_profiles with role='admin' via the service-role
 * client and send them the "new listing awaiting review" email.
 *
 * Fire-and-forget from the client: failures log server-side but return 200
 * with { ok: false, reason } so the caller's submit UX is never blocked.
 */
export async function POST(request: NextRequest) {
  let body: { listing_id?: string; listing_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_body' }, { status: 400 });
  }

  const listingId = body.listing_id;
  const listingType = body.listing_type;
  if (!listingId || (listingType !== 'property' && listingType !== 'boat')) {
    return NextResponse.json({ ok: false, reason: 'bad_params' }, { status: 400 });
  }

  // 1. Authenticate the caller.
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, reason: 'unauthenticated' }, { status: 401 });
  }

  // 2. Look up the listing + owner + place via service role (bypass RLS).
  //    Property and boat rows are fetched via separate branches because the
  //    two tables don't share the same column set (place_id is property-only)
  //    and the Supabase TS typegen can't resolve a conditional select string.
  const admin = createAdminClient();

  let listingRow: {
    id: string;
    name: string | null;
    owner_id: string;
    status: string;
    place_id?: string | null;
  } | null = null;

  if (listingType === 'boat') {
    const { data, error } = await admin
      .from('wb_boats')
      .select('id, name, owner_id, status')
      .eq('id', listingId)
      .single();
    if (error || !data) {
      return NextResponse.json({ ok: false, reason: 'listing_not_found' }, { status: 404 });
    }
    listingRow = data;
  } else {
    const { data, error } = await admin
      .from('wb_properties')
      .select('id, name, owner_id, status, place_id')
      .eq('id', listingId)
      .single();
    if (error || !data) {
      return NextResponse.json({ ok: false, reason: 'listing_not_found' }, { status: 404 });
    }
    listingRow = data;
  }

  const listing = listingRow;

  // 3. Verify caller is the owner, or the caller is an admin.
  let callerIsAdmin = false;
  if (listing.owner_id !== user.id) {
    const { data: callerProfile } = await admin
      .from('wb_profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    callerIsAdmin = callerProfile?.role === 'admin';
    if (!callerIsAdmin) {
      return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
    }
  }

  // 4. Only notify if the listing is actually awaiting review right now.
  //    Prevents stale replays and noise on draft/approved rows.
  if (listing.status !== 'pending_review') {
    return NextResponse.json({ ok: false, reason: 'not_pending_review', status: listing.status });
  }

  // 5. Resolve host profile for the email body.
  const { data: host } = await admin
    .from('wb_profiles')
    .select('full_name, email')
    .eq('id', listing.owner_id)
    .single();

  // 6. Resolve place name if present (properties only).
  let placeName: string | null = null;
  if (listingType === 'property' && listing.place_id) {
    const { data: place } = await admin
      .from('wb_places')
      .select('name')
      .eq('id', listing.place_id)
      .single();
    placeName = place?.name ?? null;
  }

  // 7. Fetch admin recipients.
  const { data: admins, error: adminsErr } = await admin
    .from('wb_profiles')
    .select('email, full_name')
    .eq('role', 'admin')
    .not('email', 'is', null);

  if (adminsErr || !admins || admins.length === 0) {
    console.warn('[notify-new-submission] no admin recipients found', { adminsErr });
    return NextResponse.json({ ok: false, reason: 'no_admin_recipients' });
  }

  // 8. Compose + send.
  const payload = newListingForReviewEmail({
    listingId: listing.id,
    listingType,
    listingName: listing.name ?? '(unnamed)',
    hostName: host?.full_name ?? null,
    hostEmail: host?.email ?? null,
    placeName,
  });

  const results = await Promise.allSettled(
    admins.map((a) =>
      sendTransactional({
        to: { email: a.email as string, name: (a.full_name as string) ?? undefined },
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      })
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;
  const failed = results.length - sent;
  if (failed > 0) {
    console.warn('[notify-new-submission] some admin emails failed', {
      listingId,
      listingType,
      sent,
      failed,
    });
  }

  return NextResponse.json({ ok: true, notified: sent, failed });
}

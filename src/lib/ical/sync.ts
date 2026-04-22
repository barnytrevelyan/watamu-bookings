/**
 * Shared iCal import logic. Used by:
 *   - /api/ical/import  (user-triggered, after connecting or clicking "Sync Now")
 *   - /api/cron/ical-sync (scheduled, refreshes all active feeds)
 *
 * Consumes a Supabase service-role client so it can read/write across
 * owners. Do NOT pass a user-scoped client to these functions — RLS will
 * block the cross-owner updates the cron needs.
 */

interface ICalEvent {
  uid: string;
  dtstart: string;
  dtend: string;
  summary: string;
}

function parseIcal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const blocks = text.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];

    const uid = extractField(block, 'UID') || `imported-${i}`;
    const summary = extractField(block, 'SUMMARY') || 'Blocked';

    let dtstart = extractField(block, 'DTSTART') || '';
    let dtend = extractField(block, 'DTEND') || '';

    const dtstartMatch = block.match(/DTSTART[^:]*:(\d{8})/);
    const dtendMatch = block.match(/DTEND[^:]*:(\d{8})/);

    if (dtstartMatch) dtstart = dtstartMatch[1];
    if (dtendMatch) dtend = dtendMatch[1];

    if (dtstart.length === 8) {
      dtstart = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    } else if (dtstart.length >= 15) {
      dtstart = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    }

    if (dtend.length === 8) {
      dtend = `${dtend.slice(0, 4)}-${dtend.slice(4, 6)}-${dtend.slice(6, 8)}`;
    } else if (dtend.length >= 15) {
      dtend = `${dtend.slice(0, 4)}-${dtend.slice(4, 6)}-${dtend.slice(6, 8)}`;
    }

    if (dtstart) {
      events.push({ uid, dtstart, dtend: dtend || dtstart, summary });
    }
  }

  return events;
}

function extractField(block: string, field: string): string | null {
  const regex = new RegExp(`^${field}(?:;[^:]*)?:(.+)`, 'm');
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);

  // iCal DTEND for all-day events is exclusive (the day after the last blocked day).
  while (current < endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export interface SyncResult {
  blocked_dates: number;
  events: number;
}

/**
 * Sync a single iCal feed into its listing's availability table.
 * Records sync_error / last_synced_at on the feed row regardless of outcome
 * so the dashboard can surface errors to the host.
 */
// adminClient is a Supabase service-role client; we avoid pulling the
// SupabaseClient type here because both the server and edge runtimes import
// this file, and the generic type wiring isn't worth the indirection.
export async function syncFeed(feedId: string, adminClient: any): Promise<SyncResult> {
  const { data: feed, error } = await adminClient
    .from('wb_ical_feeds')
    .select('*')
    .eq('id', feedId)
    .single();

  if (error || !feed || !feed.external_url) {
    throw new Error('Feed not found or has no external URL');
  }

  const response = await fetch(feed.external_url, {
    headers: {
      'User-Agent': `${process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Kwetu'}/1.0 iCal Sync`,
      'Accept': 'text/calendar',
    },
  });

  if (!response.ok) {
    const errorMsg = `Failed to fetch calendar: ${response.status}`;
    await adminClient
      .from('wb_ical_feeds')
      .update({ sync_error: errorMsg, last_synced_at: new Date().toISOString() })
      .eq('id', feedId);
    throw new Error(errorMsg);
  }

  const icalText = await response.text();
  const events = parseIcal(icalText);

  const today = new Date().toISOString().split('T')[0];
  const datesToBlock = new Set<string>();

  for (const event of events) {
    const range = getDateRange(event.dtstart, event.dtend);
    for (const date of range) {
      if (date >= today) {
        datesToBlock.add(date);
      }
    }
  }

  if (datesToBlock.size === 0) {
    await adminClient
      .from('wb_ical_feeds')
      .update({ sync_error: null, last_synced_at: new Date().toISOString() })
      .eq('id', feedId);
    return { blocked_dates: 0, events: events.length };
  }

  const availTable =
    feed.listing_type === 'property' ? 'wb_availability' : 'wb_boat_availability';
  const idColumn = feed.listing_type === 'property' ? 'property_id' : 'boat_id';

  const rows = Array.from(datesToBlock).map((date) => ({
    [idColumn]: feed.listing_id,
    date,
    is_available: false,
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await adminClient.from(availTable).upsert(batch, { onConflict: `${idColumn},date` });
  }

  await adminClient
    .from('wb_ical_feeds')
    .update({
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', feedId);

  return {
    blocked_dates: datesToBlock.size,
    events: events.length,
  };
}

/**
 * Summary for a batch sync run (used by the cron).
 */
export interface BatchSyncSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ feed_id: string; message: string }>;
}

/**
 * Sync every active iCal import feed. Errors on individual feeds are
 * recorded on the feed row and don't abort the batch.
 */
export async function syncAllActiveFeeds(adminClient: any): Promise<BatchSyncSummary> {
  const { data: feeds, error } = await adminClient
    .from('wb_ical_feeds')
    .select('id')
    .eq('is_active', true)
    .not('external_url', 'is', null);

  if (error) throw new Error(`Failed to list feeds: ${error.message}`);

  const summary: BatchSyncSummary = {
    attempted: feeds?.length ?? 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const feed of feeds ?? []) {
    try {
      await syncFeed(feed.id, adminClient);
      summary.succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.failed += 1;
      summary.errors.push({ feed_id: feed.id, message: msg });
    }
  }

  return summary;
}

export function detectIcalSource(url: string): string {
  if (url.includes('airbnb')) return 'airbnb';
  if (url.includes('booking.com')) return 'booking_com';
  if (url.includes('google')) return 'google';
  return 'other';
}

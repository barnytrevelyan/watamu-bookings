'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import toast from 'react-hot-toast';

interface CalendarFeed {
  id: string;
  external_url: string | null;
  external_source: string | null;
  export_url: string;
  export_token: string;
  last_synced_at: string | null;
  sync_error: string | null;
  is_active: boolean;
  created_at: string;
}

interface Props {
  listingType: 'property' | 'boat';
  listingId: string;
  listingName: string;
}

const SOURCE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  google: 'Google Calendar',
  other: 'External Calendar',
};

const SOURCE_HELP: Record<string, string> = {
  airbnb: 'In Airbnb: Listing → Availability → Export Calendar → Copy link',
  booking_com: 'In Booking.com: Property → Calendar → Export → Copy iCal link',
  google: 'In Google Calendar: Settings → Calendar → Secret address in iCal format',
};

export default function CalendarSync({ listingType, listingId, listingName }: Props) {
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchFeeds = useCallback(async () => {
    try {
      const res = await fetch(`/api/ical/feeds?listing_type=${listingType}&listing_id=${listingId}`);
      const data = await res.json();
      if (data.feeds) setFeeds(data.feeds);
    } catch {
      console.error('Failed to load calendar feeds');
    } finally {
      setLoading(false);
    }
  }, [listingType, listingId]);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  // Ensure an export feed exists
  const exportFeed = feeds.find(f => !f.external_url);
  const importFeeds = feeds.filter(f => f.external_url);

  async function ensureExportFeed() {
    if (exportFeed) return exportFeed;

    const res = await fetch('/api/ical/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_type: listingType, listing_id: listingId }),
    });
    const data = await res.json();
    if (data.feed) {
      setFeeds(prev => [...prev, data.feed]);
      return data.feed;
    }
    return null;
  }

  async function handleCopyExportUrl() {
    const feed = await ensureExportFeed();
    if (feed?.export_url) {
      await navigator.clipboard.writeText(feed.export_url);
      setCopied(true);
      toast.success('Calendar URL copied!');
      setTimeout(() => setCopied(false), 3000);
    }
  }

  async function handleAddImport() {
    if (!newUrl.trim()) return;

    setAdding(true);
    try {
      // First create the feed
      const res = await fetch('/api/ical/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_type: listingType,
          listing_id: listingId,
          external_url: newUrl.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      // Now sync it
      const syncRes = await fetch('/api/ical/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_id: data.feed.id }),
      });
      const syncData = await syncRes.json();

      toast.success(syncData.message || 'Calendar connected!');
      setNewUrl('');
      setShowAddForm(false);
      fetchFeeds();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add calendar');
    } finally {
      setAdding(false);
    }
  }

  async function handleSync(feedId: string) {
    setSyncing(feedId);
    try {
      const res = await fetch('/api/ical/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_id: feedId }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      toast.success(data.message || 'Synced!');
      fetchFeeds();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(null);
    }
  }

  async function handleRemove(feedId: string) {
    try {
      await fetch(`/api/ical/feeds?id=${feedId}`, { method: 'DELETE' });
      setFeeds(prev => prev.filter(f => f.id !== feedId));
      toast.success('Calendar removed');
    } catch {
      toast.error('Failed to remove calendar');
    }
  }

  if (loading) {
    return (
      <Card className="p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Calendar Sync</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Keep your availability in sync across Airbnb, Booking.com, and other platforms.
          </p>
        </div>
      </div>

      {/* Export section */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-teal-900">Export to other platforms</p>
            <p className="text-xs text-teal-700 mt-0.5">
              Copy this calendar URL into Airbnb or Booking.com to automatically block dates when you get a booking here.
            </p>
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyExportUrl}
                className="text-xs"
              >
                {copied ? 'Copied!' : 'Copy Calendar URL'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Import section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Import from other platforms</p>
          {!showAddForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="text-xs"
            >
              + Connect Calendar
            </Button>
          )}
        </div>

        {/* Existing import feeds */}
        {importFeeds.length > 0 && (
          <div className="space-y-2">
            {importFeeds.map((feed) => (
              <div
                key={feed.id}
                className="flex items-center justify-between gap-3 py-2.5 px-3 bg-gray-50 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {SOURCE_LABELS[feed.external_source || 'other']}
                    </span>
                    {feed.sync_error && (
                      <span className="text-xs text-red-500">Sync error</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{feed.external_url}</p>
                  {feed.last_synced_at && (
                    <p className="text-xs text-gray-400">
                      Last synced: {new Date(feed.last_synced_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSync(feed.id)}
                    disabled={syncing === feed.id}
                    className="text-xs"
                  >
                    {syncing === feed.id ? 'Syncing...' : 'Sync Now'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(feed.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {importFeeds.length === 0 && !showAddForm && (
          <p className="text-xs text-gray-400 py-2">
            No external calendars connected yet. Connect your Airbnb or Booking.com calendar to auto-block dates.
          </p>
        )}

        {/* Add new import */}
        {showAddForm && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <p className="text-sm text-gray-700">Paste the iCal URL from your other platform:</p>

            <div className="text-xs text-gray-500 space-y-1">
              {Object.entries(SOURCE_HELP).map(([key, help]) => (
                <p key={key}>
                  <span className="font-medium">{SOURCE_LABELS[key]}:</span> {help}
                </p>
              ))}
            </div>

            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=abc..."
              className="text-sm"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowAddForm(false); setNewUrl(''); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddImport}
                disabled={adding || !newUrl.trim()}
              >
                {adding ? 'Connecting...' : 'Connect Calendar'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

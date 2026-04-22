'use client';

/**
 * Lightweight analytics sink for Kwetu's first-party funnel tracking.
 *
 * Design notes
 * ------------
 *  - Fire-and-forget: callers get a void-returning helper; we never
 *    block a user interaction waiting for an event to land.
 *  - Session id lives in localStorage (KWETU_SESSION_ID) so we can
 *    stitch an anonymous view to a later post-login booking_confirmed
 *    without cross-device tracking.
 *  - We use navigator.sendBeacon when available (survives page nav
 *    into checkout, unlike fetch) with a JSON fetch fallback.
 *  - Events are posted one at a time — the volume is low and batching
 *    would just delay booking_confirmed landing ahead of the redirect.
 *  - No PII in the client. Server route is authoritative for user_id
 *    (derived from the session cookie).
 *
 * Call sites should use the thin {@link track} function below, or the
 * {@link useTrack} hook when they need the callback stable across
 * renders. Server-side callers (e.g. the M-Pesa webhook) should hit
 * POST /api/events directly with the service-role internal token.
 */

import { useCallback } from 'react';
import type { EventName, TrackedEvent } from './events';

const SESSION_KEY = 'kwetu_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled — fall back to an in-memory id
    // per page load. Worse than localStorage but still lets a single
    // session be stitched within the tab.
    return 'ephemeral-' + Math.random().toString(36).slice(2);
  }
}

export function track(event: TrackedEvent): void {
  if (typeof window === 'undefined') return;

  const body = {
    event_name: event.event_name,
    session_id: getSessionId(),
    property_id: event.property_id ?? null,
    boat_id: event.boat_id ?? null,
    payload: event.payload ?? {},
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || null,
  };

  try {
    const json = JSON.stringify(body);
    const url = '/api/events';
    // sendBeacon is ideal for "emit on navigate away" — it queues in
    // the browser and delivers even after the page unloads.
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([json], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
    // Fallback for Safari ITP / extensions blocking sendBeacon.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    }).catch(() => {
      /* swallow — analytics must never break the page */
    });
  } catch {
    /* noop */
  }
}

export function useTrack(): (event: TrackedEvent) => void {
  return useCallback(track, []);
}

export type { EventName, TrackedEvent };

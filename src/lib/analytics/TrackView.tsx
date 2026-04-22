'use client';

/**
 * Tiny client component that fires a single analytics event when it
 * mounts. Useful from server components — drop it into the tree with
 * the event name + ids and it'll emit once per page view.
 *
 * React 18 in dev intentionally double-invokes effects under
 * StrictMode; a ref-guard keeps us from counting one view twice.
 */

import { useEffect, useRef } from 'react';
import { track } from './track';
import type { EventName } from './events';

interface Props {
  event: EventName;
  propertyId?: string | null;
  boatId?: string | null;
  payload?: Record<string, unknown>;
}

export default function TrackView({ event, propertyId, boatId, payload }: Props) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track({
      event_name: event,
      property_id: propertyId ?? null,
      boat_id: boatId ?? null,
      payload: payload ?? {},
    });
    // We deliberately don't re-fire on prop changes — a page view is
    // a once-per-mount concept. Same page with different props would
    // be a separate navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

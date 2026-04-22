/**
 * Canonical vocabulary of analytics events we track.
 *
 * Kept narrow on purpose: the funnel chart on the per-property
 * analytics page is built against these names, so a stray typo in a
 * new call site quietly breaks the funnel. Extend this union when you
 * add a new event rather than inlining strings.
 */
export type EventName =
  | 'property_view'           // guest loads /properties/[slug]
  | 'gallery_open'            // guest opens the lightbox
  | 'availability_checked'    // guest picks dates / adjusts travellers
  | 'booking_started'         // guest clicks "Request to book"
  | 'booking_confirmed'       // payment webhook flipped booking to confirmed
  | 'search_view'             // guest landed on /properties (search)
  | 'filter_applied'          // guest toggled a filter chip
  | 'card_clicked';           // guest clicked a property card in search

export interface TrackedEvent {
  event_name: EventName;
  property_id?: string | null;
  boat_id?: string | null;
  payload?: Record<string, unknown>;
}

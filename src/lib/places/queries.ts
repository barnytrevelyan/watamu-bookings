/**
 * Query builders that apply the current place filter to wb_properties
 * and wb_boats public queries.
 *
 * Private dashboard / admin queries don't use these — those scope by
 * owner_id and must see listings across every place.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Place } from '@/lib/types';

/**
 * For properties the relationship is 1:1 — just add .eq('place_id', …).
 * Pass `null` (or undefined) on multi-place shells to skip the filter.
 */
export function filterPropertiesByPlace<Q extends { eq: (col: string, val: string) => Q }>(
  query: Q,
  place: Place | null | undefined
): Q {
  if (!place) return query;
  return query.eq('place_id', place.id);
}

/**
 * Boats can span multiple places via wb_boat_places. To filter we embed
 * wb_boat_places!inner and filter on the embedded column, which makes
 * PostgREST rewrite the query to an inner join.
 *
 * `selectColumns` is the caller's existing select string. We append a
 * hidden `wb_boat_places!inner(place_id)` so the inner join runs; if the
 * caller's select already embeds wb_boat_places we honour that instead
 * of double-adding.
 */
export function boatQueryWithPlaceFilter(
  supabase: SupabaseClient,
  selectColumns: string,
  place: Place | null | undefined,
  table: 'wb_boats' = 'wb_boats'
) {
  if (!place) {
    return supabase.from(table).select(selectColumns);
  }
  const joinFragment = 'wb_boat_places!inner(place_id, is_primary)';
  const select =
    selectColumns.includes('wb_boat_places') && selectColumns.includes('!inner')
      ? selectColumns
      : selectColumns.endsWith(')')
        ? `${selectColumns.slice(0, -1)}, ${joinFragment})`
        : `${selectColumns}, ${joinFragment}`;
  return supabase
    .from(table)
    .select(select)
    .eq('wb_boat_places.place_id', place.id);
}

/**
 * Convenience for count queries on boats-in-place (used by sitemap /
 * place landing pages). Returns the count of published boats in a place.
 */
export async function countPublishedBoatsInPlace(
  supabase: SupabaseClient,
  place: Place
): Promise<number> {
  const { count } = await supabase
    .from('wb_boats')
    .select('id, wb_boat_places!inner(place_id)', { count: 'exact', head: true })
    .eq('is_published', true)
    .eq('wb_boat_places.place_id', place.id);
  return count ?? 0;
}

/** Same idea for properties. */
export async function countPublishedPropertiesInPlace(
  supabase: SupabaseClient,
  place: Place
): Promise<number> {
  const { count } = await supabase
    .from('wb_properties')
    .select('id', { count: 'exact', head: true })
    .eq('is_published', true)
    .eq('place_id', place.id);
  return count ?? 0;
}

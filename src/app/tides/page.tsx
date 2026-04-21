import { notFound } from 'next/navigation';
import TidesClient from './TidesClient';
import { getCurrentPlace } from '@/lib/places/context';

/**
 * Server wrapper — resolves the current place from host/headers and hands it
 * to the interactive TidesClient. Keeps the client component free of server
 * dependencies (headers(), supabase-server, etc).
 */
export default async function TidesPage() {
  const { place } = await getCurrentPlace();
  // Feature gate: inland places without tidal data get a 404 here.
  if (place && !place.features.includes('tides')) notFound();
  return <TidesClient place={place} />;
}

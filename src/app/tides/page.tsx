import TidesClient from './TidesClient';
import { getCurrentPlace } from '@/lib/places/context';

/**
 * Server wrapper — resolves the current place from host/headers and hands it
 * to the interactive TidesClient. Keeps the client component free of server
 * dependencies (headers(), supabase-server, etc).
 */
export default async function TidesPage() {
  const { place } = await getCurrentPlace();
  return <TidesClient place={place} />;
}

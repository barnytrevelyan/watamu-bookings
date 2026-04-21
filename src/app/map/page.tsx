import MapClient from './MapClient';
import { getCurrentPlace } from '@/lib/places/context';

/**
 * Thin server wrapper — resolves the current place from host/headers and
 * hands it to the interactive MapClient. We keep the client code free of
 * server dependencies (and therefore free of the Next/React Server
 * Component + Leaflet friction).
 */
export default async function MapPage() {
  const { place } = await getCurrentPlace();
  return <MapClient place={place} />;
}

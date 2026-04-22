import type { Metadata } from 'next';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { place } = await getCurrentPlace();
  // Tide metadata: on a resolved place (Watamu, Kilifi, etc.) use the
  // place name. On the generic multi-place shell, "Kwetu tide times"
  // reads as if Kwetu were a town, so fall back to "Kenyan coast".
  const placeLabel = place?.name ?? 'Kenyan coast';
  const titleLabel = place?.name ?? 'Kenyan coast';
  return {
    title: `${titleLabel} tide times — live tide predictions for the Kenyan coast`,
    description: place
      ? `Accurate harmonic tide predictions for ${placeLabel}, Kenya. Plan your fishing trips, dhow cruises, snorkelling and beach walks around the daily tide cycle.`
      : `Accurate harmonic tide predictions for the Kenyan coast. Plan your fishing trips, dhow cruises, snorkelling and beach walks around the daily tide cycle.`,
    keywords: [
      `${placeLabel} tides`,
      'Kenya coast tide predictions',
      `${placeLabel} beach tide`,
      `fishing tide times ${placeLabel}`,
    ],
    openGraph: {
      title: `${titleLabel} tide times`,
      description: place
        ? `Live harmonic tide predictions for ${placeLabel}, Kenya — calibrated for the Kilindini datum.`
        : `Live harmonic tide predictions for the Kenyan coast — calibrated for the Kilindini datum.`,
      type: 'website',
    },
  };
}

export default function TidesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

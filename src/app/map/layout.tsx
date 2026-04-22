import type { Metadata } from 'next';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { place } = await getCurrentPlace();
  // Map metadata: if no place is resolved (generic multi-place shell)
  // scope the title to the Kenyan coast rather than "Kwetu map", which
  // reads as if Kwetu were a town.
  const placeLabel = place?.name ?? 'Kenyan coast';
  return {
    title: `${placeLabel} map — beaches, landmarks and what to see`,
    description: place
      ? `Interactive map of ${placeLabel}, Kenya — beaches, marine parks, restaurants and landmarks.`
      : `Interactive map of the Kenyan coast — beaches, marine parks, restaurants and landmarks.`,
    keywords: [
      `${placeLabel} map`,
      `${placeLabel} landmarks`,
      `${placeLabel} attractions`,
    ],
    openGraph: {
      title: `${placeLabel} map`,
      description: place
        ? `Interactive map of beaches, landmarks and attractions in ${placeLabel}, Kenya.`
        : `Interactive map of beaches, landmarks and attractions on the Kenyan coast.`,
      type: 'website',
    },
  };
}

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}

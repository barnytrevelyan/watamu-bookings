import type { Metadata } from 'next';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { place, host } = await getCurrentPlace();
  const placeName = place?.name ?? host.brand_short;
  return {
    title: `${placeName} map — beaches, landmarks and what to see`,
    description: `Interactive map of ${placeName}, Kenya — beaches, marine parks, restaurants and landmarks.`,
    keywords: [
      `${placeName} map`,
      `${placeName} landmarks`,
      `${placeName} attractions`,
    ],
    openGraph: {
      title: `${placeName} map`,
      description: `Interactive map of beaches, landmarks and attractions in ${placeName}, Kenya.`,
      type: 'website',
    },
  };
}

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}

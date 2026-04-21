import type { Metadata } from 'next';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { place, host } = await getCurrentPlace();
  const placeName = place?.name ?? host.brand_short;
  return {
    title: `${placeName} tide times — live tide predictions for the Kenyan coast`,
    description: `Accurate harmonic tide predictions for ${placeName}, Kenya. Plan your fishing trips, dhow cruises, snorkelling and beach walks around the daily tide cycle.`,
    keywords: [
      `${placeName} tides`,
      'Kenya coast tide predictions',
      `${placeName} beach tide`,
      `fishing tide times ${placeName}`,
    ],
    openGraph: {
      title: `${placeName} tide times`,
      description: `Live harmonic tide predictions for ${placeName}, Kenya — calibrated for the Kilindini datum.`,
      type: 'website',
    },
  };
}

export default function TidesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watamu tide times — live tide predictions for the Kenyan coast',
  description:
    'Accurate harmonic tide predictions for Watamu and Kilindini, Kenya. Plan your fishing trips, dhow cruises, snorkelling and beach walks around the daily tide cycle.',
  keywords: [
    'Watamu tides',
    'Kilifi tide times',
    'Kenya coast tide predictions',
    'Watamu beach tide',
    'fishing tide times Watamu',
  ],
  openGraph: {
    title: 'Watamu tide times',
    description:
      'Live harmonic tide predictions for Watamu, Kenya — calibrated for the Kilindini datum.',
    type: 'website',
  },
};

export default function TidesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

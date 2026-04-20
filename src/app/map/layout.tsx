import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Watamu map — beaches, landmarks and what to see',
  description:
    'Interactive map of Watamu, Kenya — beaches, Watamu Marine National Park, Mida Creek, Gede ruins, restaurants and landmarks.',
  keywords: [
    'Watamu map',
    'Watamu landmarks',
    'Mida Creek map',
    'Gede ruins map',
    'Watamu Marine National Park map',
  ],
  openGraph: {
    title: 'Watamu map',
    description:
      'Interactive map of beaches, landmarks and attractions in Watamu, Kenya.',
    type: 'website',
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}

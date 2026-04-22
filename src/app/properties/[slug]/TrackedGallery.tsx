'use client';

/**
 * Thin client wrapper around ImageGallery that emits a
 * `gallery_open` analytics event with the right property_id.
 *
 * Exists so the server-rendered detail page can stay ignorant of the
 * tracker — props here are all plain data.
 */

import ImageGallery from '@/components/ImageGallery';
import { track } from '@/lib/analytics/track';

interface Props {
  images: { id?: string; url: string; alt_text?: string | null }[];
  alt?: string;
  propertyId?: string | null;
  boatId?: string | null;
}

export default function TrackedGallery({ images, alt, propertyId, boatId }: Props) {
  return (
    <ImageGallery
      images={images}
      alt={alt}
      onOpen={(index) => {
        track({
          event_name: 'gallery_open',
          property_id: propertyId ?? null,
          boat_id: boatId ?? null,
          payload: { index },
        });
      }}
    />
  );
}

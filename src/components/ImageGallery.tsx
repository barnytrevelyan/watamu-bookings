'use client';

import React, { useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Expand } from 'lucide-react';

interface GalleryImage {
  src?: string;
  url?: string;
  alt?: string;
  alt_text?: string | null;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  alt?: string; // fallback alt text for all images
  className?: string;
  /**
   * Optional callback invoked when the lightbox opens. Used by the
   * property / boat detail pages to emit a `gallery_open` analytics
   * event without coupling this shared component to the tracker.
   */
  onOpen?: (index: number) => void;
}

export default function ImageGallery({
  images: rawImages,
  alt: fallbackAlt = '',
  className = '',
  onOpen,
}: ImageGalleryProps) {
  // Normalise images to { src, alt } regardless of input shape
  const images = rawImages.map((img) => ({
    src: img.src || img.url || '',
    alt: img.alt || img.alt_text || fallbackAlt || '',
  }));
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const openLightbox = (index: number) => {
    setActiveIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
    // Fire the optional analytics callback *after* local state — the
    // tracker must never block the visual open.
    try {
      onOpen?.(index);
    } catch {
      /* noop */
    }
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = '';
  };

  const goToPrevious = useCallback(() => {
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
    },
    [goToPrevious, goToNext]
  );

  if (images.length === 0) return null;

  return (
    <div className={className}>
      {/* Grid layout */}
      <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-2xl overflow-hidden h-[28rem]">
        {/* Main image */}
        <div
          className="col-span-2 row-span-2 relative group cursor-pointer"
          onClick={() => openLightbox(0)}
        >
          <img
            src={images[0].src}
            alt={images[0].alt}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <Expand className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </div>

        {/* Secondary images */}
        {images.slice(1, 5).map((image, i) => (
          <div
            key={i}
            className="relative group cursor-pointer"
            onClick={() => openLightbox(i + 1)}
          >
            <img
              src={image.src}
              alt={image.alt}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            {i === 3 && images.length > 5 && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white text-lg font-semibold">
                  +{images.length - 5} more
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="lightbox-overlay"
          onKeyDown={handleKeyDown}
          tabIndex={0}
          ref={(el) => el?.focus()}
          role="dialog"
          aria-modal="true"
          aria-label="Image gallery"
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
            aria-label="Close lightbox"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 text-white text-sm bg-black/30 rounded-full px-3 py-1 z-10">
            {activeIndex + 1} / {images.length}
          </div>

          {/* Previous button */}
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Main image */}
          <img
            src={images[activeIndex].src}
            alt={images[activeIndex].alt}
            className="max-w-[90vw] max-h-[80vh] object-contain animate-fade-in"
          />

          {/* Next button */}
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Thumbnail strip */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto scrollbar-hide px-4 py-2">
            {images.map((image, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                  i === activeIndex
                    ? 'border-white opacity-100 scale-105'
                    : 'border-transparent opacity-60 hover:opacity-80'
                }`}
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

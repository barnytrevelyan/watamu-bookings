'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Heart, Star, BedDouble, Bath, Users, MapPin } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { useCurrency } from '@/lib/places/BrandProvider';
import { formatPrice } from '@/lib/currency';

interface PropertyCardProps {
  slug: string;
  name: string;
  location: string;
  type: string;
  coverImage: string;
  images?: string[];
  rating: number;
  reviewCount: number;
  /** Price per night, stored in KES. */
  pricePerNight: number;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  isFavorited?: boolean;
  onToggleFavorite?: (slug: string) => void;
}

export default function PropertyCard({
  slug,
  name,
  location,
  type,
  coverImage,
  rating,
  reviewCount,
  pricePerNight,
  bedrooms,
  bathrooms,
  maxGuests,
  isFavorited = false,
  onToggleFavorite,
}: PropertyCardProps) {
  const [favorited, setFavorited] = useState(isFavorited);
  const currency = useCurrency();

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorited(!favorited);
    onToggleFavorite?.(slug);
  };

  return (
    <Link href={`/properties/${slug}`} className="group block">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-shadow duration-300 hover:shadow-lg">
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={coverImage}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Favorite button */}
          <button
            onClick={handleFavorite}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors shadow-sm"
            aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              className={`h-5 w-5 transition-colors ${
                favorited
                  ? 'fill-[var(--color-coral-500)] text-[var(--color-coral-500)]'
                  : 'text-gray-600'
              }`}
            />
          </button>
          {/* Type badge */}
          <div className="absolute top-3 left-3">
            <Badge variant="info">{type}</Badge>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Name & location */}
          <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-[var(--color-primary-600)] transition-colors">
            {name}
          </h3>
          <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{location}</span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1.5 mt-2">
            <Star className="h-4 w-4 fill-[var(--color-secondary-500)] text-[var(--color-secondary-500)]" />
            <span className="text-sm font-medium text-gray-900">
              {Number(rating || 0).toFixed(1)}
            </span>
            <span className="text-sm text-gray-500">
              ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
            </span>
          </div>

          {/* Amenity icons */}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <BedDouble className="h-4 w-4" />
              <span>{bedrooms}</span>
            </div>
            <div className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              <span>{bathrooms}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{maxGuests}</span>
            </div>
          </div>

          {/* Price */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-lg font-bold text-gray-900">
              {formatPrice(pricePerNight, currency)}
            </span>
            <span className="text-sm text-gray-500"> / night</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

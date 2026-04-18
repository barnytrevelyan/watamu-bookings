'use client';

import React from 'react';
import Link from 'next/link';
import { Star, Users, Anchor } from 'lucide-react';
import Badge from '@/components/ui/Badge';

interface BoatCardProps {
  slug: string;
  name: string;
  type: string;
  coverImage: string;
  captainName: string;
  capacity: number;
  rating: number;
  reviewCount: number;
  startingPrice: number;
  currency?: string;
}

export default function BoatCard({
  slug,
  name,
  type,
  coverImage,
  captainName,
  capacity,
  rating,
  reviewCount,
  startingPrice,
  currency = 'KES',
}: BoatCardProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const typeBadgeVariant = (() => {
    switch (type.toLowerCase()) {
      case 'sport fisher':
        return 'info' as const;
      case 'dhow':
        return 'warning' as const;
      case 'catamaran':
        return 'success' as const;
      default:
        return 'default' as const;
    }
  })();

  return (
    <Link href={`/boats/${slug}`} className="group block">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-shadow duration-300 hover:shadow-lg">
        {/* Cover image */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={coverImage}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute top-3 left-3">
            <Badge variant={typeBadgeVariant}>{type}</Badge>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-[var(--color-primary-600)] transition-colors">
            {name}
          </h3>

          {/* Captain */}
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
            <Anchor className="h-3.5 w-3.5 shrink-0" />
            <span>Captain {captainName}</span>
          </div>

          {/* Rating & capacity */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-[var(--color-secondary-500)] text-[var(--color-secondary-500)]" />
              <span className="text-sm font-medium text-gray-900">
                {rating.toFixed(1)}
              </span>
              <span className="text-sm text-gray-500">
                ({reviewCount})
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Users className="h-4 w-4" />
              <span>Up to {capacity}</span>
            </div>
          </div>

          {/* Price */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              From
            </span>
            <div>
              <span className="text-lg font-bold text-gray-900">
                {formatPrice(startingPrice)}
              </span>
              <span className="text-sm text-gray-500"> / trip</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

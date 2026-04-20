'use client';

import React from 'react';
import Link from 'next/link';
import { Star, Users, Anchor, Ruler, Zap } from 'lucide-react';
import Badge from '@/components/ui/Badge';

interface BoatCardProps {
  slug: string;
  name: string;
  type: string;
  coverImage: string;
  captainName: string;
  capacity: number;
  lengthFt?: number | null;
  rating: number;
  reviewCount: number;
  startingPrice: number;
  currency?: string;
  instantConfirmation?: boolean;
}

export default function BoatCard({
  slug,
  name,
  type,
  coverImage,
  captainName,
  capacity,
  lengthFt,
  rating,
  reviewCount,
  startingPrice,
  currency = 'KES',
  instantConfirmation = false,
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
          <div className="absolute top-3 left-3 flex gap-1.5">
            <Badge variant={typeBadgeVariant}>{type}</Badge>
            {instantConfirmation && (
              <Badge variant="success" className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Instant
              </Badge>
            )}
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

          {/* Boat specs bar */}
          <div className="flex items-center gap-3 mt-2 py-2 px-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            {lengthFt && (
              <div className="flex items-center gap-1">
                <Ruler className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-medium">{lengthFt} ft</span>
              </div>
            )}
            {lengthFt && <span className="text-gray-300">|</span>}
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium">Up to {capacity} people</span>
            </div>
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

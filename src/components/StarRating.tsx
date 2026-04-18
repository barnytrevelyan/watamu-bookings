'use client';

import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onChange?: (rating: number) => void;
  className?: string;
}

const sizeMap = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export default function StarRating({
  rating,
  maxStars = 5,
  size = 'md',
  interactive = false,
  onChange,
  className = '',
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const displayRating = interactive && hoverRating > 0 ? hoverRating : rating;
  const starSize = sizeMap[size];

  const handleClick = (starIndex: number) => {
    if (interactive && onChange) {
      onChange(starIndex);
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={`Rating: ${rating} out of ${maxStars} stars`}
    >
      {Array.from({ length: maxStars }).map((_, i) => {
        const starIndex = i + 1;
        const fillPercent = Math.min(
          Math.max(displayRating - i, 0),
          1
        );

        // Full star
        if (fillPercent >= 1) {
          return (
            <button
              key={i}
              type="button"
              disabled={!interactive}
              onClick={() => handleClick(starIndex)}
              onMouseEnter={() => interactive && setHoverRating(starIndex)}
              onMouseLeave={() => interactive && setHoverRating(0)}
              className={`${
                interactive
                  ? 'cursor-pointer hover:scale-110 transition-transform'
                  : 'cursor-default'
              } disabled:cursor-default`}
              aria-label={`${starIndex} star${starIndex > 1 ? 's' : ''}`}
            >
              <Star
                className={`${starSize} fill-[var(--color-secondary-500)] text-[var(--color-secondary-500)]`}
              />
            </button>
          );
        }

        // Half star
        if (fillPercent > 0) {
          return (
            <button
              key={i}
              type="button"
              disabled={!interactive}
              onClick={() => handleClick(starIndex)}
              onMouseEnter={() => interactive && setHoverRating(starIndex)}
              onMouseLeave={() => interactive && setHoverRating(0)}
              className={`relative ${
                interactive
                  ? 'cursor-pointer hover:scale-110 transition-transform'
                  : 'cursor-default'
              } disabled:cursor-default`}
              aria-label={`${starIndex} star${starIndex > 1 ? 's' : ''}`}
            >
              <Star className={`${starSize} text-gray-300`} />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fillPercent * 100}%` }}
              >
                <Star
                  className={`${starSize} fill-[var(--color-secondary-500)] text-[var(--color-secondary-500)]`}
                />
              </div>
            </button>
          );
        }

        // Empty star
        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => handleClick(starIndex)}
            onMouseEnter={() => interactive && setHoverRating(starIndex)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            className={`${
              interactive
                ? 'cursor-pointer hover:scale-110 transition-transform'
                : 'cursor-default'
            } disabled:cursor-default`}
            aria-label={`${starIndex} star${starIndex > 1 ? 's' : ''}`}
          >
            <Star className={`${starSize} text-gray-300`} />
          </button>
        );
      })}
    </div>
  );
}

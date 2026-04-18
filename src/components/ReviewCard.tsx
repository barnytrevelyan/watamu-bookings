import React from 'react';
import StarRating from '@/components/StarRating';

interface SubRating {
  label: string;
  score: number;
}

interface ReviewCardProps {
  guestName: string;
  guestAvatar?: string;
  date: string;
  rating: number;
  subRatings?: SubRating[];
  comment: string;
  ownerResponse?: string;
  ownerName?: string;
}

export default function ReviewCard({
  guestName,
  guestAvatar,
  date,
  rating,
  subRatings,
  comment,
  ownerResponse,
  ownerName,
}: ReviewCardProps) {
  const initials = guestName
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {/* Guest info */}
      <div className="flex items-start gap-3">
        {guestAvatar ? (
          <img
            src={guestAvatar}
            alt={guestName}
            className="h-10 w-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-600)] flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-900">{guestName}</h4>
            <span className="text-xs text-gray-500 shrink-0">{date}</span>
          </div>
          <div className="mt-0.5">
            <StarRating rating={rating} size="sm" />
          </div>
        </div>
      </div>

      {/* Sub-ratings */}
      {subRatings && subRatings.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-3">
          {subRatings.map((sr) => (
            <div key={sr.label} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{sr.label}</span>
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-primary-500)] rounded-full"
                    style={{ width: `${(sr.score / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-700 w-6 text-right">
                  {sr.score.toFixed(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comment */}
      <p className="mt-3 text-sm text-gray-700 leading-relaxed">{comment}</p>

      {/* Owner response */}
      {ownerResponse && (
        <div className="mt-3 pl-4 border-l-2 border-[var(--color-secondary-300)] bg-[var(--color-secondary-50)] rounded-r-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">
            Response from {ownerName || 'Owner'}
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            {ownerResponse}
          </p>
        </div>
      )}
    </div>
  );
}

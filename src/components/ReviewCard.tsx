import React from 'react';
import StarRating from '@/components/StarRating';

interface SubRating {
  label: string;
  score: number;
}

interface ReviewCardProps {
  guestName?: string;
  guestAvatar?: string;
  date?: string;
  rating?: number;
  subRatings?: SubRating[];
  comment?: string;
  ownerResponse?: string;
  ownerName?: string;
  isVerified?: boolean;
  reportedCatch?: string[];
  tripName?: string;
  // Also accept a raw review object for convenience
  review?: any;
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
  isVerified,
  reportedCatch,
  tripName,
  review,
}: ReviewCardProps) {
  // If a raw review object is passed, extract fields from it
  const _guestName = guestName || review?.author?.full_name || 'Guest';
  const _guestAvatar = guestAvatar || review?.author?.avatar_url;
  const _date = date || (review?.created_at ? new Date(review.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');
  const _rating = rating ?? review?.rating ?? 0;
  const _comment = comment || review?.comment || '';
  const _ownerResponse = ownerResponse || review?.owner_response;
  const _isVerified = isVerified ?? review?.is_verified ?? false;
  const _reportedCatch = reportedCatch || review?.reported_catch || [];
  const _tripName = tripName || review?.trip_name;
  const initials = _guestName
    .split(' ')
    .map((n: string) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {/* Guest info */}
      <div className="flex items-start gap-3">
        {_guestAvatar ? (
          <img
            src={_guestAvatar}
            alt={_guestName}
            className="h-10 w-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-600)] flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900">{_guestName}</h4>
              {_isVerified && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Verified
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 shrink-0">{_date}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRating rating={_rating} size="sm" />
            {_tripName && (
              <span className="text-xs text-gray-400">
                &mdash; {_tripName}
              </span>
            )}
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
      <p className="mt-3 text-sm text-gray-700 leading-relaxed">{_comment}</p>

      {/* Reported catch */}
      {_reportedCatch && _reportedCatch.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Reported catch:</span>
          <div className="flex flex-wrap gap-1">
            {_reportedCatch.map((fish: string) => (
              <span
                key={fish}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454Z" />
                </svg>
                {fish}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Owner response */}
      {_ownerResponse && (
        <div className="mt-3 pl-4 border-l-2 border-[var(--color-secondary-300)] bg-[var(--color-secondary-50)] rounded-r-lg p-3">
          <p className="text-xs font-semibold text-gray-700 mb-1">
            Response from {ownerName || 'Owner'}
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            {_ownerResponse}
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { StarRating } from '@/components/StarRating';

interface Review {
  id: string;
  guest_name: string;
  listing_name: string;
  listing_type: 'property' | 'boat';
  rating: number;
  comment: string;
  owner_response: string | null;
  created_at: string;
}

export default function ReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [savingResponse, setSavingResponse] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchReviews();
  }, [user, ratingFilter, typeFilter]);

  async function fetchReviews() {
    try {
      const supabase = createClient();
      let query = supabase
        .from('wb_reviews')
        .select(
          `
          id,
          rating,
          comment,
          owner_response,
          created_at,
          property_id,
          boat_id,
          wb_profiles!guest_id(full_name),
          wb_properties(name),
          wb_boats(name)
        `
        )
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (ratingFilter !== 'all') {
        query = query.eq('rating', parseInt(ratingFilter));
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      let formatted: Review[] = (data || []).map((r: any) => ({
        id: r.id,
        guest_name: r.wb_profiles?.full_name || 'Guest',
        listing_name: r.wb_properties?.name || r.wb_boats?.name || 'N/A',
        listing_type: r.property_id ? 'property' : 'boat',
        rating: r.rating,
        comment: r.comment,
        owner_response: r.owner_response,
        created_at: r.created_at,
      }));

      if (typeFilter !== 'all') {
        formatted = formatted.filter((r) => r.listing_type === typeFilter);
      }

      setReviews(formatted);
    } catch (err) {
      setError('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }

  async function submitResponse(reviewId: string) {
    if (!responseText.trim()) return;

    setSavingResponse(true);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from('wb_reviews')
        .update({ owner_response: responseText.trim() })
        .eq('id', reviewId)
        .eq('owner_id', user!.id);

      if (updateErr) throw updateErr;

      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, owner_response: responseText.trim() }
            : r
        )
      );
      setRespondingId(null);
      setResponseText('');
    } catch (err) {
      console.error(err);
    } finally {
      setSavingResponse(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Rating</label>
            <Select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
              <option value="all">All Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="property">Properties</option>
              <option value="boat">Boats</option>
            </Select>
          </div>
        </div>
      </Card>

      {reviews.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <h2 className="text-lg font-semibold text-gray-900">No reviews found</h2>
          <p className="mt-2 text-gray-500">
            {ratingFilter !== 'all' || typeFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Reviews from your guests will appear here.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id} className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                      {review.guest_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {review.guest_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {review.listing_name} &middot;{' '}
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <StarRating rating={review.rating} />
                  </div>
                  <p className="mt-2 text-gray-700">{review.comment}</p>

                  {/* Owner Response */}
                  {review.owner_response && (
                    <div className="mt-4 rounded-lg border-l-4 border-teal-400 bg-teal-50 p-3">
                      <p className="text-xs font-medium text-teal-700">
                        Your Response
                      </p>
                      <p className="mt-1 text-sm text-gray-700">
                        {review.owner_response}
                      </p>
                    </div>
                  )}

                  {/* Respond Form */}
                  {respondingId === review.id && (
                    <div className="mt-4 space-y-3">
                      <Textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Write your response to this review..."
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => submitResponse(review.id)}
                          disabled={savingResponse || !responseText.trim()}
                        >
                          {savingResponse ? 'Submitting...' : 'Submit Response'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRespondingId(null);
                            setResponseText('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {!review.owner_response && respondingId !== review.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRespondingId(review.id);
                        setResponseText('');
                      }}
                    >
                      Respond
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

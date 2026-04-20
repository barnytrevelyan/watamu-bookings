'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Star, Home, Anchor, MessageCircle, CheckCircle2, TrendingUp, AlertCircle } from 'lucide-react';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ratingFilter, typeFilter]);

  async function fetchReviews() {
    setLoading(true);
    try {
      const supabase = createClient();

      // Get owner's property and boat IDs
      const [propsRes, boatsRes] = await Promise.all([
        supabase.from('wb_properties').select('id').eq('owner_id', user!.id),
        supabase.from('wb_boats').select('id').eq('owner_id', user!.id),
      ]);

      const propIds = (propsRes.data || []).map((p: any) => p.id);
      const boatIds = (boatsRes.data || []).map((b: any) => b.id);

      if (propIds.length === 0 && boatIds.length === 0) {
        setReviews([]);
        setLoading(false);
        return;
      }

      const allReviews: any[] = [];

      if (propIds.length > 0) {
        let query = supabase
          .from('wb_reviews')
          .select(
            `
            id, rating, comment, owner_response, created_at, property_id, boat_id,
            wb_profiles!guest_id(full_name),
            wb_properties!property_id(name)
          `
          )
          .in('property_id', propIds)
          .order('created_at', { ascending: false });

        if (ratingFilter !== 'all') {
          query = query.eq('rating', parseInt(ratingFilter));
        }

        const { data } = await query;
        if (data) allReviews.push(...data);
      }

      if (boatIds.length > 0) {
        let query = supabase
          .from('wb_reviews')
          .select(
            `
            id, rating, comment, owner_response, created_at, property_id, boat_id,
            wb_profiles!guest_id(full_name),
            wb_boats!boat_id(name)
          `
          )
          .in('boat_id', boatIds)
          .order('created_at', { ascending: false });

        if (ratingFilter !== 'all') {
          query = query.eq('rating', parseInt(ratingFilter));
        }

        const { data } = await query;
        if (data) allReviews.push(...data);
      }

      // Deduplicate and sort
      const seen = new Set<string>();
      const unique = allReviews.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      let formatted: Review[] = unique.map((r: any) => ({
        id: r.id,
        guest_name: r.wb_profiles?.full_name || 'Guest',
        listing_name: r.wb_properties?.name || r.wb_boats?.name || 'N/A',
        listing_type: r.property_id ? 'property' : 'boat',
        rating: r.rating,
        comment: r.comment || '',
        owner_response: r.owner_response,
        created_at: r.created_at,
      }));

      if (typeFilter !== 'all') {
        formatted = formatted.filter((r) => r.listing_type === typeFilter);
      }

      setReviews(formatted);
    } catch (err) {
      console.error(err);
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
        .eq('id', reviewId);

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

  // Aggregate stats across all currently-loaded reviews (respects filters).
  const stats = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, total: 0, responded: 0, dist: [0, 0, 0, 0, 0] };
    let sum = 0;
    let responded = 0;
    const dist = [0, 0, 0, 0, 0]; // 1..5
    for (const r of reviews) {
      sum += r.rating;
      if (r.owner_response) responded++;
      const idx = Math.max(1, Math.min(5, r.rating)) - 1;
      dist[idx]++;
    }
    return { avg: sum / reviews.length, total: reviews.length, responded, dist };
  }, [reviews]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Reviews</h1>
        <p className="text-sm text-gray-500 mt-1">Guest feedback across your properties and boats.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              fetchReviews();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Stats row */}
      {!loading && reviews.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-[var(--color-sandy-200,#f2d88f)]/50 to-transparent" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Average rating</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900 tabular-nums">{stats.avg.toFixed(1)}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`h-5 w-5 ${n <= Math.round(stats.avg) ? 'text-[var(--color-sandy-500,#d4a72c)] fill-[var(--color-sandy-500,#d4a72c)]' : 'text-gray-200'}`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Across {stats.total} {stats.total === 1 ? 'review' : 'reviews'}</p>
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Distribution</p>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = stats.dist[n - 1];
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={n} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-gray-600 tabular-nums">{n}★</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--color-sandy-400,#e8c06f)] to-[var(--color-sandy-600,#b88a1a)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-7 text-right text-gray-500 tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Response rate</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-gray-900 tabular-nums">
                {stats.total > 0 ? Math.round((stats.responded / stats.total) * 100) : 0}%
              </span>
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              You've responded to {stats.responded} of {stats.total}
            </p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">Stars</span>
            {(['all', '5', '4', '3', '2', '1'] as const).map((r) => {
              const active = ratingFilter === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRatingFilter(r)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {r === 'all' ? 'All' : (<>{r}<Star className="h-3 w-3" /></>)}
                </button>
              );
            })}
          </div>
          <span className="hidden sm:inline h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">Type</span>
            {(['all', 'property', 'boat'] as const).map((t) => {
              const active = typeFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors capitalize ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t === 'all' ? 'All' : t === 'property' ? <><Home className="h-3 w-3" /> Properties</> : <><Anchor className="h-3 w-3" /> Boats</>}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-14 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-sandy-100,#f7e5b5)] to-[var(--color-sandy-200,#f2d88f)]">
            <Star className="h-8 w-8 text-[var(--color-sandy-700,#9c7518)] fill-[var(--color-sandy-500,#d4a72c)]" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">No reviews yet</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md">
            {ratingFilter !== 'all' || typeFilter !== 'all'
              ? 'No reviews match your filters. Try adjusting them.'
              : 'Reviews from your guests will appear here once they leave feedback.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              responding={respondingId === review.id}
              responseText={responseText}
              setResponseText={setResponseText}
              onStartRespond={() => {
                setRespondingId(review.id);
                setResponseText('');
              }}
              onCancelRespond={() => {
                setRespondingId(null);
                setResponseText('');
              }}
              onSubmit={() => submitResponse(review.id)}
              saving={savingResponse}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  responding,
  responseText,
  setResponseText,
  onStartRespond,
  onCancelRespond,
  onSubmit,
  saving,
}: {
  review: Review;
  responding: boolean;
  responseText: string;
  setResponseText: (v: string) => void;
  onStartRespond: () => void;
  onCancelRespond: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const initials = review.guest_name.charAt(0).toUpperCase();
  const ListingIcon = review.listing_type === 'boat' ? Anchor : Home;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[var(--color-primary-100,#bde0f6)] to-[var(--color-primary-200,#8bc8ea)] text-[var(--color-primary-800,#023e7d)] flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-gray-900">{review.guest_name}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <ListingIcon className="h-3 w-3" />
                <span className="truncate">{review.listing_name}</span>
                <span className="text-gray-300 mx-1">·</span>
                <span>{new Date(review.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-[var(--color-sandy-50,#fdf6e3)] px-2.5 py-1 rounded-full ring-1 ring-[var(--color-sandy-200,#f2d88f)]/60">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`h-3.5 w-3.5 ${n <= review.rating ? 'text-[var(--color-sandy-600,#b88a1a)] fill-[var(--color-sandy-500,#d4a72c)]' : 'text-gray-300'}`}
                />
              ))}
              <span className="ml-1 text-xs font-bold text-[var(--color-sandy-800,#7c5a12)] tabular-nums">{review.rating}</span>
            </div>
          </div>

          {review.comment && (
            <p className="mt-3 text-[15px] text-gray-800 leading-relaxed">
              {review.comment}
            </p>
          )}

          {/* Owner Response */}
          {review.owner_response && (
            <div className="mt-4 rounded-xl border border-[var(--color-primary-200,#8bc8ea)]/60 bg-[var(--color-primary-50,#e8f4fb)]/70 p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-primary-700,#034078)] mb-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                Your response
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">
                {review.owner_response}
              </p>
            </div>
          )}

          {/* Respond Form */}
          {responding && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3 animate-fade-in">
              <Textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Thank the guest, address their feedback, or welcome them back…"
                rows={3}
                className="bg-white"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelRespond}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={onSubmit}
                  disabled={saving || !responseText.trim()}
                >
                  {saving ? 'Submitting…' : 'Publish response'}
                </Button>
              </div>
            </div>
          )}

          {/* Respond CTA */}
          {!review.owner_response && !responding && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onStartRespond}
              >
                <MessageCircle className="h-4 w-4 mr-1.5" />
                Respond publicly
              </Button>
            </div>
          )}

          {review.owner_response && !responding && (
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              Responded
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

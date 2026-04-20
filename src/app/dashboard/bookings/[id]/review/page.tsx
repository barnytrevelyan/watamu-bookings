'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Star, ArrowLeft, Shield, ThumbsUp, ThumbsDown, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';

interface BookingDetail {
  id: string;
  guest_id: string;
  check_in: string;
  check_out: string;
  status: string;
  total_price: number;
  currency: string;
  listing_name: string;
  guest_name: string;
  guest_email: string | null;
  guest_avatar: string | null;
  host_owns_listing: boolean;
}

interface ExistingReview {
  id: string;
  rating: number;
  cleanliness_rating: number | null;
  communication_rating: number | null;
  house_rules_rating: number | null;
  would_host_again: boolean | null;
  comment: string | null;
  private_feedback: string | null;
  published_at: string | null;
  created_at: string;
}

function StarPicker({
  value,
  onChange,
  label,
  required = false,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-800">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </label>
        <span className="text-xs text-gray-500">
          {display ? `${display} / 5` : 'Select a rating'}
        </span>
      </div>
      <div className="mt-2 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="p-1 rounded hover:scale-110 transition-transform"
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <Star
              className={`h-8 w-8 ${
                n <= display
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReviewGuestPage() {
  const { id: bookingId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [existing, setExisting] = useState<ExistingReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [rating, setRating] = useState(0);
  const [cleanliness, setCleanliness] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [houseRules, setHouseRules] = useState(0);
  const [wouldHostAgain, setWouldHostAgain] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [privateFeedback, setPrivateFeedback] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/auth/login?redirect=/dashboard/bookings/${bookingId}/review`);
      return;
    }
    loadBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, bookingId]);

  async function loadBooking() {
    setLoading(true);
    setError(null);
    try {
      // Pull the booking + join in listing + guest profile. RLS on wb_bookings
      // already restricts reads to participants, so the host can see their own.
      const { data: b, error: bErr } = await supabase
        .from('wb_bookings')
        .select(
          `
          id, guest_id, check_in, check_out, status, total_price, currency,
          property_id, boat_id,
          guest:wb_profiles!guest_id (full_name, email, avatar_url),
          property:wb_properties!property_id (id, name, owner_id),
          boat:wb_boats!boat_id (id, name, owner_id)
        `
        )
        .eq('id', bookingId)
        .maybeSingle();

      if (bErr) throw bErr;
      if (!b) {
        setNotFound(true);
        return;
      }

      const propAny = b as any;
      const listingOwner =
        propAny.property?.owner_id || propAny.boat?.owner_id || null;
      const listingName =
        propAny.property?.name || propAny.boat?.name || 'Listing';

      if (listingOwner !== user!.id) {
        setError("You can only review guests on your own listings.");
        return;
      }
      if (b.status !== 'completed') {
        setError(
          "You can write a review once the booking is marked as completed."
        );
      }

      setBooking({
        id: b.id,
        guest_id: b.guest_id,
        check_in: b.check_in,
        check_out: b.check_out,
        status: b.status,
        total_price: Number(b.total_price ?? 0),
        currency: b.currency || 'KES',
        listing_name: listingName,
        guest_name: propAny.guest?.full_name || 'Guest',
        guest_email: propAny.guest?.email || null,
        guest_avatar: propAny.guest?.avatar_url || null,
        host_owns_listing: true,
      });

      // Check for an existing review we've already submitted
      const { data: existingReview } = await supabase
        .from('wb_guest_reviews')
        .select('*')
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (existingReview) {
        const er = existingReview as ExistingReview;
        setExisting(er);
        setRating(er.rating);
        setCleanliness(er.cleanliness_rating || 0);
        setCommunication(er.communication_rating || 0);
        setHouseRules(er.house_rules_rating || 0);
        setWouldHostAgain(er.would_host_again);
        setComment(er.comment || '');
        setPrivateFeedback(er.private_feedback || '');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!booking) return;
    if (!rating) {
      setError('Please choose an overall rating.');
      return;
    }
    if (wouldHostAgain === null) {
      setError('Please tell future hosts whether you would host this guest again.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        booking_id: booking.id,
        reviewer_id: user!.id,
        reviewee_id: booking.guest_id,
        rating,
        cleanliness_rating: cleanliness || null,
        communication_rating: communication || null,
        house_rules_rating: houseRules || null,
        would_host_again: wouldHostAgain,
        comment: comment.trim() || null,
        private_feedback: privateFeedback.trim() || null,
      };

      if (existing) {
        const { error: upErr } = await supabase
          .from('wb_guest_reviews')
          .update(payload)
          .eq('id', existing.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase
          .from('wb_guest_reviews')
          .insert(payload);
        if (insErr) throw insErr;
      }

      router.push('/dashboard/bookings?reviewed=1');
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="h-8 w-48 rounded bg-gray-200 animate-pulse mb-6" />
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking not found</h1>
        <p className="text-gray-600 mb-6">
          This booking may have been deleted, or you may not have access to it.
        </p>
        <Link href="/dashboard/bookings">
          <Button variant="outline">Back to bookings</Button>
        </Link>
      </div>
    );
  }

  const lockedForCompleted = booking && booking.status !== 'completed';
  const alreadyPublished = !!existing?.published_at;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to bookings
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Review your guest
        </h1>
        <p className="mt-2 text-gray-600">
          Your review stays private until your guest writes theirs (or 14 days
          pass, whichever comes first). This keeps feedback honest on both sides.
        </p>
      </div>

      {/* Guest context card */}
      {booking && (
        <Card className="mb-6 p-5">
          <div className="flex items-center gap-4">
            {booking.guest_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={booking.guest_avatar}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center text-lg font-semibold">
                {booking.guest_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{booking.guest_name}</p>
              <p className="text-sm text-gray-600">
                {booking.listing_name} ·{' '}
                {new Date(booking.check_in).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                →{' '}
                {new Date(booking.check_out).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Completed status gating */}
      {lockedForCompleted && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="inline h-4 w-4 mr-1 -mt-0.5" />
          This booking isn&apos;t marked as completed yet. You can still draft a
          review but it won&apos;t be published until you complete the booking.
        </div>
      )}

      {/* Already published notice */}
      {alreadyPublished && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Shield className="inline h-4 w-4 mr-1 -mt-0.5" />
          This review was published on{' '}
          {new Date(existing!.published_at!).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          and can no longer be edited.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Overall rating */}
        <Card className="p-5 space-y-6">
          <StarPicker
            label="Overall experience hosting"
            value={rating}
            onChange={setRating}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 border-t border-gray-100">
            <StarPicker
              label="Cleanliness"
              value={cleanliness}
              onChange={setCleanliness}
            />
            <StarPicker
              label="Communication"
              value={communication}
              onChange={setCommunication}
            />
            <StarPicker
              label="House rules"
              value={houseRules}
              onChange={setHouseRules}
            />
          </div>
        </Card>

        {/* Would host again */}
        <Card className="p-5">
          <p className="text-sm font-medium text-gray-800 mb-3">
            Would you host this guest again?{' '}
            <span className="text-rose-500">*</span>
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setWouldHostAgain(true)}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                wouldHostAgain === true
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <ThumbsUp className="h-4 w-4" />
              Yes, I would
            </button>
            <button
              type="button"
              onClick={() => setWouldHostAgain(false)}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                wouldHostAgain === false
                  ? 'border-rose-500 bg-rose-50 text-rose-700'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <ThumbsDown className="h-4 w-4" />
              No, I wouldn&apos;t
            </button>
          </div>
        </Card>

        {/* Public comment */}
        <Card className="p-5">
          <Textarea
            label="Public comment (visible on your guest's profile)"
            placeholder="What was it like to host this guest? Be honest and specific — short, factual notes are most useful to other hosts."
            rows={5}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            helperText="Shown publicly once both reviews are submitted."
          />
        </Card>

        {/* Private feedback */}
        <Card className="p-5">
          <Textarea
            label="Private feedback to the guest (optional)"
            placeholder="Anything you'd like this guest to know for next time — only they see this."
            rows={3}
            value={privateFeedback}
            onChange={(e) => setPrivateFeedback(e.target.value)}
            helperText="Only the guest will see this. We don't publish it."
          />
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard/bookings">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting || alreadyPublished}>
            {submitting
              ? 'Submitting…'
              : existing
              ? 'Update review'
              : 'Submit review'}
          </Button>
        </div>
      </form>
    </div>
  );
}

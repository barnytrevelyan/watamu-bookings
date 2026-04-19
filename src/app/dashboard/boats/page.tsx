'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StarRating } from '@/components/StarRating';
import { Anchor, Plus } from 'lucide-react';

interface Boat {
  id: string;
  name: string;
  slug: string;
  boat_type: string;
  is_published: boolean;
  currency: string;
  average_rating: number;
  review_count: number;
  cover_image: string | null;
  status: string;
  capacity: number | null;
  length_ft: number | null;
  min_trip_price: number | null;
}

export default function BoatsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchBoats();
  }, [user]);

  async function fetchBoats() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('wb_boats')
        .select(
          `
          id,
          name,
          slug,
          boat_type,
          is_published,
          currency,
          capacity,
          length_ft,
          status,
          avg_rating,
          review_count,
          wb_images(url),
          wb_boat_trips(price_total)
        `
        )
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const formatted: Boat[] = (data || []).map((b: any) => {
        const coverImg =
          b.wb_images && b.wb_images.length > 0 ? b.wb_images[0].url : null;
        const trips = b.wb_boat_trips || [];
        const minPrice = trips.length > 0
          ? Math.min(...trips.map((t: any) => t.price_total || 0))
          : null;

        return {
          id: b.id,
          name: b.name,
          slug: b.slug,
          boat_type: b.boat_type,
          is_published: b.is_published,
          currency: b.currency || 'KES',
          average_rating: b.avg_rating || 0,
          review_count: b.review_count || 0,
          cover_image: coverImg,
          status: b.status || 'draft',
          capacity: b.capacity,
          length_ft: b.length_ft,
          min_trip_price: minPrice,
        };
      });

      setBoats(formatted);
    } catch (err) {
      setError('Failed to load boats');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function togglePublished(id: string, current: boolean) {
    setTogglingId(id);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('wb_boats')
        .update({ is_published: !current })
        .eq('id', id)
        .eq('owner_id', user!.id);

      if (updateError) throw updateError;

      setBoats((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, is_published: !current } : b
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">My Boats</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-xl bg-gray-200"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Boats</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700">{error}</p>
          <Button
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchBoats();
            }}
            className="mt-4"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Boats</h1>
        <Button onClick={() => router.push('/dashboard/boats/new')}>
          <Plus className="h-4 w-4 mr-1" />
          Add New Boat
        </Button>
      </div>

      {boats.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <Anchor className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            You have no boats listed
          </h2>
          <p className="mt-2 text-center text-gray-500">
            Add your first boat or charter to reach guests visiting Watamu.
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => router.push('/dashboard/boats/new')}>
              Add a Boat
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/import')}>
              Import from FishingBooker
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {boats.map((boat) => (
            <Card key={boat.id} className="overflow-hidden">
              <div className="relative h-40 bg-gray-200">
                {boat.cover_image ? (
                  <img
                    src={boat.cover_image}
                    alt={boat.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    <Anchor className="h-10 w-10" />
                  </div>
                )}
                <div className="absolute right-2 top-2 flex gap-1">
                  {boat.status === 'pending_review' && (
                    <Badge variant="warning">Pending Review</Badge>
                  )}
                  {boat.status === 'approved' && (
                    <Badge variant="success">Approved</Badge>
                  )}
                  {boat.status === 'rejected' && (
                    <Badge variant="danger">Rejected</Badge>
                  )}
                  {(!boat.status || boat.status === 'draft') && (
                    <Badge variant="default">Draft</Badge>
                  )}
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {boat.name}
                    </h3>
                    <p className="text-sm capitalize text-gray-500">
                      {boat.boat_type?.replace(/_/g, ' ')}
                      {boat.length_ft ? ` · ${boat.length_ft}ft` : ''}
                      {boat.capacity ? ` · ${boat.capacity} pax` : ''}
                    </p>
                  </div>
                  {boat.min_trip_price != null && (
                    <p className="text-sm font-semibold text-gray-900">
                      {boat.currency} {boat.min_trip_price.toLocaleString()}
                      <span className="font-normal text-gray-500">/trip</span>
                    </p>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                  {boat.average_rating > 0 && (
                    <div className="flex items-center gap-1">
                      <StarRating rating={boat.average_rating} size="sm" />
                      <span>{boat.average_rating}</span>
                    </div>
                  )}
                  <span>{boat.review_count} reviews</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(`/dashboard/boats/${boat.id}`)
                    }
                  >
                    Edit
                  </Button>
                  {boat.is_published && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => router.push(`/boats/${boat.slug}`)}
                    >
                      View
                    </Button>
                  )}
                  {boat.status === 'approved' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={togglingId === boat.id}
                      onClick={() =>
                        togglePublished(boat.id, boat.is_published)
                      }
                    >
                      {togglingId === boat.id
                        ? '...'
                        : boat.is_published
                          ? 'Unpublish'
                          : 'Publish'}
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

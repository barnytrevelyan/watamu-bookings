'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StarRating } from '@/components/StarRating';

interface Property {
  id: string;
  name: string;
  slug: string;
  property_type: string;
  is_published: boolean;
  base_price: number;
  currency: string;
  average_rating: number;
  bookings_count: number;
  cover_image: string | null;
  status: string;
  rejection_reason: string | null;
}

export default function PropertiesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchProperties();
  }, [user]);

  async function fetchProperties() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('wb_properties')
        .select(
          `
          id,
          name,
          slug,
          property_type,
          is_published,
          base_price,
          currency,
          status,
          rejection_reason,
          wb_images(url),
          wb_reviews(rating),
          wb_bookings(id)
        `
        )
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const formatted: Property[] = (data || []).map((p: any) => {
        const ratings = (p.wb_reviews || []).map((r: any) => r.rating);
        const avgRating =
          ratings.length > 0
            ? Math.round(
                (ratings.reduce((a: number, b: number) => a + b, 0) /
                  ratings.length) *
                  10
              ) / 10
            : 0;
        const coverImg =
          p.wb_images && p.wb_images.length > 0 ? p.wb_images[0].url : null;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          property_type: p.property_type,
          is_published: p.is_published,
          base_price: p.base_price,
          currency: p.currency || 'KES',
          average_rating: avgRating,
          bookings_count: (p.wb_bookings || []).length,
          cover_image: coverImg,
          status: p.status || 'draft',
          rejection_reason: p.rejection_reason || null,
        };
      });

      setProperties(formatted);
    } catch (err) {
      setError('Failed to load properties');
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
        .from('wb_properties')
        .update({ is_published: !current })
        .eq('id', id)
        .eq('owner_id', user!.id);

      if (updateError) throw updateError;

      setProperties((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, is_published: !current } : p
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
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchProperties();
          }}
          className="mt-4"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
        <Button onClick={() => router.push('/dashboard/properties/new')}>
          + Add New Property
        </Button>
      </div>

      {properties.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <svg
              className="h-8 w-8 text-teal-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            No properties yet
          </h2>
          <p className="mt-2 text-center text-gray-500">
            Start by adding your first property to attract guests visiting
            Watamu.
          </p>
          <Button
            onClick={() => router.push('/dashboard/properties/new')}
            className="mt-6"
          >
            Add Your First Property
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Card key={property.id} className="overflow-hidden">
              <div className="relative h-40 bg-gray-200">
                {property.cover_image ? (
                  <img
                    src={property.cover_image}
                    alt={property.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    No image
                  </div>
                )}
                <div className="absolute right-2 top-2 flex gap-1">
                  {property.status === 'pending_review' && (
                    <Badge variant="warning">Pending Review</Badge>
                  )}
                  {property.status === 'approved' && (
                    <Badge variant="success">Approved</Badge>
                  )}
                  {property.status === 'rejected' && (
                    <Badge variant="danger">Rejected</Badge>
                  )}
                  {(!property.status || property.status === 'draft') && (
                    <Badge variant="default">Draft</Badge>
                  )}
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {property.name}
                    </h3>
                    <p className="text-sm capitalize text-gray-500">
                      {property.property_type}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {property.currency} {property.base_price.toLocaleString()}
                    <span className="font-normal text-gray-500">/night</span>
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                  {property.average_rating > 0 && (
                    <div className="flex items-center gap-1">
                      <StarRating rating={property.average_rating} size="sm" />
                      <span>{property.average_rating}</span>
                    </div>
                  )}
                  <span>{property.bookings_count} bookings</span>
                </div>
                {property.status === 'rejected' && property.rejection_reason && (
                  <div className="mt-3 rounded-lg bg-red-50 border border-red-100 p-2 text-xs text-red-700">
                    <span className="font-medium">Feedback:</span> {property.rejection_reason}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(`/dashboard/properties/${property.id}`)
                    }
                  >
                    Edit
                  </Button>
                  {property.is_published && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => router.push(`/properties/${property.slug}`)}
                    >
                      View
                    </Button>
                  )}
                  {property.status === 'approved' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={togglingId === property.id}
                      onClick={() =>
                        togglePublished(property.id, property.is_published)
                      }
                    >
                      {togglingId === property.id
                        ? '...'
                        : property.is_published
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

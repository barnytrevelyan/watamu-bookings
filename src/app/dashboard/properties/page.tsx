'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StarRating } from '@/components/StarRating';
import {
  Home,
  Plus,
  Sparkles,
  Eye,
  Pencil,
  EyeOff,
  Search as SearchIcon,
  MapPin,
  AlertCircle,
} from 'lucide-react';

interface Property {
  id: string;
  name: string;
  slug: string;
  property_type: string;
  is_published: boolean;
  base_price_per_night: number;
  currency: string;
  average_rating: number;
  review_count: number;
  cover_image: string | null;
  status: string;
  rejection_reason: string | null;
  city: string | null;
}

type StatusFilter = 'all' | 'published' | 'pending_review' | 'draft' | 'rejected';

export default function PropertiesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          base_price_per_night,
          currency,
          status,
          rejection_reason,
          city,
          avg_rating,
          review_count,
          wb_images(url)
        `
        )
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const formatted: Property[] = (data || []).map((p: any) => {
        const coverImg =
          p.wb_images && p.wb_images.length > 0 ? p.wb_images[0].url : null;
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          property_type: p.property_type,
          is_published: p.is_published,
          base_price_per_night: p.base_price_per_night || 0,
          currency: p.currency || 'KES',
          average_rating: p.avg_rating || 0,
          review_count: p.review_count || 0,
          cover_image: coverImg,
          status: p.status || 'draft',
          rejection_reason: p.rejection_reason || null,
          city: p.city || null,
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
        prev.map((p) => (p.id === id ? { ...p, is_published: !current } : p))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  }

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'published') return p.is_published && p.status === 'approved';
      if (statusFilter === 'pending_review') return p.status === 'pending_review';
      if (statusFilter === 'rejected') return p.status === 'rejected';
      if (statusFilter === 'draft') return !p.is_published && p.status === 'approved';
      return true;
    });
  }, [properties, statusFilter, search]);

  const counts = useMemo(() => ({
    all: properties.length,
    published: properties.filter((p) => p.is_published && p.status === 'approved').length,
    pending_review: properties.filter((p) => p.status === 'pending_review').length,
    draft: properties.filter((p) => !p.is_published && p.status === 'approved').length,
    rejected: properties.filter((p) => p.status === 'rejected').length,
  }), [properties]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 bg-gray-200 animate-pulse rounded" />
          <div className="h-10 w-32 bg-gray-200 animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button
          onClick={() => { setError(null); setLoading(true); fetchProperties(); }}
          className="mt-4"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your villas, apartments, and bandas. {properties.length} listed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/import">
            <Button variant="outline" leftIcon={<Sparkles className="h-4 w-4" />}>
              AI Import
            </Button>
          </Link>
          <Button onClick={() => router.push('/dashboard/properties/new')} leftIcon={<Plus className="h-4 w-4" />}>
            New property
          </Button>
        </div>
      </div>

      {properties.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Filters */}
          <Card className="p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex-1 relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-300)]"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {([
                  ['all', 'All', counts.all],
                  ['published', 'Published', counts.published],
                  ['pending_review', 'Pending', counts.pending_review],
                  ['draft', 'Draft', counts.draft],
                  ['rejected', 'Rejected', counts.rejected],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      statusFilter === key
                        ? 'bg-[var(--color-primary-500)] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                    <span className={`ml-1.5 text-[10px] ${statusFilter === key ? 'opacity-70' : 'text-gray-400'}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Grid */}
          {filtered.length === 0 ? (
            <Card className="py-16 text-center text-gray-500 text-sm">No properties match that filter.</Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((property) => (
                <PropertyListingCard
                  key={property.id}
                  property={property}
                  togglingId={togglingId}
                  onToggle={togglePublished}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PropertyListingCard({
  property,
  togglingId,
  onToggle,
}: {
  property: Property;
  togglingId: string | null;
  onToggle: (id: string, current: boolean) => void;
}) {
  const router = useRouter();
  const statusChip = statusToChip(property);
  const isToggling = togglingId === property.id;

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300">
      {/* Cover */}
      <Link href={`/dashboard/properties/${property.id}`} className="block relative h-48 bg-gray-100 overflow-hidden">
        {property.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.cover_image}
            alt={property.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 text-sm">
            <Home className="h-8 w-8" />
          </div>
        )}
        {/* Gradient for legibility */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {/* Status chip */}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold backdrop-blur-sm ${statusChip.bg} ${statusChip.text} shadow-sm`}>
            {statusChip.dot && <span className={`h-1.5 w-1.5 rounded-full ${statusChip.dot}`} />}
            {statusChip.label}
          </span>
        </div>
        {/* Price */}
        <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm shadow-sm">
          <span className="text-sm font-bold text-gray-900">{property.currency} {property.base_price_per_night.toLocaleString()}</span>
          <span className="text-xs text-gray-500"> / night</span>
        </div>
      </Link>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/dashboard/properties/${property.id}`} className="block">
              <h3 className="font-semibold text-gray-900 truncate group-hover:text-[var(--color-primary-600)] transition-colors">
                {property.name}
              </h3>
            </Link>
            <p className="text-xs text-gray-500 mt-0.5 capitalize flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {property.property_type} · {property.city || 'Kenya coast'}
            </p>
          </div>
          {property.average_rating > 0 && (
            <div className="flex items-center gap-1 shrink-0 bg-[var(--color-secondary-50)] rounded-lg px-2 py-1">
              <StarRating rating={property.average_rating} size="sm" />
              <span className="text-xs font-semibold text-[var(--color-secondary-700)]">
                {property.average_rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {property.review_count > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            {property.review_count} review{property.review_count === 1 ? '' : 's'}
          </p>
        )}

        {property.status === 'rejected' && property.rejection_reason && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p><span className="font-medium">Feedback:</span> {property.rejection_reason}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/dashboard/properties/${property.id}`)}
            leftIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>
          {property.is_published && (
            <a
              href={`/properties/${property.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </a>
          )}
          {property.status === 'approved' && (
            <button
              disabled={isToggling}
              onClick={() => onToggle(property.id, property.is_published)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ml-auto ${
                property.is_published
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'text-[var(--color-green-700)] bg-[var(--color-green-50)] hover:bg-[var(--color-green-100)]'
              }`}
            >
              {isToggling ? '…' : property.is_published ? (
                <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
              ) : (
                <><Eye className="h-3.5 w-3.5" /> Publish</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-secondary-50)]">
      <div className="p-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <Home className="h-8 w-8 text-[var(--color-primary-500)]" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">No properties yet</h2>
        <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
          Add your first property or let our AI draft one for you from an existing listing URL.
        </p>
        <div className="mt-6 flex justify-center gap-2 flex-wrap">
          <Link href="/dashboard/properties/new">
            <Button leftIcon={<Plus className="h-4 w-4" />}>Add a property</Button>
          </Link>
          <Link href="/dashboard/import">
            <Button variant="outline" leftIcon={<Sparkles className="h-4 w-4" />}>
              AI Import
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function statusToChip(p: Property): { label: string; bg: string; text: string; dot?: string } {
  if (p.status === 'pending_review') return { label: 'Pending review', bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500 animate-pulse' };
  if (p.status === 'rejected') return { label: 'Needs changes', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' };
  if (p.status === 'approved' && p.is_published) return { label: 'Live', bg: 'bg-[var(--color-green-100)]', text: 'text-[var(--color-green-700)]', dot: 'bg-[var(--color-green-500)]' };
  if (p.status === 'approved' && !p.is_published) return { label: 'Unpublished', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' };
  return { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' };
}

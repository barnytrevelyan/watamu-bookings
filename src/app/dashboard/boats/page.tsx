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
  Anchor,
  Plus,
  Sparkles,
  Eye,
  Pencil,
  EyeOff,
  Search as SearchIcon,
  Users,
  Ruler,
} from 'lucide-react';

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

type StatusFilter = 'all' | 'published' | 'pending_review' | 'draft' | 'rejected';

export default function BoatsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchBoats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const validTrips = trips.filter((t: any) => t.price_total && t.price_total > 0);
        const minPrice = validTrips.length > 0
          ? Math.min(...validTrips.map((t: any) => t.price_total))
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
      setBoats((prev) => prev.map((b) => (b.id === id ? { ...b, is_published: !current } : b)));
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  }

  const filtered = useMemo(() => {
    return boats.filter((b) => {
      if (search.trim() && !b.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'published') return b.is_published && b.status === 'approved';
      if (statusFilter === 'pending_review') return b.status === 'pending_review';
      if (statusFilter === 'rejected') return b.status === 'rejected';
      if (statusFilter === 'draft') return !b.is_published && b.status === 'approved';
      return true;
    });
  }, [boats, statusFilter, search]);

  const counts = useMemo(() => ({
    all: boats.length,
    published: boats.filter((b) => b.is_published && b.status === 'approved').length,
    pending_review: boats.filter((b) => b.status === 'pending_review').length,
    draft: boats.filter((b) => !b.is_published && b.status === 'approved').length,
    rejected: boats.filter((b) => b.status === 'rejected').length,
  }), [boats]);

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
        <Button onClick={() => { setError(null); setLoading(true); fetchBoats(); }} className="mt-4" variant="outline">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Boats & Charters</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your sport fishing, catamaran, and boat listings. {boats.length} listed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/import">
            <Button variant="outline" leftIcon={<Sparkles className="h-4 w-4" />}>AI Import</Button>
          </Link>
          <Button onClick={() => router.push('/dashboard/boats/new')} leftIcon={<Plus className="h-4 w-4" />}>New boat</Button>
        </div>
      </div>

      {boats.length === 0 ? (
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-sky-50 via-white to-[var(--color-primary-50)]">
          <div className="p-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
              <Anchor className="h-8 w-8 text-sky-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">No boats yet</h2>
            <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
              Add your first charter or let our AI pull it in from FishingBooker or your own site.
            </p>
            <div className="mt-6 flex justify-center gap-2 flex-wrap">
              <Link href="/dashboard/boats/new">
                <Button leftIcon={<Plus className="h-4 w-4" />}>Add a boat</Button>
              </Link>
              <Link href="/dashboard/import">
                <Button variant="outline" leftIcon={<Sparkles className="h-4 w-4" />}>AI Import</Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <>
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
                    <span className={`ml-1.5 text-[10px] ${statusFilter === key ? 'opacity-70' : 'text-gray-400'}`}>{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card className="py-16 text-center text-gray-500 text-sm">No boats match that filter.</Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((boat) => (
                <BoatListingCard key={boat.id} boat={boat} togglingId={togglingId} onToggle={togglePublished} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BoatListingCard({
  boat,
  togglingId,
  onToggle,
}: {
  boat: Boat;
  togglingId: string | null;
  onToggle: (id: string, current: boolean) => void;
}) {
  const router = useRouter();
  const chip = statusToChip(boat);
  const isToggling = togglingId === boat.id;

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300">
      <Link href={`/dashboard/boats/${boat.id}`} className="block relative h-48 bg-gray-100 overflow-hidden">
        {boat.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={boat.cover_image} alt={boat.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Anchor className="h-10 w-10" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold backdrop-blur-sm ${chip.bg} ${chip.text} shadow-sm`}>
            {chip.dot && <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />}
            {chip.label}
          </span>
        </div>
        {boat.min_trip_price != null && (
          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm shadow-sm">
            <span className="text-xs text-gray-500">from </span>
            <span className="text-sm font-bold text-gray-900">{boat.currency} {boat.min_trip_price.toLocaleString()}</span>
          </div>
        )}
      </Link>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/dashboard/boats/${boat.id}`}>
              <h3 className="font-semibold text-gray-900 truncate group-hover:text-[var(--color-primary-600)] transition-colors">
                {boat.name}
              </h3>
            </Link>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 capitalize">
              <span>{boat.boat_type?.replace(/_/g, ' ')}</span>
              {boat.length_ft && (
                <span className="inline-flex items-center gap-1">
                  <Ruler className="h-3 w-3" />
                  {boat.length_ft}ft
                </span>
              )}
              {boat.capacity && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {boat.capacity}
                </span>
              )}
            </div>
          </div>
          {boat.average_rating > 0 && (
            <div className="flex items-center gap-1 shrink-0 bg-[var(--color-secondary-50)] rounded-lg px-2 py-1">
              <StarRating rating={boat.average_rating} size="sm" />
              <span className="text-xs font-semibold text-[var(--color-secondary-700)]">{boat.average_rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {boat.review_count > 0 && (
          <p className="mt-1 text-xs text-gray-400">{boat.review_count} review{boat.review_count === 1 ? '' : 's'}</p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/boats/${boat.id}`)} leftIcon={<Pencil className="h-3.5 w-3.5" />}>Edit</Button>
          {boat.is_published && (
            <a href={`/boats/${boat.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              <Eye className="h-3.5 w-3.5" />View
            </a>
          )}
          {boat.status === 'approved' && (
            <button
              disabled={isToggling}
              onClick={() => onToggle(boat.id, boat.is_published)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ml-auto ${
                boat.is_published
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'text-[var(--color-green-700)] bg-[var(--color-green-50)] hover:bg-[var(--color-green-100)]'
              }`}
            >
              {isToggling ? '…' : boat.is_published ? (
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

function statusToChip(b: Boat): { label: string; bg: string; text: string; dot?: string } {
  if (b.status === 'pending_review') return { label: 'Pending review', bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500 animate-pulse' };
  if (b.status === 'rejected') return { label: 'Needs changes', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' };
  if (b.status === 'approved' && b.is_published) return { label: 'Live', bg: 'bg-[var(--color-green-100)]', text: 'text-[var(--color-green-700)]', dot: 'bg-[var(--color-green-500)]' };
  if (b.status === 'approved' && !b.is_published) return { label: 'Unpublished', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' };
  return { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' };
}

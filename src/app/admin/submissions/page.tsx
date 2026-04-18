'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';

interface ListingSubmission {
  id: string;
  name: string;
  type: 'property' | 'boat';
  owner_name: string;
  owner_email: string;
  description: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  // property-specific
  property_type?: string;
  address?: string;
  city?: string;
  bedrooms?: number;
  bathrooms?: number;
  max_guests?: number;
  base_price_per_night?: number;
  currency?: string;
  low_season_price?: number;
  high_season_price?: number;
  peak_season_price?: number;
  // boat-specific
  boat_type?: string;
  capacity?: number;
  departure_point?: string;
  length_ft?: number;
  captain_name?: string;
  // shared
  latitude?: number;
  longitude?: number;
  images?: { url: string; is_cover: boolean }[];
}

type FilterStatus = 'all' | 'pending_review' | 'approved' | 'rejected' | 'draft';

export default function AdminSubmissionsPage() {
  const [listings, setListings] = useState<ListingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('pending_review');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [rejectModal, setRejectModal] = useState<{ id: string; type: 'property' | 'boat'; name: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [previewListing, setPreviewListing] = useState<ListingSubmission | null>(null);

  useEffect(() => {
    fetchListings();
  }, [filter]);

  async function fetchListings() {
    setLoading(true);
    try {
      const supabase = createClient();

      let propQuery = supabase
        .from('wb_properties')
        .select(
          `id, name, property_type, description, address, city, bedrooms, bathrooms, max_guests,
          base_price_per_night, currency, status, rejection_reason, latitude, longitude,
          low_season_price, high_season_price, peak_season_price, created_at,
          wb_profiles!owner_id(full_name, email),
          wb_images(url, is_cover)`
        )
        .order('created_at', { ascending: false });

      let boatQuery = supabase
        .from('wb_boats')
        .select(
          `id, name, boat_type, description, capacity, departure_point, currency, status,
          rejection_reason, latitude, longitude, length_ft, captain_name, created_at,
          wb_profiles!owner_id(full_name, email),
          wb_images(url, is_cover)`
        )
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        propQuery = propQuery.eq('status', filter);
        boatQuery = boatQuery.eq('status', filter);
      }

      const [{ data: properties }, { data: boats }] = await Promise.all([propQuery, boatQuery]);

      const combined: ListingSubmission[] = [
        ...(properties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          type: 'property' as const,
          owner_name: p.wb_profiles?.full_name || 'N/A',
          owner_email: p.wb_profiles?.email || '',
          description: p.description || '',
          status: p.status || 'draft',
          rejection_reason: p.rejection_reason,
          created_at: p.created_at,
          property_type: p.property_type,
          address: p.address,
          city: p.city,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          max_guests: p.max_guests,
          base_price_per_night: p.base_price_per_night,
          currency: p.currency,
          low_season_price: p.low_season_price,
          high_season_price: p.high_season_price,
          peak_season_price: p.peak_season_price,
          latitude: p.latitude,
          longitude: p.longitude,
          images: p.wb_images || [],
        })),
        ...(boats || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          type: 'boat' as const,
          owner_name: b.wb_profiles?.full_name || 'N/A',
          owner_email: b.wb_profiles?.email || '',
          description: b.description || '',
          status: b.status || 'draft',
          rejection_reason: b.rejection_reason,
          created_at: b.created_at,
          boat_type: b.boat_type,
          capacity: b.capacity,
          departure_point: b.departure_point,
          length_ft: b.length_ft,
          captain_name: b.captain_name,
          currency: b.currency,
          latitude: b.latitude,
          longitude: b.longitude,
          images: b.wb_images || [],
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setListings(combined);
    } catch (err) {
      setError('Failed to load submissions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function approveListing(id: string, type: 'property' | 'boat') {
    setActionLoading(id);
    try {
      const supabase = createClient();
      const table = type === 'property' ? 'wb_properties' : 'wb_boats';
      await supabase.from(table).update({ status: 'approved', is_published: true, rejection_reason: null }).eq('id', id);
      setListings((prev) => prev.map((l) => l.id === id ? { ...l, status: 'approved', rejection_reason: null } : l));
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectListing() {
    if (!rejectModal) return;
    setActionLoading(rejectModal.id);
    try {
      const supabase = createClient();
      const table = rejectModal.type === 'property' ? 'wb_properties' : 'wb_boats';
      await supabase.from(table).update({
        status: 'rejected',
        rejection_reason: rejectionReason.trim() || null,
        is_published: false,
      }).eq('id', rejectModal.id);
      setListings((prev) => prev.map((l) =>
        l.id === rejectModal.id ? { ...l, status: 'rejected', rejection_reason: rejectionReason.trim() || null } : l
      ));
      setRejectModal(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setActionLoading(null);
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
      draft: { variant: 'default', label: 'Draft' },
      pending_review: { variant: 'warning', label: 'Pending Review' },
      approved: { variant: 'success', label: 'Approved' },
      rejected: { variant: 'danger', label: 'Rejected' },
    };
    const config = map[status] || { variant: 'default' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filterTabs: { value: FilterStatus; label: string }[] = [
    { value: 'pending_review', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'draft', label: 'Drafts' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Listing Submissions</h1>
        <p className="text-sm text-gray-500 mt-1">Review, approve, or reject owner-submitted listings.</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              filter === tab.value
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <svg className="h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">No submissions found</h2>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'pending_review' ? 'No listings waiting for review.' : `No ${filter} listings.`}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => {
            const coverImage = listing.images?.find((img) => img.is_cover)?.url || listing.images?.[0]?.url;
            return (
              <Card key={`${listing.type}-${listing.id}`} className="p-0 overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  {/* Image */}
                  <div className="h-48 w-full md:h-auto md:w-52 shrink-0 bg-gray-100">
                    {coverImage ? (
                      <img src={coverImage} alt={listing.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full min-h-[120px] items-center justify-center">
                        <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{listing.name}</h3>
                          <Badge variant={listing.type === 'property' ? 'info' : 'warning'}>
                            {listing.type}
                          </Badge>
                          {statusBadge(listing.status)}
                        </div>
                        <p className="text-sm text-gray-500">
                          By {listing.owner_name} ({listing.owner_email})
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(listing.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{listing.description}</p>

                    {/* Key details */}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                      {listing.type === 'property' && (
                        <>
                          <span className="capitalize">{listing.property_type?.replace('_', ' ')}</span>
                          <span>{listing.bedrooms} bed / {listing.bathrooms} bath</span>
                          <span>{listing.max_guests} guests</span>
                          {listing.base_price_per_night && (
                            <span className="font-medium text-gray-700">
                              {listing.currency} {listing.base_price_per_night.toLocaleString()}/night
                            </span>
                          )}
                        </>
                      )}
                      {listing.type === 'boat' && (
                        <>
                          <span className="capitalize">{listing.boat_type?.replace(/_/g, ' ')}</span>
                          <span>{listing.capacity} guests</span>
                          {listing.length_ft && <span>{listing.length_ft} ft</span>}
                          {listing.departure_point && <span>{listing.departure_point}</span>}
                        </>
                      )}
                      <span>{listing.images?.length || 0} photos</span>
                      {listing.latitude && <span>Map pin set</span>}
                    </div>

                    {/* Rejection reason */}
                    {listing.status === 'rejected' && listing.rejection_reason && (
                      <div className="mt-3 rounded-lg bg-red-50 border border-red-100 p-2 text-xs text-red-700">
                        <span className="font-medium">Rejection reason:</span> {listing.rejection_reason}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex gap-2">
                      {listing.status === 'pending_review' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => approveListing(listing.id, listing.type)}
                            disabled={actionLoading === listing.id}
                            loading={actionLoading === listing.id}
                          >
                            Approve & Publish
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setRejectModal({ id: listing.id, type: listing.type, name: listing.name })}
                            disabled={actionLoading === listing.id}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {listing.status === 'rejected' && (
                        <Button
                          size="sm"
                          onClick={() => approveListing(listing.id, listing.type)}
                          disabled={actionLoading === listing.id}
                          loading={actionLoading === listing.id}
                        >
                          Approve & Publish
                        </Button>
                      )}
                      {listing.status === 'approved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            setActionLoading(listing.id);
                            const supabase = createClient();
                            const table = listing.type === 'property' ? 'wb_properties' : 'wb_boats';
                            await supabase.from(table).update({ is_published: false, status: 'draft' }).eq('id', listing.id);
                            setListings((prev) => prev.map((l) => l.id === listing.id ? { ...l, status: 'draft' } : l));
                            setActionLoading(null);
                          }}
                          disabled={actionLoading === listing.id}
                        >
                          Unpublish
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewListing(listing)}
                      >
                        Preview
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Rejection Modal */}
      <Modal
        isOpen={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectionReason(''); }}
        title={`Reject: ${rejectModal?.name}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Please provide a reason for rejecting this listing. The owner will see this feedback.
          </p>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="e.g. Images are too low quality, description needs more detail, pricing seems incorrect..."
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setRejectModal(null); setRejectionReason(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={rejectListing}
              disabled={actionLoading === rejectModal?.id}
              loading={actionLoading === rejectModal?.id}
            >
              Reject Listing
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={!!previewListing}
        onClose={() => setPreviewListing(null)}
        title={`Preview: ${previewListing?.name}`}
        size="lg"
      >
        {previewListing && (
          <div className="space-y-4">
            {previewListing.images && previewListing.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previewListing.images.map((img, i) => (
                  <div key={i} className={`relative aspect-video rounded-lg overflow-hidden ${i === 0 ? 'col-span-3' : ''}`}>
                    <img src={img.url} alt={`${previewListing.name} ${i + 1}`} className="h-full w-full object-cover" />
                    {img.is_cover && (
                      <span className="absolute left-2 top-2 rounded bg-teal-600 px-2 py-0.5 text-xs text-white">Cover</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{previewListing.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={previewListing.type === 'property' ? 'info' : 'warning'}>
                  {previewListing.type}
                </Badge>
                {previewListing.type === 'property' && (
                  <span className="text-sm text-gray-500 capitalize">{previewListing.property_type?.replace('_', ' ')}</span>
                )}
                {previewListing.type === 'boat' && (
                  <span className="text-sm text-gray-500 capitalize">{previewListing.boat_type?.replace(/_/g, ' ')}</span>
                )}
                {statusBadge(previewListing.status)}
              </div>
            </div>

            <p className="text-sm text-gray-700 whitespace-pre-wrap">{previewListing.description}</p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Owner</p>
                <p className="font-medium">{previewListing.owner_name}</p>
                <p className="text-xs text-gray-400">{previewListing.owner_email}</p>
              </div>
              {previewListing.type === 'property' && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Location</p>
                    <p className="font-medium">{previewListing.address}, {previewListing.city}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Accommodation</p>
                    <p className="font-medium">{previewListing.bedrooms} bed / {previewListing.bathrooms} bath / {previewListing.max_guests} guests</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Price</p>
                    <p className="font-medium">{previewListing.currency} {previewListing.base_price_per_night?.toLocaleString()}/night</p>
                  </div>
                  {(previewListing.low_season_price || previewListing.high_season_price || previewListing.peak_season_price) && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Seasonal Pricing</p>
                      <div className="flex gap-3">
                        {previewListing.low_season_price && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                            Low: {previewListing.currency} {previewListing.low_season_price.toLocaleString()}
                          </span>
                        )}
                        {previewListing.high_season_price && (
                          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded">
                            High: {previewListing.currency} {previewListing.high_season_price.toLocaleString()}
                          </span>
                        )}
                        {previewListing.peak_season_price && (
                          <span className="text-xs bg-rose-50 text-rose-700 px-2 py-1 rounded">
                            Peak: {previewListing.currency} {previewListing.peak_season_price.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {previewListing.type === 'boat' && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Capacity</p>
                    <p className="font-medium">{previewListing.capacity} guests</p>
                  </div>
                  {previewListing.length_ft && (
                    <div>
                      <p className="text-xs text-gray-500">Length</p>
                      <p className="font-medium">{previewListing.length_ft} ft</p>
                    </div>
                  )}
                  {previewListing.captain_name && (
                    <div>
                      <p className="text-xs text-gray-500">Captain</p>
                      <p className="font-medium">{previewListing.captain_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Departure</p>
                    <p className="font-medium">{previewListing.departure_point}</p>
                  </div>
                </>
              )}
              {previewListing.latitude && (
                <div>
                  <p className="text-xs text-gray-500">Coordinates</p>
                  <p className="font-medium font-mono text-xs">{previewListing.latitude}, {previewListing.longitude}</p>
                </div>
              )}
            </div>

            {previewListing.status === 'pending_review' && (
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button
                  size="sm"
                  onClick={() => {
                    approveListing(previewListing.id, previewListing.type);
                    setPreviewListing(null);
                  }}
                >
                  Approve & Publish
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setRejectModal({ id: previewListing.id, type: previewListing.type, name: previewListing.name });
                    setPreviewListing(null);
                  }}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

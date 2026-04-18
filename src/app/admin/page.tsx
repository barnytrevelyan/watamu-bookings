'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';

interface AdminStats {
  totalOwners: number;
  totalProperties: number;
  totalBoats: number;
  totalBookings: number;
  totalRevenue: number;
  platformCommission: number;
  pendingReviews: number;
}

interface RecentSignup {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

interface RecentBooking {
  id: string;
  guest_name: string;
  listing_name: string;
  total_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

interface PendingListing {
  id: string;
  name: string;
  type: 'property' | 'boat';
  owner_name: string;
  owner_email: string;
  description: string;
  status: string;
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
  // boat-specific
  boat_type?: string;
  capacity?: number;
  departure_point?: string;
  // images
  images?: { url: string; is_cover: boolean }[];
}

const COMMISSION_RATE = 0.1;

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    totalOwners: 0,
    totalProperties: 0,
    totalBoats: 0,
    totalBookings: 0,
    totalRevenue: 0,
    platformCommission: 0,
    pendingReviews: 0,
  });
  const [recentSignups, setRecentSignups] = useState<RecentSignup[]>([]);
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [pendingListings, setPendingListings] = useState<PendingListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Rejection modal
  const [rejectModal, setRejectModal] = useState<{ id: string; type: 'property' | 'boat'; name: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Preview modal
  const [previewListing, setPreviewListing] = useState<PendingListing | null>(null);

  useEffect(() => {
    fetchAdminData();
  }, []);

  async function fetchAdminData() {
    try {
      const supabase = createClient();

      const [
        { count: ownersCount },
        { count: propertiesCount },
        { count: boatsCount },
        { count: bookingsCount },
        { data: allBookings },
        { data: signups },
        { data: bookingsRecent },
        { data: pendingProperties },
        { data: pendingBoats },
      ] = await Promise.all([
        supabase
          .from('wb_profiles')
          .select('*', { count: 'exact', head: true })
          .in('role', ['owner', 'admin']),
        supabase
          .from('wb_properties')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('wb_boats')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('wb_bookings')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('wb_bookings')
          .select('total_amount')
          .in('status', ['completed', 'confirmed']),
        supabase
          .from('wb_profiles')
          .select('id, full_name, email, role, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('wb_bookings')
          .select(
            `id, total_amount, currency, status, created_at,
            wb_profiles!guest_id(full_name),
            wb_properties(name),
            wb_boats(name)`
          )
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('wb_properties')
          .select(
            `id, name, property_type, description, address, city, bedrooms, bathrooms, max_guests, base_price_per_night, currency, status, created_at,
            wb_profiles!owner_id(full_name, email),
            wb_images(url, is_cover)`
          )
          .eq('status', 'pending_review')
          .order('created_at', { ascending: false }),
        supabase
          .from('wb_boats')
          .select(
            `id, name, boat_type, description, capacity, departure_point, currency, status, created_at,
            wb_profiles!owner_id(full_name, email),
            wb_images(url, is_cover)`
          )
          .eq('status', 'pending_review')
          .order('created_at', { ascending: false }),
      ]);

      const totalRevenue = (allBookings || []).reduce(
        (sum, b) => sum + (b.total_amount || 0),
        0
      );

      // Format pending listings
      const formattedPending: PendingListing[] = [
        ...(pendingProperties || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          type: 'property' as const,
          owner_name: p.wb_profiles?.full_name || 'N/A',
          owner_email: p.wb_profiles?.email || '',
          description: p.description || '',
          status: p.status,
          created_at: p.created_at,
          property_type: p.property_type,
          address: p.address,
          city: p.city,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          max_guests: p.max_guests,
          base_price_per_night: p.base_price_per_night,
          currency: p.currency,
          images: p.wb_images || [],
        })),
        ...(pendingBoats || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          type: 'boat' as const,
          owner_name: b.wb_profiles?.full_name || 'N/A',
          owner_email: b.wb_profiles?.email || '',
          description: b.description || '',
          status: b.status,
          created_at: b.created_at,
          boat_type: b.boat_type,
          capacity: b.capacity,
          departure_point: b.departure_point,
          currency: b.currency,
          images: b.wb_images || [],
        })),
      ];

      setStats({
        totalOwners: ownersCount || 0,
        totalProperties: propertiesCount || 0,
        totalBoats: boatsCount || 0,
        totalBookings: bookingsCount || 0,
        totalRevenue,
        platformCommission: Math.round(totalRevenue * COMMISSION_RATE),
        pendingReviews: formattedPending.length,
      });

      setPendingListings(formattedPending);

      setRecentSignups(
        (signups || []).map((s: any) => ({
          id: s.id,
          full_name: s.full_name || 'N/A',
          email: s.email,
          role: s.role,
          created_at: s.created_at,
        }))
      );

      setRecentBookings(
        (bookingsRecent || []).map((b: any) => ({
          id: b.id,
          guest_name: b.wb_profiles?.full_name || 'Guest',
          listing_name: b.wb_properties?.name || b.wb_boats?.name || 'N/A',
          total_amount: b.total_amount,
          currency: b.currency || 'KES',
          status: b.status,
          created_at: b.created_at,
        }))
      );
    } catch (err) {
      setError('Failed to load admin dashboard data');
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
      const { error: updateError } = await supabase
        .from(table)
        .update({ status: 'approved', is_published: true })
        .eq('id', id);

      if (updateError) throw updateError;

      setPendingListings((prev) => prev.filter((l) => l.id !== id));
      setStats((prev) => ({ ...prev, pendingReviews: prev.pendingReviews - 1 }));
    } catch (err) {
      console.error('Failed to approve listing:', err);
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
      const { error: updateError } = await supabase
        .from(table)
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim() || null,
          is_published: false,
        })
        .eq('id', rejectModal.id);

      if (updateError) throw updateError;

      setPendingListings((prev) => prev.filter((l) => l.id !== rejectModal.id));
      setStats((prev) => ({ ...prev, pendingReviews: prev.pendingReviews - 1 }));
      setRejectModal(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Failed to reject listing:', err);
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Platform Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Owners</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalOwners}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Properties</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalProperties}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Boats</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalBoats}</p>
        </Card>
        {stats.pendingReviews > 0 ? (
          <Card className="border-amber-200 bg-amber-50 p-5">
            <p className="text-sm text-amber-600">Pending Reviews</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{stats.pendingReviews}</p>
          </Card>
        ) : (
          <Card className="p-5">
            <p className="text-sm text-gray-500">Total Bookings</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalBookings}</p>
          </Card>
        )}
        <Card className="p-5">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            KES {stats.totalRevenue.toLocaleString()}
          </p>
        </Card>
        <Card className="border-indigo-200 bg-indigo-50 p-5">
          <p className="text-sm text-indigo-600">Platform Commission (10%)</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            KES {stats.platformCommission.toLocaleString()}
          </p>
        </Card>
      </div>

      {/* Pending Submissions */}
      {pendingListings.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Pending Review ({pendingListings.length})
          </h2>
          <div className="space-y-4">
            {pendingListings.map((listing) => {
              const coverImage = listing.images?.find((img) => img.is_cover)?.url || listing.images?.[0]?.url;
              return (
                <Card key={listing.id} className="p-0 overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* Image */}
                    <div className="h-48 w-full md:h-auto md:w-56 shrink-0 bg-gray-100">
                      {coverImage ? (
                        <img src={coverImage} alt={listing.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{listing.name}</h3>
                            <Badge variant={listing.type === 'property' ? 'info' : 'warning'}>
                              {listing.type}
                            </Badge>
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
                            {listing.address && <span>{listing.address}, {listing.city}</span>}
                          </>
                        )}
                        {listing.type === 'boat' && (
                          <>
                            <span className="capitalize">{listing.boat_type?.replace(/_/g, ' ')}</span>
                            <span>{listing.capacity} guests</span>
                            {listing.departure_point && <span>{listing.departure_point}</span>}
                          </>
                        )}
                        <span>{listing.images?.length || 0} photos</span>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex gap-2">
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
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Recent Signups */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Signups</h2>
          {recentSignups.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No signups yet</p>
          ) : (
            <div className="divide-y">
              {recentSignups.map((signup) => (
                <div key={signup.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">{signup.full_name}</p>
                    <p className="text-xs text-gray-500">{signup.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="default" className="text-xs capitalize">
                      {signup.role}
                    </Badge>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(signup.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Bookings */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Bookings</h2>
          {recentBookings.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No bookings yet</p>
          ) : (
            <div className="divide-y">
              {recentBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-900">{booking.guest_name}</p>
                    <p className="text-xs text-gray-500">{booking.listing_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {booking.currency} {booking.total_amount.toLocaleString()}
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusColor[booking.status] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

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
            {/* Images gallery */}
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
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={previewListing.type === 'property' ? 'info' : 'warning'}>
                  {previewListing.type}
                </Badge>
                {previewListing.type === 'property' && (
                  <span className="text-sm text-gray-500 capitalize">{previewListing.property_type?.replace('_', ' ')}</span>
                )}
                {previewListing.type === 'boat' && (
                  <span className="text-sm text-gray-500 capitalize">{previewListing.boat_type?.replace(/_/g, ' ')}</span>
                )}
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
                </>
              )}
              {previewListing.type === 'boat' && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Capacity</p>
                    <p className="font-medium">{previewListing.capacity} guests</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Departure</p>
                    <p className="font-medium">{previewListing.departure_point}</p>
                  </div>
                </>
              )}
            </div>

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
          </div>
        )}
      </Modal>
    </div>
  );
}

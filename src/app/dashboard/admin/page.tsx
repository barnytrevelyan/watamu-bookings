'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Tab = 'listings' | 'users';

interface PendingListing {
  id: string;
  name: string;
  type: 'property' | 'boat';
  owner_name: string;
  owner_email: string;
  source_url: string | null;
  import_source: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_super_admin: boolean;
  created_at: string;
}

export default function AdminPage() {
  const { user, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('listings');
  const [pendingListings, setPendingListings] = useState<PendingListing[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      router.replace('/dashboard');
      return;
    }
    fetchData();
  }, [authLoading, isAdmin]);

  async function fetchData() {
    setLoading(true);
    const supabase = createClient();

    // Fetch pending listings (properties + boats)
    const [propsRes, boatsRes, usersRes] = await Promise.all([
      supabase
        .from('wb_properties')
        .select('id, name, status, source_url, import_source, created_at, owner_id, wb_profiles!owner_id(full_name, email)')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false }),
      supabase
        .from('wb_boats')
        .select('id, name, status, source_url, import_source, created_at, owner_id, wb_profiles!owner_id(full_name, email)')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false }),
      supabase
        .from('wb_profiles')
        .select('id, full_name, email, role, is_super_admin, created_at')
        .order('created_at', { ascending: true }),
    ]);

    const props: PendingListing[] = (propsRes.data || []).map((p: any) => ({
      id: p.id,
      name: p.name || 'Untitled',
      type: 'property' as const,
      owner_name: p.wb_profiles?.full_name || 'Unknown',
      owner_email: p.wb_profiles?.email || '',
      source_url: p.source_url,
      import_source: p.import_source,
      created_at: p.created_at,
    }));

    const boats: PendingListing[] = (boatsRes.data || []).map((b: any) => ({
      id: b.id,
      name: b.name || 'Untitled',
      type: 'boat' as const,
      owner_name: b.wb_profiles?.full_name || 'Unknown',
      owner_email: b.wb_profiles?.email || '',
      source_url: b.source_url,
      import_source: b.import_source,
      created_at: b.created_at,
    }));

    setPendingListings([...props, ...boats].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));

    setUsers((usersRes.data || []) as UserProfile[]);
    setLoading(false);
  }

  async function handleListingAction(listing: PendingListing, action: 'approve' | 'reject') {
    setActionLoading(listing.id);
    const supabase = createClient();
    const table = listing.type === 'property' ? 'wb_properties' : 'wb_boats';

    await supabase
      .from(table)
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
      })
      .eq('id', listing.id);

    setPendingListings((prev) => prev.filter((l) => l.id !== listing.id));
    setActionLoading(null);
  }

  async function handleToggleAdmin(userId: string, currentRole: string) {
    if (!isSuperAdmin) return;
    setActionLoading(userId);
    const supabase = createClient();

    const newRole = currentRole === 'admin' ? 'owner' : 'admin';
    await supabase
      .from('wb_profiles')
      .update({ role: newRole })
      .eq('id', userId);

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    setActionLoading(null);
  }

  if (authLoading || (!isAdmin && !authLoading)) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review imported listings and manage users.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('listings')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'listings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending Listings ({pendingListings.length})
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'users'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Users ({users.length})
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      ) : tab === 'listings' ? (
        /* Pending Listings Tab */
        pendingListings.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">No listings pending review.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingListings.map((listing) => (
              <Card key={listing.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {listing.name}
                      </h3>
                      <Badge variant={listing.type === 'property' ? 'success' : 'default'}>
                        {listing.type}
                      </Badge>
                      {listing.import_source && (
                        <Badge variant="warning">
                          Imported from {listing.import_source}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Submitted by {listing.owner_name} ({listing.owner_email})
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(listing.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                    {listing.source_url && (
                      <a
                        href={listing.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        View original listing →
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        router.push(
                          listing.type === 'property'
                            ? `/dashboard/properties/${listing.id}`
                            : `/dashboard/boats/${listing.id}`
                        )
                      }
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading === listing.id}
                      onClick={() => handleListingAction(listing, 'reject')}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={actionLoading === listing.id}
                      onClick={() => handleListingAction(listing, 'approve')}
                    >
                      {actionLoading === listing.id ? '...' : 'Approve'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        /* Users Tab */
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {u.full_name || 'No name'}
                    </h3>
                    <Badge
                      variant={
                        u.role === 'admin'
                          ? 'warning'
                          : u.role === 'owner'
                            ? 'success'
                            : 'default'
                      }
                    >
                      {u.is_super_admin ? 'Super Admin' : u.role}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500">{u.email}</p>
                  <p className="text-xs text-gray-400">
                    Joined {new Date(u.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  {isSuperAdmin && !u.is_super_admin && u.id !== user?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading === u.id}
                      onClick={() => handleToggleAdmin(u.id, u.role)}
                    >
                      {actionLoading === u.id
                        ? '...'
                        : u.role === 'admin'
                          ? 'Remove Admin'
                          : 'Make Admin'}
                    </Button>
                  )}
                  {u.is_super_admin && (
                    <span className="text-xs text-amber-600 font-medium">
                      Cannot modify
                    </span>
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

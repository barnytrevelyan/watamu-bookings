'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface Owner {
  id: string;
  full_name: string;
  email: string;
  role: string;
  owner_type: string;
  properties_count: number;
  boats_count: number;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export default function AdminOwnersPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOwners();
  }, []);

  async function fetchOwners() {
    try {
      const supabase = createClient();
      const { data: profiles, error: fetchErr } = await supabase
        .from('wb_profiles')
        .select(
          `
          id,
          full_name,
          email,
          role,
          owner_type,
          is_verified,
          is_active,
          created_at,
          wb_properties(id),
          wb_boats(id)
        `
        )
        .in('role', ['owner', 'admin'])
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const formatted: Owner[] = (profiles || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name || 'N/A',
        email: p.email,
        role: p.role,
        owner_type: p.owner_type || 'property',
        properties_count: (p.wb_properties || []).length,
        boats_count: (p.wb_boats || []).length,
        is_verified: p.is_verified ?? false,
        is_active: p.is_active ?? true,
        created_at: p.created_at,
      }));

      setOwners(formatted);
    } catch (err) {
      setError('Failed to load owners');
    } finally {
      setLoading(false);
    }
  }

  async function toggleVerify(id: string, current: boolean) {
    setUpdatingId(id);
    try {
      const supabase = createClient();
      await supabase
        .from('wb_profiles')
        .update({ is_verified: !current })
        .eq('id', id);
      setOwners((prev) =>
        prev.map((o) => (o.id === id ? { ...o, is_verified: !current } : o))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    setUpdatingId(id);
    try {
      const supabase = createClient();
      await supabase
        .from('wb_profiles')
        .update({ is_active: !current })
        .eq('id', id);
      setOwners((prev) =>
        prev.map((o) => (o.id === id ? { ...o, is_active: !current } : o))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Owners</h1>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Owners</h1>
        <Button onClick={() => router.push('/admin/invitations')}>
          Invite Owner
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {owners.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <h2 className="text-lg font-semibold text-gray-900">No owners yet</h2>
          <p className="mt-2 text-gray-500">
            Invite property and boat owners to join the platform.
          </p>
          <Button className="mt-4" onClick={() => router.push('/admin/invitations')}>
            Send First Invitation
          </Button>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Properties</th>
                <th className="pb-3 font-medium">Boats</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Joined</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {owners.map((owner) => (
                <tr key={owner.id} className="hover:bg-gray-50">
                  <td className="py-3 font-medium text-gray-900">
                    {owner.full_name}
                  </td>
                  <td className="py-3 text-gray-600">{owner.email}</td>
                  <td className="py-3">
                    <Badge variant="outline" className="text-xs capitalize">
                      {owner.owner_type}
                    </Badge>
                  </td>
                  <td className="py-3 text-center">{owner.properties_count}</td>
                  <td className="py-3 text-center">{owner.boats_count}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      {owner.is_verified ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                          Unverified
                        </span>
                      )}
                      {!owner.is_active && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Deactivated
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 whitespace-nowrap text-gray-500">
                    {new Date(owner.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updatingId === owner.id}
                        onClick={() => toggleVerify(owner.id, owner.is_verified)}
                      >
                        {owner.is_verified ? 'Unverify' : 'Verify'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updatingId === owner.id}
                        onClick={() => toggleActive(owner.id, owner.is_active)}
                      >
                        {owner.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

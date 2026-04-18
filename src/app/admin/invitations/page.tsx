'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

interface Invitation {
  id: string;
  email: string;
  owner_type: string;
  message: string | null;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
  expires_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-800',
};

export default function AdminInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form fields
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOwnerType, setInviteOwnerType] = useState('property');
  const [inviteMessage, setInviteMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();
  }, []);

  async function fetchInvitations() {
    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from('wb_invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setInvitations(data || []);
    } catch (err) {
      setError('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }

  function generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function sendInvitation() {
    setFormError(null);

    if (!inviteEmail.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!validateEmail(inviteEmail.trim())) {
      setFormError('Please enter a valid email address');
      return;
    }

    // Check for existing pending invitation
    const existing = invitations.find(
      (inv) =>
        inv.email === inviteEmail.trim().toLowerCase() &&
        inv.status === 'pending'
    );
    if (existing) {
      setFormError('A pending invitation already exists for this email');
      return;
    }

    setSending(true);

    try {
      const supabase = createClient();
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

      const { data, error: insertErr } = await supabase
        .from('wb_invitations')
        .insert({
          email: inviteEmail.trim().toLowerCase(),
          owner_type: inviteOwnerType,
          message: inviteMessage.trim() || null,
          token,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setInvitations((prev) => [data, ...prev]);
      setShowModal(false);
      setInviteEmail('');
      setInviteOwnerType('property');
      setInviteMessage('');
    } catch (err: any) {
      setFormError(err.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  }

  async function resendInvitation(id: string) {
    try {
      const supabase = createClient();
      const newToken = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error: updateErr } = await supabase
        .from('wb_invitations')
        .update({
          token: newToken,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      setInvitations((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? {
                ...inv,
                token: newToken,
                status: 'pending' as const,
                expires_at: expiresAt.toISOString(),
              }
            : inv
        )
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function cancelInvitation(id: string) {
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from('wb_invitations')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (updateErr) throw updateErr;

      setInvitations((prev) =>
        prev.map((inv) =>
          inv.id === id ? { ...inv, status: 'cancelled' as const } : inv
        )
      );
    } catch (err) {
      console.error(err);
    }
  }

  function copyInviteLink(token: string, id: string) {
    const link = `${window.location.origin}/auth/invite?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
        <Button onClick={() => setShowModal(true)}>+ Send Invitation</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {invitations.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <h2 className="text-lg font-semibold text-gray-900">
            No invitations sent yet
          </h2>
          <p className="mt-2 text-gray-500">
            Invite property and boat owners to join the Watamu Bookings platform.
          </p>
          <Button onClick={() => setShowModal(true)} className="mt-4">
            Send First Invitation
          </Button>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Owner Type</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Sent</th>
                <th className="pb-3 font-medium">Expires</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invitations.map((inv) => {
                const isExpired =
                  inv.status === 'pending' &&
                  new Date(inv.expires_at) < new Date();
                const displayStatus = isExpired ? 'expired' : inv.status;

                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{inv.email}</p>
                      {inv.message && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">
                          {inv.message}
                        </p>
                      )}
                    </td>
                    <td className="py-3">
                      <Badge variant="outline" className="text-xs capitalize">
                        {inv.owner_type}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLES[displayStatus] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    <td className="py-3 whitespace-nowrap text-gray-500">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 whitespace-nowrap text-gray-500">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        {(displayStatus === 'pending' || displayStatus === 'expired') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyInviteLink(inv.token, inv.id)}
                            >
                              {copiedId === inv.id ? 'Copied!' : 'Copy Link'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resendInvitation(inv.id)}
                            >
                              Resend
                            </Button>
                          </>
                        )}
                        {displayStatus === 'pending' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelInvitation(inv.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Send Invitation Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Send Invitation
          </h2>
          <p className="text-sm text-gray-500">
            Invite a new property or boat owner to join Watamu Bookings.
          </p>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email Address *
            </label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="owner@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Owner Type
            </label>
            <Select
              value={inviteOwnerType}
              onChange={(e) => setInviteOwnerType(e.target.value)}
            >
              <option value="property">Property Owner</option>
              <option value="boat">Boat Owner</option>
              <option value="both">Both (Property + Boat)</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Personal Message (optional)
            </label>
            <Textarea
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder="Add a personal message to include in the invitation email..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={sendInvitation} disabled={sending}>
              {sending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

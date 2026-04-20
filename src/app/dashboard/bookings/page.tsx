'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  CalendarCheck,
  Search,
  Filter,
  Home,
  Anchor,
  Users,
  Clock,
  Phone,
  Mail,
  Wallet,
  MessageCircle,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Calendar,
} from 'lucide-react';

interface Booking {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  listing_name: string;
  listing_type: 'property' | 'boat';
  check_in: string;
  check_out: string;
  guests_count: number;
  total_price: number;
  currency: string;
  status: string;
  booking_mode: 'platform' | 'direct' | null;
  deposit_amount: number | null;
  special_requests: string | null;
  created_at: string;
}

type StatusKey = 'all' | 'enquiry' | 'pending_payment' | 'confirmed' | 'completed' | 'declined' | 'cancelled' | 'refunded';

const STATUS_META: Record<string, { label: string; chip: string; dot: string }> = {
  enquiry:         { label: 'Enquiry',         chip: 'bg-amber-50 text-amber-800 ring-amber-200',       dot: 'bg-amber-500' },
  pending_payment: { label: 'Pending payment', chip: 'bg-yellow-50 text-yellow-800 ring-yellow-200',    dot: 'bg-yellow-500' },
  confirmed:       { label: 'Confirmed',       chip: 'bg-[var(--color-primary-50,#e8f4fb)] text-[var(--color-primary-800,#023e7d)] ring-[var(--color-primary-200,#8bc8ea)]/60', dot: 'bg-[var(--color-primary-600,#0077b6)]' },
  completed:       { label: 'Completed',       chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  declined:        { label: 'Declined',        chip: 'bg-gray-100 text-gray-700 ring-gray-200',         dot: 'bg-gray-400' },
  cancelled:       { label: 'Cancelled',       chip: 'bg-red-50 text-red-700 ring-red-200',             dot: 'bg-red-400' },
  refunded:        { label: 'Refunded',        chip: 'bg-slate-100 text-slate-700 ring-slate-200',      dot: 'bg-slate-400' },
};

const STATUS_ORDER: StatusKey[] = ['all', 'enquiry', 'pending_payment', 'confirmed', 'completed', 'declined', 'cancelled', 'refunded'];

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtFull(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name: string) {
  return name.split(' ').map((n) => n.charAt(0)).join('').toUpperCase().slice(0, 2) || 'G';
}

export default function BookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'property' | 'boat'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter, typeFilter, dateFrom, dateTo]);

  async function fetchBookings() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // Get owner's property and boat IDs first
      const [propsRes, boatsRes] = await Promise.all([
        supabase.from('wb_properties').select('id').eq('owner_id', user!.id),
        supabase.from('wb_boats').select('id').eq('owner_id', user!.id),
      ]);

      const propIds = (propsRes.data || []).map((p: any) => p.id);
      const boatIds = (boatsRes.data || []).map((b: any) => b.id);

      if (propIds.length === 0 && boatIds.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const allBookings: any[] = [];

      if (propIds.length > 0) {
        let query = supabase
          .from('wb_bookings')
          .select(
            `id, check_in, check_out, guests_count, total_price, currency, status,
            booking_mode, deposit_amount, guest_contact_name, guest_contact_email, guest_contact_phone,
            special_requests, created_at, property_id, boat_id,
            wb_profiles!guest_id(full_name, email),
            wb_properties!property_id(name)`
          )
          .in('property_id', propIds)
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (dateFrom) query = query.gte('check_in', dateFrom);
        if (dateTo) query = query.lte('check_out', dateTo);

        const { data } = await query;
        if (data) allBookings.push(...data);
      }

      if (boatIds.length > 0) {
        let query = supabase
          .from('wb_bookings')
          .select(
            `id, check_in, check_out, guests_count, total_price, currency, status,
            booking_mode, deposit_amount, guest_contact_name, guest_contact_email, guest_contact_phone,
            special_requests, created_at, property_id, boat_id,
            wb_profiles!guest_id(full_name, email),
            wb_boats!boat_id(name)`
          )
          .in('boat_id', boatIds)
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (dateFrom) query = query.gte('check_in', dateFrom);
        if (dateTo) query = query.lte('check_out', dateTo);

        const { data } = await query;
        if (data) allBookings.push(...data);
      }

      // Deduplicate and sort
      const seen = new Set<string>();
      const unique = allBookings.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      let formatted: Booking[] = unique.map((b: any) => ({
        id: b.id,
        guest_name: b.guest_contact_name || b.wb_profiles?.full_name || 'Guest',
        guest_email: b.guest_contact_email || b.wb_profiles?.email || '',
        guest_phone: b.guest_contact_phone || null,
        listing_name: b.wb_properties?.name || b.wb_boats?.name || 'N/A',
        listing_type: b.property_id ? ('property' as const) : ('boat' as const),
        check_in: b.check_in,
        check_out: b.check_out,
        guests_count: b.guests_count,
        total_price: Number(b.total_price) || 0,
        currency: b.currency || 'KES',
        status: b.status,
        booking_mode: b.booking_mode ?? null,
        deposit_amount: b.deposit_amount == null ? null : Number(b.deposit_amount),
        special_requests: b.special_requests,
        created_at: b.created_at,
      }));

      if (typeFilter !== 'all') {
        formatted = formatted.filter((b) => b.listing_type === typeFilter);
      }

      setBookings(formatted);
    } catch (err) {
      console.error(err);
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  async function updateBookingStatus(bookingId: string, newStatus: string) {
    setUpdatingId(bookingId);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from('wb_bookings')
        .update({ status: newStatus })
        .eq('id', bookingId);

      if (updateErr) throw updateErr;

      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  /**
   * For enquiry bookings, route through the dedicated respond endpoint so
   * the guest gets a confirmation email and the availability re-check runs
   * server-side.
   */
  async function respondToEnquiry(bookingId: string, action: 'confirm' | 'decline') {
    setUpdatingId(bookingId);
    try {
      const reason =
        action === 'decline'
          ? window.prompt('Optional message to the guest (leave blank to send a generic decline):') || undefined
          : undefined;

      const res = await fetch(`/api/bookings/${bookingId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Could not update the enquiry.');
        return;
      }

      const newStatus = json.status;
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
      );
    } catch (err) {
      console.error(err);
      alert('Network error — please try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  // Local search filter + stats (after server-side filters already applied)
  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return bookings;
    return bookings.filter(
      (b) =>
        b.guest_name.toLowerCase().includes(s) ||
        b.guest_email.toLowerCase().includes(s) ||
        b.listing_name.toLowerCase().includes(s)
    );
  }, [bookings, search]);

  const stats = useMemo(() => {
    let enquiries = 0;
    let upcoming = 0;
    let revenue = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const b of bookings) {
      if (b.status === 'enquiry') enquiries++;
      if (b.status === 'confirmed') {
        if (new Date(b.check_in) >= today) upcoming++;
        revenue += b.total_price;
      }
      if (b.status === 'completed') revenue += b.total_price;
    }
    return { enquiries, upcoming, revenue, total: bookings.length };
  }, [bookings]);

  const anyFilterActive =
    statusFilter !== 'all' || typeFilter !== 'all' || !!dateFrom || !!dateTo || !!search.trim();

  function clearFilters() {
    setStatusFilter('all');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-sm text-gray-500 mt-1">All enquiries and confirmed stays in one place.</p>
        </div>
        <div className="flex gap-2">
          <StatPill
            icon={<AlertCircle className="h-4 w-4" />}
            label="Enquiries"
            value={stats.enquiries}
            tone="amber"
            highlight={stats.enquiries > 0}
            onClick={() => setStatusFilter('enquiry')}
          />
          <StatPill
            icon={<Calendar className="h-4 w-4" />}
            label="Upcoming"
            value={stats.upcoming}
            tone="blue"
            onClick={() => setStatusFilter('confirmed')}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => fetchBookings()}>
            Retry
          </Button>
        </div>
      )}

      {/* Enquiry nudge */}
      {stats.enquiries > 0 && statusFilter !== 'enquiry' && (
        <button
          type="button"
          onClick={() => setStatusFilter('enquiry')}
          className="w-full text-left rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 hover:from-amber-100 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {stats.enquiries} {stats.enquiries === 1 ? 'enquiry is' : 'enquiries are'} waiting for your reply
              </p>
              <p className="text-xs text-amber-700/90">Tap to filter and respond — guests expect a response within 24 hours.</p>
            </div>
            <ChevronDown className="h-4 w-4 text-amber-700 -rotate-90 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      )}

      {/* Filter bar */}
      <Card className="p-4 space-y-3">
        {/* Status pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400 mr-1" />
          {STATUS_ORDER.map((s) => {
            const active = statusFilter === s;
            const count = s === 'all' ? bookings.length : bookings.filter((b) => b.status === s).length;
            const label = s === 'all' ? 'All' : STATUS_META[s]?.label || s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  active
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s !== 'all' && STATUS_META[s] && (
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} />
                )}
                {label}
                {count > 0 && (
                  <span className={`ml-0.5 text-[10px] ${active ? 'text-white/80' : 'text-gray-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guest or listing…"
                className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
            >
              <option value="all">All types</option>
              <option value="property">Properties</option>
              <option value="boat">Boats</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
          </div>
          <div className="sm:col-span-2">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
          </div>
          <div className="sm:col-span-2">
            {anyFilterActive ? (
              <Button variant="outline" onClick={clearFilters} className="w-full">
                Clear filters
              </Button>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : visible.length === 0 && !error ? (
        <Card className="flex flex-col items-center justify-center p-14 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] to-[var(--color-primary-100,#bde0f6)]">
            <CalendarCheck className="h-8 w-8 text-[var(--color-primary-600,#0077b6)]" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            {anyFilterActive ? 'No bookings match your filters' : 'No bookings yet'}
          </h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md">
            {anyFilterActive
              ? 'Try adjusting or clearing your filters.'
              : 'Bookings will appear here once guests start booking your properties or boats.'}
          </p>
          {anyFilterActive && (
            <Button variant="outline" onClick={clearFilters} className="mt-4">
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              expanded={expandedId === booking.id}
              updating={updatingId === booking.id}
              onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
              onRespond={respondToEnquiry}
              onUpdateStatus={updateBookingStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingRow({
  booking,
  expanded,
  updating,
  onToggle,
  onRespond,
  onUpdateStatus,
}: {
  booking: Booking;
  expanded: boolean;
  updating: boolean;
  onToggle: () => void;
  onRespond: (id: string, action: 'confirm' | 'decline') => void;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const meta = STATUS_META[booking.status] || { label: booking.status, chip: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400' };
  const isEnquiry = booking.status === 'enquiry';
  const ListingIcon = booking.listing_type === 'boat' ? Anchor : Home;
  const nights = Math.max(1, Math.round((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div
      className={`group rounded-2xl border bg-white transition-all ${
        isEnquiry
          ? 'border-amber-200 shadow-sm hover:shadow-md'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 sm:p-5"
      >
        <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
          {/* Avatar */}
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[var(--color-primary-100,#bde0f6)] to-[var(--color-primary-200,#8bc8ea)] text-[var(--color-primary-800,#023e7d)] flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
            {initials(booking.guest_name)}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 truncate">{booking.guest_name}</p>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${meta.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${isEnquiry ? 'animate-pulse' : ''}`} />
                {meta.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
              <ListingIcon className="h-3 w-3" />
              <span className="truncate">{booking.listing_name}</span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[13px] text-gray-700 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                {fmtShort(booking.check_in)} → {fmtFull(booking.check_out)}
              </span>
              <span className="text-gray-400">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {nights} {nights === 1 ? 'night' : 'nights'}
              </span>
              <span className="text-gray-400">·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-gray-400" />
                {booking.guests_count || 1}
              </span>
            </div>
          </div>

          {/* Price */}
          <div className="text-right ml-auto sm:ml-0">
            <p className="text-lg font-bold text-gray-900 tabular-nums">
              {booking.currency} {booking.total_price.toLocaleString()}
            </p>
            {booking.booking_mode === 'direct' && booking.deposit_amount != null && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Deposit: {booking.currency} {booking.deposit_amount.toLocaleString()}
              </p>
            )}
            <ChevronDown
              className={`h-4 w-4 text-gray-400 inline-block mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {/* Action buttons row (doesn't toggle expand) */}
        <div
          className="flex items-center gap-2 mt-3 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {isEnquiry && (
            <>
              <Button
                size="sm"
                disabled={updating}
                onClick={() => onRespond(booking.id, 'confirm')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Confirm &amp; request deposit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={updating}
                onClick={() => onRespond(booking.id, 'decline')}
              >
                <XCircle className="h-4 w-4 mr-1.5 text-gray-400" />
                Decline
              </Button>
            </>
          )}
          {booking.status === 'pending_payment' && (
            <Button
              size="sm"
              variant="outline"
              disabled={updating}
              onClick={() => onUpdateStatus(booking.id, 'confirmed')}
            >
              Mark confirmed
            </Button>
          )}
          {(booking.status === 'pending_payment' || booking.status === 'confirmed') && (
            <Button
              size="sm"
              variant="ghost"
              disabled={updating}
              onClick={() => onUpdateStatus(booking.id, 'cancelled')}
            >
              Cancel
            </Button>
          )}
          {booking.status === 'confirmed' && (
            <Button
              size="sm"
              variant="outline"
              disabled={updating}
              onClick={() => onUpdateStatus(booking.id, 'completed')}
            >
              Mark completed
            </Button>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 sm:px-5 py-4 bg-gray-50/50 rounded-b-2xl animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <DetailCell
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              value={
                booking.guest_email ? (
                  <a
                    href={`mailto:${booking.guest_email}`}
                    className="text-[var(--color-primary-700,#034078)] hover:underline break-all"
                  >
                    {booking.guest_email}
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )
              }
            />
            <DetailCell
              icon={<Phone className="h-4 w-4" />}
              label="Phone"
              value={
                booking.guest_phone ? (
                  <a
                    href={`tel:${booking.guest_phone}`}
                    className="text-[var(--color-primary-700,#034078)] hover:underline"
                  >
                    {booking.guest_phone}
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )
              }
            />
            <DetailCell
              icon={<Clock className="h-4 w-4" />}
              label="Booked on"
              value={<span className="text-gray-900">{fmtFull(booking.created_at)}</span>}
            />
            {booking.booking_mode === 'direct' && booking.deposit_amount != null && (
              <DetailCell
                icon={<Wallet className="h-4 w-4" />}
                label="Expected deposit"
                value={
                  <span className="text-gray-900 font-semibold">
                    {booking.currency} {booking.deposit_amount.toLocaleString()}
                  </span>
                }
              />
            )}
            <div className="sm:col-span-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                <MessageCircle className="h-3.5 w-3.5" />
                Message from guest
              </div>
              <p className="text-gray-800 whitespace-pre-line text-sm leading-relaxed">
                {booking.special_requests || <span className="text-gray-400 italic">No message.</span>}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
        <span className="text-gray-400">{icon}</span>
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone,
  highlight = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'amber' | 'blue' | 'emerald';
  highlight?: boolean;
  onClick?: () => void;
}) {
  const toneClass = {
    amber: highlight
      ? 'bg-amber-500 text-white ring-amber-500 shadow-sm'
      : 'bg-amber-50 text-amber-800 ring-amber-200',
    blue: 'bg-[var(--color-primary-50,#e8f4fb)] text-[var(--color-primary-800,#023e7d)] ring-[var(--color-primary-200,#8bc8ea)]/60',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 ring-1 transition-all ${toneClass} ${
        onClick ? 'hover:scale-[1.02] active:scale-[0.98]' : ''
      }`}
    >
      <span className={highlight ? 'text-white' : ''}>{icon}</span>
      <div className="text-left leading-tight">
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
        <div className="text-base font-bold">{value}</div>
      </div>
    </button>
  );
}

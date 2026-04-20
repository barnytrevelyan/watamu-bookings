'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StarRating } from '@/components/StarRating';
import {
  Home,
  Anchor,
  CalendarCheck,
  TrendingUp,
  Star,
  Sparkles,
  Plus,
  ArrowRight,
  MessageSquare,
  ShieldAlert,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface DashboardStats {
  totalProperties: number;
  totalBoats: number;
  activeBookings: number;
  enquiryCount: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  averageRating: number;
  totalReviews: number;
}

interface RecentBooking {
  id: string;
  guest_name: string;
  listing_name: string;
  listing_type: 'property' | 'boat';
  check_in: string;
  check_out: string;
  total_price: number;
  currency: string;
  status: string;
  created_at: string;
}

interface RecentReview {
  id: string;
  guest_name: string;
  listing_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

// Status → visual style (chip background + text + glow colour)
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  enquiry: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Enquiry' },
  pending_payment: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Awaiting payment' },
  confirmed: { bg: 'bg-[var(--color-primary-100)]', text: 'text-[var(--color-primary-700)]', label: 'Confirmed' },
  completed: { bg: 'bg-[var(--color-green-100)]', text: 'text-[var(--color-green-700)]', label: 'Completed' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Cancelled' },
  declined: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Declined' },
  refunded: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Refunded' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalProperties: 0,
    totalBoats: 0,
    activeBookings: 0,
    enquiryCount: 0,
    revenueThisMonth: 0,
    revenueLastMonth: 0,
    averageRating: 0,
    totalReviews: 0,
  });
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAnyListings, setHasAnyListings] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function fetchDashboardData() {
      try {
        const supabase = createClient();

        const [propsRes, boatsRes] = await Promise.all([
          supabase.from('wb_properties').select('id, avg_rating, review_count').eq('owner_id', user!.id),
          supabase.from('wb_boats').select('id, avg_rating, review_count').eq('owner_id', user!.id),
        ]);

        const ownerProps = propsRes.data || [];
        const ownerBoats = boatsRes.data || [];
        const propIds = ownerProps.map((p: any) => p.id);
        const boatIds = ownerBoats.map((b: any) => b.id);
        setHasAnyListings(propIds.length + boatIds.length > 0);

        const allRatings = [...ownerProps, ...ownerBoats]
          .map((l: any) => l.avg_rating)
          .filter((r: any) => r && r > 0);
        const averageRating = allRatings.length > 0
          ? allRatings.reduce((sum: number, r: number) => sum + r, 0) / allRatings.length
          : 0;
        const totalReviews = [...ownerProps, ...ownerBoats]
          .reduce((sum: number, l: any) => sum + (l.review_count || 0), 0);

        const allBookings: any[] = [];
        if (propIds.length > 0) {
          const { data } = await supabase
            .from('wb_bookings')
            .select('id, check_in, check_out, total_price, currency, status, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_properties!property_id(name)')
            .in('property_id', propIds)
            .order('created_at', { ascending: false });
          if (data) allBookings.push(...data);
        }
        if (boatIds.length > 0) {
          const { data } = await supabase
            .from('wb_bookings')
            .select('id, check_in, check_out, total_price, currency, status, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_boats!boat_id(name)')
            .in('boat_id', boatIds)
            .order('created_at', { ascending: false });
          if (data) allBookings.push(...data);
        }

        const seenBookings = new Set<string>();
        const uniqueBookings = allBookings.filter((b) => {
          if (seenBookings.has(b.id)) return false;
          seenBookings.add(b.id);
          return true;
        });
        uniqueBookings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const activeBookingsCount = uniqueBookings.filter(
          (b) => b.status === 'confirmed' || b.status === 'pending_payment'
        ).length;
        const enquiryCount = uniqueBookings.filter((b) => b.status === 'enquiry').length;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const revenueThisMonth = uniqueBookings
          .filter((b) => (b.status === 'completed' || b.status === 'confirmed') && new Date(b.created_at) >= startOfMonth)
          .reduce((sum, b) => sum + (b.total_price || 0), 0);
        const revenueLastMonth = uniqueBookings
          .filter((b) => (b.status === 'completed' || b.status === 'confirmed') && new Date(b.created_at) >= startOfLastMonth && new Date(b.created_at) < startOfMonth)
          .reduce((sum, b) => sum + (b.total_price || 0), 0);

        setStats({
          totalProperties: ownerProps.length,
          totalBoats: ownerBoats.length,
          activeBookings: activeBookingsCount,
          enquiryCount,
          revenueThisMonth,
          revenueLastMonth,
          averageRating: Math.round(averageRating * 10) / 10,
          totalReviews,
        });

        const formattedBookings: RecentBooking[] = uniqueBookings.slice(0, 6).map(
          (b: any) => ({
            id: b.id,
            guest_name: b.wb_profiles?.full_name || 'Guest',
            listing_name: b.wb_properties?.name || b.wb_boats?.name || 'N/A',
            listing_type: b.property_id ? 'property' : 'boat',
            check_in: b.check_in,
            check_out: b.check_out,
            total_price: b.total_price || 0,
            currency: b.currency || 'KES',
            status: b.status,
            created_at: b.created_at,
          })
        );
        setRecentBookings(formattedBookings);

        const allReviews: any[] = [];
        if (propIds.length > 0) {
          const { data } = await supabase
            .from('wb_reviews')
            .select('id, rating, comment, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_properties!property_id(name)')
            .in('property_id', propIds)
            .order('created_at', { ascending: false })
            .limit(5);
          if (data) allReviews.push(...data);
        }
        if (boatIds.length > 0) {
          const { data } = await supabase
            .from('wb_reviews')
            .select('id, rating, comment, created_at, property_id, boat_id, wb_profiles!guest_id(full_name), wb_boats!boat_id(name)')
            .in('boat_id', boatIds)
            .order('created_at', { ascending: false })
            .limit(5);
          if (data) allReviews.push(...data);
        }

        const seenReviews = new Set<string>();
        const uniqueReviews = allReviews.filter((r) => {
          if (seenReviews.has(r.id)) return false;
          seenReviews.add(r.id);
          return true;
        });
        uniqueReviews.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const formattedReviews: RecentReview[] = uniqueReviews.slice(0, 4).map(
          (r: any) => ({
            id: r.id,
            guest_name: r.wb_profiles?.full_name || 'Guest',
            listing_name: r.wb_properties?.name || r.wb_boats?.name || 'N/A',
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
          })
        );
        setRecentReviews(formattedReviews);
      } catch (err) {
        setError('Failed to load dashboard data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [user]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName = (user?.user_metadata?.full_name as string | undefined) || '';
  const revenueDelta = stats.revenueLastMonth > 0
    ? ((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100
    : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 animate-pulse rounded-2xl bg-gradient-to-r from-gray-100 to-gray-200" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-primary-600)] via-[var(--color-primary-500)] to-[var(--color-primary-400)] p-6 sm:p-8 text-white shadow-lg">
        <div className="absolute inset-0 opacity-[0.08]" style={{
          backgroundImage: 'radial-gradient(circle at 20% 20%, white 0%, transparent 35%), radial-gradient(circle at 80% 60%, white 0%, transparent 45%)',
        }} />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/80">{greeting}{displayName ? `, ${displayName.split(' ')[0]}` : ''}</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back to your host console
            </h1>
            <p className="mt-2 text-sm text-white/85 max-w-xl">
              {hasAnyListings
                ? `You have ${stats.totalProperties + stats.totalBoats} listing${stats.totalProperties + stats.totalBoats === 1 ? '' : 's'} on Watamu Bookings${stats.enquiryCount > 0 ? ` and ${stats.enquiryCount} enquir${stats.enquiryCount === 1 ? 'y' : 'ies'} waiting for your reply` : ''}.`
                : 'Let’s get your first listing up — paste any link and we’ll draft it for you in under a minute.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/import">
              <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[var(--color-primary-700)] text-sm font-semibold shadow-sm hover:shadow-md transition-all">
                <Sparkles className="h-4 w-4" />
                Import with AI
              </button>
            </Link>
            <Link href="/dashboard/properties/new">
              <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/25 text-white text-sm font-semibold hover:bg-white/20 transition-all">
                <Plus className="h-4 w-4" />
                New property
              </button>
            </Link>
            <Link href="/dashboard/boats/new">
              <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/25 text-white text-sm font-semibold hover:bg-white/20 transition-all">
                <Anchor className="h-4 w-4" />
                New boat
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Enquiry nudge */}
      {stats.enquiryCount > 0 && (
        <Link href="/dashboard/bookings?status=enquiry" className="block">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <ShieldAlert className="h-5 w-5 text-amber-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {stats.enquiryCount} enquir{stats.enquiryCount === 1 ? 'y' : 'ies'} waiting for your reply
              </p>
              <p className="text-xs text-amber-800">Guests expect a response within 24 hours — tap to review.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-700" />
          </div>
        </Link>
      )}

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total listings"
          value={`${stats.totalProperties + stats.totalBoats}`}
          sub={`${stats.totalProperties} propert${stats.totalProperties === 1 ? 'y' : 'ies'} · ${stats.totalBoats} boat${stats.totalBoats === 1 ? '' : 's'}`}
          icon={<Home className="h-5 w-5" />}
          tone="blue"
        />
        <KpiCard
          label="Active bookings"
          value={`${stats.activeBookings}`}
          sub={stats.enquiryCount > 0 ? `${stats.enquiryCount} enquiry${stats.enquiryCount === 1 ? '' : ' enquiries'} pending` : 'Confirmed & pending payment'}
          icon={<CalendarCheck className="h-5 w-5" />}
          tone="green"
        />
        <KpiCard
          label="Revenue this month"
          value={`KES ${Math.round(stats.revenueThisMonth).toLocaleString()}`}
          sub={revenueDelta !== null
            ? `${revenueDelta >= 0 ? '▲' : '▼'} ${Math.abs(revenueDelta).toFixed(0)}% vs last month`
            : 'Confirmed & completed'}
          delta={revenueDelta}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="gold"
        />
        <KpiCard
          label="Average rating"
          value={stats.averageRating > 0 ? `${stats.averageRating.toFixed(1)}` : '—'}
          sub={stats.totalReviews > 0 ? `${stats.totalReviews} review${stats.totalReviews === 1 ? '' : 's'}` : 'No reviews yet'}
          icon={<Star className="h-5 w-5" />}
          tone="coral"
          trailing={stats.averageRating > 0 ? <StarRating rating={stats.averageRating} size="sm" /> : null}
        />
      </section>

      {/* No-listings nudge */}
      {!hasAnyListings && (
        <Card className="relative overflow-hidden p-6 sm:p-8 border-0 bg-gradient-to-br from-white via-[var(--color-primary-50)] to-white">
          <div className="flex flex-col lg:flex-row gap-6 items-center">
            <div className="relative h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-[var(--color-primary-500)] to-[var(--color-primary-700)] flex items-center justify-center shadow-md">
              <Sparkles className="h-12 w-12 text-white" />
              <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-secondary-500)] text-white text-[10px] font-bold">AI</span>
            </div>
            <div className="flex-1 text-center lg:text-left">
              <h2 className="text-xl font-bold text-gray-900">Get your first listing live in under 60 seconds</h2>
              <p className="mt-1 text-sm text-gray-600 max-w-xl">
                Paste your existing Airbnb, Booking.com, FishingBooker, or your own website link. We’ll draft photos, pricing, and details — you review and publish.
              </p>
              <div className="mt-4 flex flex-wrap justify-center lg:justify-start gap-2">
                <Link href="/dashboard/import">
                  <Button>
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Try AI Import
                  </Button>
                </Link>
                <Link href="/dashboard/properties/new">
                  <Button variant="outline">Add manually</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Recent activity + Reviews */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Recent bookings</h2>
            <Link href="/dashboard/bookings" className="text-sm font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)] inline-flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentBookings.length === 0 ? (
            <Card className="p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-50)]">
                <CalendarCheck className="h-6 w-6 text-[var(--color-primary-500)]" />
              </div>
              <p className="text-sm text-gray-600">No bookings yet.</p>
              <p className="text-xs text-gray-500 mt-1">Your most recent bookings will show up here.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-gray-100 overflow-hidden">
              {recentBookings.map((b) => {
                const s = STATUS_STYLES[b.status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: b.status };
                const ci = new Date(b.check_in);
                const co = new Date(b.check_out);
                return (
                  <Link
                    key={b.id}
                    href="/dashboard/bookings"
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors group"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${b.listing_type === 'boat' ? 'bg-sky-100 text-sky-700' : 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'}`}>
                      {b.listing_type === 'boat' ? <Anchor className="h-5 w-5" /> : <Home className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 truncate">{b.guest_name}</p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${s.bg} ${s.text}`}>
                          {s.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {b.listing_name} · {ci.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} → {co.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                        {b.currency} {Math.round(b.total_price).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </Link>
                );
              })}
            </Card>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Latest reviews</h2>
            <Link href="/dashboard/reviews" className="text-sm font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)] inline-flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentReviews.length === 0 ? (
            <Card className="p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-secondary-50)]">
                <Star className="h-6 w-6 text-[var(--color-secondary-500)]" />
              </div>
              <p className="text-sm text-gray-600">No reviews yet.</p>
              <p className="text-xs text-gray-500 mt-1">Guest feedback appears here.</p>
            </Card>
          ) : (
            <Card className="p-4 space-y-4">
              {recentReviews.map((r) => (
                <div key={r.id} className="pb-4 last:pb-0 border-b last:border-b-0 border-gray-100">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 truncate pr-2">{r.guest_name}</p>
                    <StarRating rating={r.rating} size="sm" />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {r.listing_name} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                  {r.comment && (
                    <p className="mt-2 text-sm text-gray-700 line-clamp-3">{r.comment}</p>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------- Sub-components -----------------

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  delta,
  trailing,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: 'blue' | 'green' | 'gold' | 'coral';
  delta?: number | null;
  trailing?: React.ReactNode;
}) {
  const toneMap: Record<string, { iconBg: string; iconColor: string; ring: string }> = {
    blue: { iconBg: 'bg-[var(--color-primary-50)]', iconColor: 'text-[var(--color-primary-600)]', ring: 'from-[var(--color-primary-100)] to-transparent' },
    green: { iconBg: 'bg-[var(--color-green-50)]', iconColor: 'text-[var(--color-green-600)]', ring: 'from-[var(--color-green-100)] to-transparent' },
    gold: { iconBg: 'bg-[var(--color-secondary-50)]', iconColor: 'text-[var(--color-secondary-600)]', ring: 'from-[var(--color-secondary-100)] to-transparent' },
    coral: { iconBg: 'bg-[var(--color-coral-50)]', iconColor: 'text-[var(--color-coral-500)]', ring: 'from-[var(--color-coral-100)] to-transparent' },
  };
  const t = toneMap[tone];
  const isUp = delta != null && delta >= 0;
  return (
    <div className="relative group overflow-hidden rounded-2xl bg-white border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br ${t.ring} opacity-60`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.iconBg} ${t.iconColor} shrink-0`}>
          {icon}
        </div>
      </div>
      <div className="relative mt-3 flex items-center gap-2">
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${isUp ? 'bg-[var(--color-green-100)] text-[var(--color-green-700)]' : 'bg-[var(--color-coral-100)] text-[var(--color-coral-700)]'}`}>
            {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        <p className="text-xs text-gray-500 truncate flex-1">{sub}</p>
        {trailing}
      </div>
    </div>
  );
}

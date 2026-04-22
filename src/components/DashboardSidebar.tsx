'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  Anchor,
  CalendarCheck,
  Star,
  BarChart3,
  CreditCard,
  Menu,
  X,
  ChevronLeft,
  Sparkles,
  Shield,
  Waves,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { useBrand } from '@/lib/places/BrandProvider';

interface DashboardSidebarProps {
  userName: string;
  userEmail: string;
  userAvatar?: string;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'overview' | 'listings' | 'revenue' | 'tools';
  badgeKey?: 'pending';
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, group: 'overview' },
  { href: '/dashboard/properties', label: 'Properties', icon: Home, group: 'listings' },
  { href: '/dashboard/boats', label: 'Boats & Charters', icon: Anchor, group: 'listings' },
  { href: '/dashboard/bookings', label: 'Bookings', icon: CalendarCheck, group: 'revenue', badgeKey: 'pending' },
  { href: '/dashboard/reviews', label: 'Reviews', icon: Star, group: 'revenue' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, group: 'revenue' },
  { href: '/dashboard/earnings', label: 'Earnings', icon: CreditCard, group: 'revenue' },
  { href: '/dashboard/flexi-pricing', label: 'Flexi pricing', icon: Sparkles, group: 'tools' },
  { href: '/dashboard/import', label: 'AI Import', icon: Sparkles, group: 'tools' },
];

const groupLabels: Record<NavItem['group'], string> = {
  overview: '',
  listings: 'Listings',
  revenue: 'Revenue',
  tools: 'Tools',
};

const adminItems = [
  { href: '/dashboard/admin', label: 'Admin Panel', icon: Shield },
];

export default function DashboardSidebar({
  userName,
  userEmail,
  userAvatar,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const brand = useBrand();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin, user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  // Load pending-payment count so we can surface an attention-grabbing pill
  // next to the Bookings nav item — hosts shouldn't have to dig for these.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const supa = createClient();
        const [{ data: props }, { data: boats }] = await Promise.all([
          supa.from('wb_properties').select('id').eq('owner_id', user.id),
          supa.from('wb_boats').select('id').eq('owner_id', user.id),
        ]);
        const propIds = (props || []).map((p: any) => p.id);
        const boatIds = (boats || []).map((b: any) => b.id);
        if (propIds.length === 0 && boatIds.length === 0) return;

        let count = 0;
        if (propIds.length > 0) {
          const { count: c } = await supa
            .from('wb_bookings')
            .select('id', { count: 'exact', head: true })
            .in('property_id', propIds)
            .eq('status', 'pending_payment');
          count += c ?? 0;
        }
        if (boatIds.length > 0) {
          const { count: c } = await supa
            .from('wb_bookings')
            .select('id', { count: 'exact', head: true })
            .in('boat_id', boatIds)
            .eq('status', 'pending_payment');
          count += c ?? 0;
        }
        if (!cancelled) setPendingCount(count);
      } catch {
        /* best-effort; never block the shell */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  const initials = userName
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const badgeFor = (key?: NavItem['badgeKey']): number | null => {
    if (key === 'pending') return pendingCount > 0 ? pendingCount : null;
    return null;
  };

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="p-5 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[var(--color-primary-500)] to-[var(--color-primary-700)] flex items-center justify-center shadow-sm ring-1 ring-black/5">
            <Waves className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight">{brand.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-primary-600)] font-semibold">Host console</p>
          </div>
        </Link>
      </div>

      {/* User info */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[var(--color-primary-100)] to-[var(--color-primary-200)] text-[var(--color-primary-700)] flex items-center justify-center text-sm font-bold ring-2 ring-white shadow-sm">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {userName}
            </p>
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>
        </div>
      </div>

      {/* Quick add */}
      <div className="px-3 pb-3">
        <Link
          href="/dashboard/import"
          onClick={() => setMobileOpen(false)}
          className="group flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-[var(--color-primary-500)] to-[var(--color-primary-600)] text-white text-sm font-semibold shadow-sm hover:shadow-md hover:from-[var(--color-primary-600)] hover:to-[var(--color-primary-700)] transition-all"
        >
          <Sparkles className="h-4 w-4" />
          Import with AI
        </Link>
        <Link
          href="/dashboard/properties/new"
          onClick={() => setMobileOpen(false)}
          className="mt-2 flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New listing
        </Link>
      </div>

      {/* Navigation — grouped */}
      <nav className="px-3 flex-1 overflow-y-auto">
        {(['overview', 'listings', 'revenue', 'tools'] as NavItem['group'][]).map((group) => {
          const items = navItems.filter((i) => i.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mt-3 first:mt-0">
              {groupLabels[group] && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {groupLabels[group]}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  const badge = badgeFor(item.badgeKey);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`
                          relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                          transition-all duration-200
                          ${
                            active
                              ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                          }
                        `}
                      >
                        {active && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gradient-to-b from-[var(--color-primary-500)] to-[var(--color-primary-700)]" />
                        )}
                        <item.icon
                          className={`h-[18px] w-[18px] shrink-0 ${
                            active
                              ? 'text-[var(--color-primary-600)]'
                              : 'text-gray-400'
                          }`}
                        />
                        <span className="flex-1">{item.label}</span>
                        {badge !== null && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-[var(--color-coral-500)] text-white">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {isAdmin && (
          <div className="mt-4">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
              Admin
            </p>
            <ul className="space-y-0.5">
              {adminItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                        transition-colors
                        ${
                          active
                            ? 'bg-amber-50 text-amber-700'
                            : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                        }
                      `}
                    >
                      <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-amber-600' : 'text-amber-400'}`} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* Back to site */}
      <div className="p-3 border-t border-gray-100">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to site
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md border border-gray-100"
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40 animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`
          lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-100
          flex flex-col transform transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-end p-3">
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-gray-100 min-h-screen sticky top-0">
        {sidebarContent}
      </aside>
    </>
  );
}

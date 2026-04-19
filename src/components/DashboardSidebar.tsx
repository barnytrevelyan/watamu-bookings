'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  Anchor,
  CalendarCheck,
  Star,
  BarChart3,
  Menu,
  X,
  ChevronLeft,
  Download,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface DashboardSidebarProps {
  userName: string;
  userEmail: string;
  userAvatar?: string;
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/properties', label: 'My Properties', icon: Home },
  { href: '/dashboard/boats', label: 'My Boats', icon: Anchor },
  { href: '/dashboard/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/dashboard/reviews', label: 'Reviews', icon: Star },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/import', label: 'Import Listing', icon: Download },
];

const adminItems = [
  { href: '/dashboard/admin', label: 'Admin Panel', icon: Shield },
];

export default function DashboardSidebar({
  userName,
  userEmail,
  userAvatar,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin } = useAuth();

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

  const sidebarContent = (
    <>
      {/* User info */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName}
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <div className="h-11 w-11 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-600)] flex items-center justify-center text-sm font-bold">
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

      {/* Navigation */}
      <nav className="p-3 flex-1">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-colors duration-200
                    ${
                      active
                        ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-600)]'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }
                  `}
                >
                  <item.icon
                    className={`h-5 w-5 shrink-0 ${
                      active
                        ? 'text-[var(--color-primary-500)]'
                        : 'text-gray-400'
                    }`}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
          {isAdmin && adminItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-colors duration-200
                    ${
                      active
                        ? 'bg-amber-50 text-amber-700'
                        : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                    }
                  `}
                >
                  <item.icon
                    className={`h-5 w-5 shrink-0 ${
                      active ? 'text-amber-600' : 'text-amber-400'
                    }`}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
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

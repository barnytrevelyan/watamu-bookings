'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Menu,
  X,
  LogOut,
  Settings,
  LayoutDashboard,
  ChevronDown,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useBrand } from '@/lib/places/BrandProvider';
import type { PlaceFeature } from '@/lib/types';

interface NavbarProps {
  /** Full brand name, e.g. "Watamu Bookings" or "Kwetu". */
  brandName?: string;
}

export default function Navbar({ brandName = 'Kwetu' }: NavbarProps) {
  const { features, placeSlug, destinations } = useBrand();
  const { user, profile, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Switch to another destination. Every place slug rewrites to `/` at
   * the middleware layer, so the App Router sees the target as the same
   * route as the current page and re-uses the cached RSC payload —
   * push()+refresh() is not reliable enough because the prefetched
   * payload is already the wrong one. A full page load is the only
   * guaranteed way to re-run middleware and pick up the new
   * x-wb-place header. Crossing a place boundary is a hard context
   * switch (brand, features, nav) so a reload is also the honest UX.
   */
  const switchDestination = (slug: string) => {
    setMobileOpen(false);
    window.location.assign(`/${slug}`);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = () => {
    // Fire signOut in background — don't wait for it
    signOut();
    // Hard redirect immediately to clear all state
    window.location.href = '/';
  };

  // Nav links gated by place features. `requires: null` means always shown.
  // `scoped: true` means the link lives inside the current place (prefixed
  // with /<slug> on multi-place shells); shell-level links like About /
  // Become a Host stay un-prefixed.
  const navCatalogue: Array<{
    href: string;
    label: string;
    requires: PlaceFeature | null;
    scoped: boolean;
    shellOnly?: boolean;
  }> = [
    { href: '/properties', label: 'Properties', requires: 'properties', scoped: true },
    { href: '/boats', label: 'Fishing Charters', requires: 'boats', scoped: true },
    { href: '/activities', label: 'Activities', requires: null, scoped: true },
    { href: '/map', label: 'Map', requires: null, scoped: true },
    { href: '/tides', label: 'Tides & Weather', requires: 'tides', scoped: true },
    // Shell-only anchor to the destinations grid on the home page. Hidden
    // inside a place context; duplicated in placeHomeHref on mobile.
    { href: '/#destinations', label: 'Destinations', requires: null, scoped: false, shellOnly: true },
    { href: '/about', label: 'About', requires: null, scoped: false },
    { href: '/become-a-host', label: 'Become a Host', requires: null, scoped: false },
  ];

  // On the multi-place shell (no place resolved) we only surface shell-level
  // links — topic pages like /properties or /map are place-scoped and would
  // 404 without a place context. Users pick a destination first.
  const inPlace = Boolean(placeSlug);
  const navLinks = navCatalogue
    .filter((link) => {
      if (!inPlace) return !link.scoped; // shell: only unscoped links
      if (link.shellOnly) return false; // in-place: hide shell-only entries
      if (link.requires === null) return true;
      return features.includes(link.requires);
    })
    .map((link) => ({
      ...link,
      // Prefix place-scoped links with /<slug> when in a place so the URL
      // reflects the current destination and bookmarks stay meaningful.
      href: link.scoped && placeSlug ? `/${placeSlug}${link.href}` : link.href,
    }));

  // Destination tab switcher — visible once a place is active. Clicking the
  // inactive tab hops to the matching landing in the sibling destination.
  const showDestinationTabs = inPlace && destinations.length > 1;

  // Use JWT metadata for instant display, profile as upgrade
  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'User';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo + place breadcrumb */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" className="flex items-center" aria-label={brandName}>
              <Image
                src="/brand/kwetu-logo.png"
                alt={brandName}
                width={1126}
                height={247}
                priority
                className="h-8 w-auto sm:h-9"
              />
            </Link>
            {showDestinationTabs && (
              <div
                className="hidden sm:flex items-center gap-1 ml-3 p-1 bg-gray-100 rounded-full"
                role="tablist"
                aria-label="Destinations"
              >
                {destinations.map((dest) => {
                  const active = dest.slug === placeSlug;
                  return (
                    <button
                      key={dest.slug}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => switchDestination(dest.slug)}
                      className={
                        (active
                          ? 'bg-white text-[var(--color-primary-700)] shadow-sm ring-1 ring-[var(--color-primary-200)] font-semibold'
                          : 'text-gray-600 hover:text-gray-900 font-medium') +
                        ' px-3 py-1 text-sm rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-400)]'
                      }
                    >
                      {dest.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-[var(--color-primary-600)] rounded-lg hover:bg-[var(--color-primary-50)] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse" />
            ) : user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-600)] flex items-center justify-center text-sm font-semibold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {displayName}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-100 shadow-lg py-1 animate-scale-in">
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Link>
                    <Link
                      href="/dashboard/bookings"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <Settings className="h-4 w-4" />
                      My Bookings
                    </Link>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button variant="primary" size="sm">
                    Register
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button — h-11 w-11 meets the 44×44 WCAG touch-target minimum */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-3 h-11 w-11 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white animate-slide-down">
          {showDestinationTabs && (
            <div className="px-4 py-3 border-b border-gray-100">
              <div
                className="flex gap-1 p-1 bg-gray-100 rounded-full"
                role="tablist"
                aria-label="Destinations"
              >
                {destinations.map((dest) => {
                  const active = dest.slug === placeSlug;
                  return (
                    <button
                      key={dest.slug}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => switchDestination(dest.slug)}
                      className={
                        (active
                          ? 'bg-white text-[var(--color-primary-700)] shadow-sm ring-1 ring-[var(--color-primary-200)] font-semibold'
                          : 'text-gray-600 hover:text-gray-900 font-medium') +
                        ' flex-1 text-center px-3 py-2 text-sm rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-400)]'
                      }
                    >
                      {dest.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 text-base font-medium text-gray-700 hover:text-[var(--color-primary-600)] hover:bg-[var(--color-primary-50)] rounded-lg transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-gray-100 px-4 py-4">
            {user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-4 py-2">
                  <div className="h-10 w-10 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-600)] flex items-center justify-center text-sm font-semibold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {displayName}
                    </p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 text-base text-gray-700 hover:bg-gray-50 rounded-lg"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-4 py-3 text-base text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Link href="/auth/login" className="flex-1">
                  <Button
                    variant="outline"
                    fullWidth
                    onClick={() => setMobileOpen(false)}
                  >
                    Log in
                  </Button>
                </Link>
                <Link href="/auth/register" className="flex-1">
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => setMobileOpen(false)}
                  >
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

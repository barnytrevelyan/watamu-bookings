'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Waves,
  Menu,
  X,
  LogOut,
  Settings,
  LayoutDashboard,
  ChevronDown,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function Navbar() {
  const { user, profile, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const navLinks = [
    { href: '/properties', label: 'Properties' },
    { href: '/boats', label: 'Fishing Charters' },
    { href: '/activities', label: 'Activities' },
    { href: '/map', label: 'Map' },
    { href: '/tides', label: 'Tides & Weather' },
    { href: '/about', label: 'About' },
  ];

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
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Waves className="h-7 w-7 text-[var(--color-primary-500)]" />
            <span className="text-xl font-bold text-gray-900">
              Watamu{' '}
              <span className="text-[var(--color-primary-500)]">Bookings</span>
            </span>
          </Link>

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
                <Link
                  href="/become-a-host"
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-[var(--color-primary-600)] rounded-lg hover:bg-[var(--color-primary-50)] transition-colors"
                >
                  Become a host
                </Link>
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

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
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
              <div className="space-y-3">
                <Link
                  href="/become-a-host"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 text-base font-medium text-[var(--color-primary-700)] bg-[var(--color-primary-50)] rounded-lg text-center"
                >
                  Become a host
                </Link>
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
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

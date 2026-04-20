import React from 'react';
import Link from 'next/link';
import { Waves, Mail, MapPin } from 'lucide-react';

const footerColumns = [
  {
    title: 'Properties',
    links: [
      { label: 'Beach Houses', href: '/properties?type=beach-house' },
      { label: 'Apartments', href: '/properties?type=apartment' },
      { label: 'Villas', href: '/properties?type=villa' },
      { label: 'Cottages', href: '/properties?type=cottage' },
      { label: 'All Properties', href: '/properties' },
    ],
  },
  {
    title: 'Fishing Charters',
    links: [
      { label: 'Sport Fishing', href: '/boats?type=sport-fisher' },
      { label: 'Dhow Trips', href: '/boats?type=dhow' },
      { label: 'Deep Sea Fishing', href: '/boats?trip=deep-sea' },
      { label: 'Reef Fishing', href: '/boats?trip=reef' },
      { label: 'All Boats', href: '/boats' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'Activities', href: '/activities' },
      { label: 'Tides & Weather', href: '/tides' },
      { label: 'Map', href: '/map' },
      { label: 'List Your Property', href: '/auth/register' },
      { label: 'About Us', href: '/about' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Waves className="h-7 w-7 text-[var(--color-primary-400)]" />
              <span className="text-xl font-bold text-white">
                Watamu{' '}
                <span className="text-[var(--color-primary-400)]">Bookings</span>
              </span>
            </Link>
            <p className="text-sm text-gray-400 leading-relaxed max-w-sm mb-6">
              Your local alternative to the big platforms. Book stunning beachfront
              properties and unforgettable fishing charter experiences in Watamu,
              Kenya.
            </p>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>Watamu, Kilifi County, Kenya</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Mail className="h-4 w-4 shrink-0" />
                <a
                  href="mailto:info@watamubookings.com"
                  className="hover:text-white transition-colors"
                >
                  info@watamubookings.com
                </a>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                {column.title}
              </h3>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Watamu Bookings. All rights
            reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/about" className="hover:text-white transition-colors">
              About
            </Link>
            <Link href="/activities" className="hover:text-white transition-colors">
              Activities
            </Link>
            <Link href="/map" className="hover:text-white transition-colors">
              Map
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

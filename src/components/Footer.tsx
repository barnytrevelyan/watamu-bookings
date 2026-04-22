import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, MapPin } from 'lucide-react';

const footerColumns = [
  {
    title: 'Properties',
    links: [
      // Query params must match what /properties/page.tsx reads: `property_type`
      // plus the snake_case enum values used by SearchFilters + the DB.
      { label: 'Beach Houses', href: '/properties?property_type=beach_house' },
      { label: 'Apartments', href: '/properties?property_type=apartment' },
      { label: 'Villas', href: '/properties?property_type=villa' },
      { label: 'Cottages', href: '/properties?property_type=cottage' },
      { label: 'All Properties', href: '/properties' },
    ],
  },
  {
    title: 'Fishing Charters',
    links: [
      // `/boats` reads boat_type; trip_type doesn't include 'deep_sea' or 'reef'
      // so those link to boat_type instead (deep_sea is a boat type, and
      // glass_bottom boats are the Watamu reef-tour workhorse).
      { label: 'Sport Fishing', href: '/boats?boat_type=sport_fisher' },
      { label: 'Dhow Trips', href: '/boats?boat_type=dhow' },
      { label: 'Deep Sea Fishing', href: '/boats?boat_type=deep_sea' },
      { label: 'Reef Tours', href: '/boats?boat_type=glass_bottom' },
      { label: 'All Boats', href: '/boats' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'Activities', href: '/activities' },
      { label: 'Tides & Weather', href: '/tides' },
      { label: 'Map', href: '/map' },
      { label: 'Become a Host', href: '/become-a-host' },
      { label: 'About Us', href: '/about' },
    ],
  },
];

interface FooterProps {
  brandName?: string;
  brandShort?: string;
  /** Public support inbox. Falls back to Watamu Bookings address if unset. */
  supportEmail?: string | null;
  /** Human-readable location for the contact block, e.g. "Watamu, Kenya". */
  placeLabel?: string;
}

export default function Footer({
  brandName = 'Kwetu',
  brandShort = 'Kwetu',
  supportEmail,
  placeLabel,
}: FooterProps) {
  const email = supportEmail || 'hello@kwetu.ke';
  const contactLine = placeLabel || `${brandShort}, Kenya`;

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center mb-4 rounded-lg bg-white p-2"
              aria-label={brandName}
            >
              <Image
                src="/brand/kwetu-logo.png"
                alt={brandName}
                width={1126}
                height={247}
                className="h-8 w-auto"
              />
            </Link>
            <p className="text-sm text-gray-400 leading-relaxed max-w-sm mb-6">
              Your local alternative to the big platforms. Book stunning
              beachfront properties and unforgettable fishing charter
              experiences on the Kenyan coast.
            </p>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>{contactLine}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Mail className="h-4 w-4 shrink-0" />
                <a
                  href={`mailto:${email}`}
                  className="hover:text-white transition-colors"
                >
                  {email}
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
            &copy; {new Date().getFullYear()} {brandName}. All rights reserved.
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

import Link from 'next/link';
import Image from 'next/image';
import { STOCK_IMAGES } from '@/lib/images';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Watamu Bookings',
  description:
    'Watamu Bookings is a local booking platform connecting travellers with beautiful properties and world-class fishing charters in Watamu, Kenya.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[40vh] min-h-[320px]">
        <Image
          src={STOCK_IMAGES.scenery.palmTrees}
          alt="Watamu coastline"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/30" />
        <div className="relative z-10 h-full flex items-center justify-center text-center px-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white">About Watamu Bookings</h1>
            <p className="mt-3 text-lg text-white/90 max-w-xl mx-auto">
              Your local alternative to the big platforms
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-3xl mx-auto px-4 py-16 lg:py-24 space-y-12">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Story</h2>
          <p className="text-gray-600 leading-relaxed">
            Watamu is one of East Africa's most beautiful coastal destinations — white sand beaches,
            a UNESCO Biosphere Reserve, incredible marine life, and world-renowned deep-sea fishing.
            Yet property owners and boat captains here have long depended on international platforms
            that take large commissions and don't understand the local market.
          </p>
          <p className="mt-4 text-gray-600 leading-relaxed">
            Watamu Bookings was built to change that. We're a local-first platform that connects
            travellers directly with Watamu's best accommodation and fishing charter operators — with
            lower fees, local payment options including M-Pesa, and a focus on the community.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">What We Offer</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Holiday Properties</h3>
              <p className="text-sm text-gray-600">
                Beachfront villas, apartments, cottages and holiday homes — all hand-vetted and
                managed by local owners who know Watamu best.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Fishing Charters</h3>
              <p className="text-sm text-gray-600">
                Deep-sea fishing for marlin, sailfish, tuna and more with experienced local captains.
                Sport fishers, dhows, and catamarans available.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Secure Payments</h3>
              <p className="text-sm text-gray-600">
                Pay by card (Visa, Mastercard) or M-Pesa. Bookings are only confirmed once payment
                is received — no surprises.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Local Support</h3>
              <p className="text-sm text-gray-600">
                We're based in Watamu. If you need help before, during, or after your stay, we're
                here and we understand the area.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">For Property & Boat Owners</h2>
          <p className="text-gray-600 leading-relaxed">
            If you own a rental property or fishing boat in Watamu, we'd love to have you on the
            platform. We charge lower commissions than the international platforms, handle payments
            securely, and give you a full dashboard to manage your listings, bookings, and reviews.
          </p>
          <p className="mt-4 text-gray-600 leading-relaxed">
            Interested? Get in touch at{' '}
            <a
              href="mailto:info@watamubookings.com"
              className="text-[var(--color-primary-600)] font-medium hover:underline"
            >
              info@watamubookings.com
            </a>{' '}
            and we'll send you an invitation to get started.
          </p>
        </div>

        <div className="text-center pt-8 border-t border-gray-100">
          <Link
            href="/properties"
            className="inline-block bg-[var(--color-primary-600)] text-white py-3 px-8 rounded-lg font-semibold hover:bg-[var(--color-primary-700)] transition-colors"
          >
            Browse Properties
          </Link>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  // Fall back to a coast-scoped label on the generic kwetu.ke root so we
  // don't say "for Kwetu properties" (Kwetu is the brand, not a place).
  const placeLabel = place?.name ?? 'Kenyan coast';
  return {
    title: `Terms of Service — ${brandName}`,
    description: `The terms and conditions that govern your use of ${brandName}, the local marketplace for ${placeLabel} properties and fishing charters.`,
  };
}

export default async function TermsPage() {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const hostname = host.host || 'kwetu.ke';
  const placeName = place?.name ?? host.brand_short;
  const hasSpecificPlace = Boolean(place?.name);
  // "in Watamu, Kenya" reads naturally; "in Kwetu, Kenya" doesn't because
  // Kwetu is the brand, not a place. Use a coast-scoped label when the
  // place isn't resolved (e.g. generic kwetu.ke root).
  const jurisdictionLabel = hasSpecificPlace ? `${placeName}, Kenya` : 'Kenya';
  const isWatamu = placeName === 'Watamu';
  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto max-w-3xl px-4 py-16 lg:py-24">
        <div className="mb-10">
          <p className="text-sm font-medium text-indigo-600">Legal</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Last updated: 20 April 2026
          </p>
        </div>

        <div className="prose prose-indigo max-w-none text-gray-700">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
            {' '}{hostname} (the &ldquo;Platform&rdquo;), operated by
            {' '}{brandName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
            &ldquo;our&rdquo;). By creating an account, listing a property or
            charter, or making a booking, you agree to these Terms.
          </p>

          <h2>1. The Platform</h2>
          <p>
            {brandName} connects travellers with independent property
            hosts and fishing-charter operators in {jurisdictionLabel}. We are a
            marketplace: the contract for each stay or charter is between the
            guest and the host/operator. We facilitate discovery, booking and
            payment, but we do not own or operate the listed properties or
            vessels.
          </p>

          <h2>2. Accounts</h2>
          <p>
            You must provide accurate information when creating an account
            and keep it up to date. You are responsible for all activity on
            your account and for keeping your password secure. Accounts are
            for a single individual or legal entity; you may not share
            credentials.
          </p>

          <h2>3. Bookings and payment</h2>
          <p>
            When you book a listing, you enter a direct agreement with the
            host/operator on the terms shown at checkout, including dates,
            guest count, price, cleaning fees, taxes and the host&rsquo;s
            cancellation policy. Payment is processed through our payment
            partners (Stripe and M-Pesa). {brandName} charges a service
            fee (shown separately at checkout) and retains it from the
            payout.
          </p>

          <h2>4. Cancellations and refunds</h2>
          <p>
            The cancellation policy displayed on each listing applies.
            Refunds, where due, are returned to the original payment method
            within a reasonable time. The platform service fee is
            non-refundable except where required by law or where we cancel
            the booking ourselves.
          </p>

          <h2>5. Host and operator responsibilities</h2>
          <p>
            Hosts and charter operators warrant that their listings are
            accurate, that they hold all necessary licences and insurance,
            and that the property or vessel is safe and fit for the stated
            purpose. We may remove listings that breach these Terms or
            applicable law.
          </p>

          <h2>6. Guest responsibilities</h2>
          <p>
            Guests agree to use the property or vessel with reasonable care,
            to follow house rules and safety briefings, and to respect local
            laws, the environment{isWatamu ? ', and the Watamu Marine National Park' : ' and protected marine areas'}.
          </p>

          <h2>7. Prohibited conduct</h2>
          <p>
            You may not use the Platform to transact for illegal activity,
            to harass other users, to scrape or reverse-engineer the
            service, or to circumvent our fees by taking bookings off-
            platform after we introduced you.
          </p>

          <h2>8. Intellectual property</h2>
          <p>
            All Platform content (excluding user-submitted photos and
            descriptions) is owned by or licensed to us. You retain rights
            in content you submit, but grant us a worldwide, royalty-free
            licence to host, display and promote it on the Platform and in
            marketing.
          </p>

          <h2>9. Liability</h2>
          <p>
            The Platform is provided on an &ldquo;as is&rdquo; basis. To the
            maximum extent permitted by Kenyan law, we exclude liability for
            indirect or consequential losses arising from a stay or charter
            arranged through the Platform. Nothing in these Terms limits
            liability that cannot lawfully be excluded.
          </p>

          <h2>10. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes
            will be notified by email or by a notice on the site at least
            14 days before taking effect. Continued use of the Platform
            after that date constitutes acceptance of the updated Terms.
          </p>

          <h2>11. Governing law</h2>
          <p>
            These Terms are governed by the laws of Kenya. Any dispute will
            be resolved in the courts of Kilifi County, without prejudice
            to any mandatory consumer rights.
          </p>

          <h2>12. Contact</h2>
          <p>
            Questions about these Terms? See our{' '}
            <Link href="/contact" className="text-indigo-600 hover:underline">
              contact page
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

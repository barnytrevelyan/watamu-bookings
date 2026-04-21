import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getCurrentPlace();
  const brandName = host.brand_name;
  return {
    title: `Privacy Policy — ${brandName}`,
    description: `How ${brandName} collects, uses and protects your personal data, and the rights you have under the Kenya Data Protection Act and GDPR.`,
  };
}

export default async function PrivacyPage() {
  const { host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const hostname = host.host || 'kwetu.ke';
  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto max-w-3xl px-4 py-16 lg:py-24">
        <div className="mb-10">
          <p className="text-sm font-medium text-indigo-600">Legal</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Last updated: 20 April 2026
          </p>
        </div>

        <div className="prose prose-indigo max-w-none text-gray-700">
          <p>
            This Privacy Policy explains how {brandName} collects, uses,
            shares and protects personal data when you use
            {' '}{hostname}. We comply with the Kenya Data Protection
            Act 2019 and, where applicable, the EU/UK General Data
            Protection Regulation.
          </p>

          <h2>1. Who we are</h2>
          <p>
            {brandName} is the data controller for information collected
            through the Platform. You can reach us at our{' '}
            <Link href="/contact" className="text-indigo-600 hover:underline">
              contact page
            </Link>
            .
          </p>

          <h2>2. What we collect</h2>
          <ul>
            <li>
              <strong>Account data</strong> — name, email, phone number,
              password hash, profile photo and role (guest, host, operator,
              admin).
            </li>
            <li>
              <strong>Booking data</strong> — the listings you view and
              book, dates, guest counts, special requests and messages with
              hosts.
            </li>
            <li>
              <strong>Payment data</strong> — processed by Stripe or
              M-Pesa. We receive a transaction reference and status, but
              never your full card or mobile-wallet credentials.
            </li>
            <li>
              <strong>Device and usage data</strong> — IP address, browser
              type, pages viewed, referrer, and approximate location
              derived from the IP.
            </li>
            <li>
              <strong>Cookies</strong> — a session cookie for authentication
              and a small number of first-party cookies to remember your
              preferences. We do not run third-party advertising trackers.
            </li>
          </ul>

          <h2>3. How we use your data</h2>
          <ul>
            <li>To provide the Platform and process your bookings.</li>
            <li>
              To share the minimum information a host/operator needs to
              fulfil your booking (name, arrival details, guest count).
            </li>
            <li>
              To send service emails — booking confirmations, receipts,
              reminders, and security alerts.
            </li>
            <li>
              To send marketing emails, only if you opt in. You can
              unsubscribe at any time.
            </li>
            <li>
              To prevent fraud, resolve disputes and comply with legal
              obligations.
            </li>
            <li>To improve the Platform through aggregated analytics.</li>
          </ul>

          <h2>4. Who we share it with</h2>
          <p>
            We share data with the host/operator you book, our payment
            processors (Stripe, Safaricom M-Pesa), our email provider, our
            hosting provider (Supabase and Vercel), and law-enforcement
            authorities where legally required. We do not sell personal
            data.
          </p>

          <h2>5. International transfers</h2>
          <p>
            Some of our processors store data outside Kenya (for example,
            in the EU and the US). Where that happens we rely on
            appropriate safeguards such as the EU Standard Contractual
            Clauses or equivalent mechanisms recognised by the Office of
            the Data Protection Commissioner.
          </p>

          <h2>6. Retention</h2>
          <p>
            We keep booking and transaction records for seven years to
            comply with tax and consumer-protection law. Account profile
            data is kept while your account is active, then deleted or
            anonymised on request. Server logs are kept for 30 days.
          </p>

          <h2>7. Your rights</h2>
          <p>
            You have the right to access, correct, export or delete your
            personal data, to object to processing, and to lodge a
            complaint with the Office of the Data Protection Commissioner
            of Kenya (ODPC) or your local supervisory authority. To
            exercise these rights, email us from our{' '}
            <Link href="/contact" className="text-indigo-600 hover:underline">
              contact page
            </Link>
            .
          </p>

          <h2>8. Security</h2>
          <p>
            Traffic is encrypted with TLS. Passwords are stored as one-way
            hashes. Access to the production database is restricted to
            named staff and logged. We will notify affected users and the
            ODPC within 72 hours of a material breach.
          </p>

          <h2>9. Children</h2>
          <p>
            The Platform is intended for users aged 18 and over. We do not
            knowingly collect data from children.
          </p>

          <h2>10. Changes</h2>
          <p>
            We may update this policy from time to time. Material changes
            will be notified by email or a notice on the site.
          </p>
        </div>
      </section>
    </div>
  );
}

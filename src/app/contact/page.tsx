import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageSquare, MapPin, Phone, Sparkles } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact — Watamu Bookings',
  description:
    'Get in touch with the Watamu Bookings team. Support for guests, hosts and charter operators in Watamu, Kenya.',
};

const SUPPORT_EMAIL = 'hello@watamubookings.com';

// WhatsApp + phone are gated behind an env var so we never render the
// `+254 700 000 000` placeholder in demos/prod. Set NEXT_PUBLIC_WHATSAPP_NUMBER
// to e.g. "+254712345678" (digits only also fine) to enable the cards.
const RAW_WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() || '';
const WHATSAPP_DIGITS = RAW_WHATSAPP.replace(/[^\d]/g, '');
const WHATSAPP_NUMBER = RAW_WHATSAPP || '';
const WHATSAPP_LINK = WHATSAPP_DIGITS ? `https://wa.me/${WHATSAPP_DIGITS}` : '';
const HAS_WHATSAPP = Boolean(WHATSAPP_DIGITS);

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto max-w-5xl px-4 py-16 lg:py-24">
        <div className="mb-12 text-center">
          <p className="text-sm font-medium text-indigo-600">Contact</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
            We&rsquo;d love to hear from you
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Questions about a booking, listing your property, or running a
            fishing charter on the platform? Reach out — a real person in
            Watamu will reply, usually within a few hours.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ContactCard
            icon={<Mail className="h-5 w-5" />}
            title="Email"
            body={
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-indigo-600 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            }
            sub="For bookings, billing, refunds and anything else that needs a paper trail."
          />

          {HAS_WHATSAPP ? (
            <>
              <ContactCard
                icon={<MessageSquare className="h-5 w-5" />}
                title="WhatsApp"
                body={
                  <a
                    href={WHATSAPP_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {WHATSAPP_NUMBER}
                  </a>
                }
                sub="Fastest for urgent arrival-day questions and tide-dependent charter changes."
              />

              <ContactCard
                icon={<Phone className="h-5 w-5" />}
                title="Phone"
                body={<span className="font-medium text-gray-900">{WHATSAPP_NUMBER}</span>}
                sub="Mon–Sat, 08:00–18:00 EAT."
              />
            </>
          ) : (
            <ContactCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Response time"
              body={<span className="font-medium text-gray-900">Usually within a few hours, 08:00–20:00 EAT</span>}
              sub="Email first — we reply from a real Watamu address, not a ticketing bot."
            />
          )}

          <ContactCard
            icon={<MapPin className="h-5 w-5" />}
            title="Based in"
            body={<span className="font-medium text-gray-900">Watamu, Kilifi County, Kenya</span>}
            sub="On the ground, on the beach — not a call centre abroad."
          />
        </div>

        <div className="mt-12 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Want to list your property or charter?
              </h2>
              <p className="mt-2 text-gray-700">
                Watamu Bookings charges a flat 8% host fee — significantly
                less than the global platforms — and keeps your guests
                local. Tell us a little about what you offer and we&rsquo;ll
                come back with the next steps.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=List%20my%20property%20or%20charter`}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Email us to get started
                </a>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  Learn about the platform
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  body,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          {icon}
        </div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h3>
      </div>
      <div className="mt-3 text-base text-gray-900">{body}</div>
      <p className="mt-2 text-sm text-gray-500">{sub}</p>
    </div>
  );
}

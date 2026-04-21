import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageSquare, MapPin, Phone, Sparkles } from 'lucide-react';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const placeName = place?.name ?? host.brand_short;
  return {
    title: `Contact — ${brandName}`,
    description: `Get in touch with the ${brandName} team. Support for guests, hosts and charter operators in ${placeName}, Kenya.`,
  };
}

// WhatsApp + phone: prefer the host's configured support_whatsapp, fall back
// to NEXT_PUBLIC_WHATSAPP_NUMBER env so demo hosts can still plumb a number.
function resolveWhatsapp(rawHost: string | null, rawEnv: string | undefined) {
  const raw = (rawHost ?? rawEnv ?? '').trim();
  const digits = raw.replace(/[^\d]/g, '');
  return {
    number: raw || '',
    link: digits ? `https://wa.me/${digits}` : '',
    has: Boolean(digits),
  };
}

export default async function ContactPage() {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const placeName = place?.name ?? host.brand_short;
  const supportEmail = host.support_email ?? 'hello@watamubookings.com';

  const whatsapp = resolveWhatsapp(
    host.support_whatsapp,
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  );

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
            {' '}{placeName} will reply, usually within a few hours.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ContactCard
            icon={<Mail className="h-5 w-5" />}
            title="Email"
            body={
              <a
                href={`mailto:${supportEmail}`}
                className="font-medium text-indigo-600 hover:underline"
              >
                {supportEmail}
              </a>
            }
            sub="For bookings, billing, refunds and anything else that needs a paper trail."
          />

          {whatsapp.has ? (
            <>
              <ContactCard
                icon={<MessageSquare className="h-5 w-5" />}
                title="WhatsApp"
                body={
                  <a
                    href={whatsapp.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {whatsapp.number}
                  </a>
                }
                sub="Fastest for urgent arrival-day questions and tide-dependent charter changes."
              />

              <ContactCard
                icon={<Phone className="h-5 w-5" />}
                title="Phone"
                body={<span className="font-medium text-gray-900">{whatsapp.number}</span>}
                sub="Mon–Sat, 08:00–18:00 EAT."
              />
            </>
          ) : (
            <ContactCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Response time"
              body={<span className="font-medium text-gray-900">Usually within a few hours, 08:00–20:00 EAT</span>}
              sub={`Email first — we reply from a real ${placeName} address, not a ticketing bot.`}
            />
          )}

          <ContactCard
            icon={<MapPin className="h-5 w-5" />}
            title="Based in"
            body={<span className="font-medium text-gray-900">{placeName}, Kenya</span>}
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
                {brandName} charges a flat 8% host fee — significantly
                less than the global platforms — and keeps your guests
                local. Tell us a little about what you offer and we&rsquo;ll
                come back with the next steps.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`mailto:${supportEmail}?subject=List%20my%20property%20or%20charter`}
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

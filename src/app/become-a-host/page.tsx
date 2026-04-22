import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Sparkles,
  Wallet,
  Users,
  Waves,
  Zap,
  ShieldCheck,
  Calendar,
  Anchor,
  ArrowRight,
  MessageSquare,
  Check,
  Percent,
} from 'lucide-react';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getCurrentPlace();
  const brandName = host.brand_name;
  return {
    title: `Become a host — ${brandName}`,
    description: `List your villa, cottage, fishing boat or sunset cruise on ${brandName}. Flat 7.5% commission — roughly half what Airbnb or Booking.com charge. Free to list, paid in 24 hours, M-Pesa supported.`,
  };
}

export default async function BecomeAHostPage() {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const placeName = place?.name ?? host.brand_short;
  const supportEmail = host.support_email ?? 'hello@kwetu.ke';
  const isWatamu = place?.name === 'Watamu';
  // When we're on a specific destination (Watamu, Diani, etc.) copy can
  // reference "the {placeName} coast" naturally. On the generic Kwetu root
  // there is no single place to name — fall back to the Swahili meaning of
  // the brand ("kwetu" = "our home / our place") so the language makes
  // sense instead of treating "Kwetu" as a geographic noun.
  const hasSpecificPlace = place?.name != null;
  const coastLabel = hasSpecificPlace ? `${placeName} coast` : 'Kenyan coast';
  return (
    <div className="min-h-screen bg-white">
      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-50 via-white to-sky-50">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-teal-600">
                Hosts &amp; charter operators
              </p>
              <h1 className="mt-3 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
                {hasSpecificPlace ? (
                  <>
                    Share your piece of {placeName}.{' '}
                    <span className="text-teal-600">Keep more of what you earn.</span>
                  </>
                ) : (
                  <>
                    <span className="italic">Kwetu</span> means &ldquo;home.&rdquo;{' '}
                    <span className="text-teal-600">Share yours.</span>
                  </>
                )}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-gray-600">
                {brandName} is the home-grown marketplace for villas, cottages,
                fishing boats, and sunset cruises on the Kenyan coast &mdash; a place
                for hosts and travellers to call theirs. Lower fees than Airbnb and
                Booking.com, direct relationships with your guests, and real support
                from people who live here too.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/register?role=owner"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
                >
                  Start hosting — it&rsquo;s free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:border-gray-300"
                >
                  See our pricing
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <StatCard label="Commission" value="7.5%" icon={<Percent className="h-4 w-4" />} />
              <StatCard label="To list" value="Free" icon={<Wallet className="h-4 w-4" />} />
              <StatCard label="Paid in" value="24 hrs" icon={<Zap className="h-4 w-4" />} />
              <StatCard label="Supports" value="M-Pesa" icon={<ShieldCheck className="h-4 w-4" />} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- WHY HOST WITH US ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-gray-900">Why host with us</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            Built for the {coastLabel}, run by people who live here. Lower fees and
            tools that actually work for Kenyan hosts.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<Sparkles className="h-5 w-5 text-teal-600" />}
            title="Migrate in under two minutes"
            body="Paste any URL — Airbnb, Booking.com, FishingBooker, or your own website — and our AI imports the whole listing."
          />
          <FeatureCard
            icon={<Wallet className="h-5 w-5 text-teal-600" />}
            title="Half the commission of Airbnb"
            body="Flat 7.5% host commission — no listing fee, no guest service fee. On the same booking you keep roughly 8–10% more than on Airbnb or Booking.com."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5 text-teal-600" />}
            title="Own the guest relationship"
            body="You get the guest's real name, phone number, and email from the moment they book."
          />
          <FeatureCard
            icon={<Waves className="h-5 w-5 text-teal-600" />}
            title={`Built for the ${coastLabel}`}
            body={isWatamu
              ? 'Mida Creek, Marine Park diving, marlin season, dhow sunset sails — the platform knows the rhythms of the coast.'
              : 'Tide-aware charters, seasonal marlin runs, dhow sunset sails — the platform knows the rhythms of the Kenyan coast.'}
          />
        </div>
      </section>

      {/* ---------- PRICING ---------- */}
      <section id="pricing" className="bg-gradient-to-b from-teal-50/60 to-white py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-teal-600">
              Simple pricing
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              One flat commission. No monthly fees.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-600">
              We charge a flat 7.5% commission on each confirmed booking — roughly half
              what Airbnb or Booking.com take. No listing fee, no monthly cost, no
              guest-side service fee, no 30-day payout wait.
            </p>
          </div>

          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border-2 border-teal-500 bg-white p-6 shadow-md ring-1 ring-teal-100 sm:p-8">
              <div className="mb-4 flex items-center gap-2">
                <Percent className="h-5 w-5 text-teal-600" />
                <h3 className="text-lg font-semibold text-gray-900">Commission only</h3>
              </div>
              <p className="text-4xl font-bold text-gray-900">
                7.5%<span className="ml-1 text-base font-medium text-gray-500"> per booking</span>
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Paid only when a guest books. No monthly fee, no setup cost, no minimum.
              </p>

              <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  How it compares
                </p>
                <dl className="mt-3 divide-y divide-gray-200 text-sm">
                  <TierRow listings={`${brandName}`} price="7.5% total" />
                  <TierRow listings="Airbnb (host + guest)" price="≈ 14–16%" />
                  <TierRow listings="Booking.com (host only)" price="≈ 15–18%" />
                  <TierRow listings="FishingBooker" price="≈ 20%" />
                </dl>
                <p className="mt-3 text-xs text-gray-500">
                  On a KES 100,000 stay you keep KES 92,500 with us vs roughly
                  KES 84,000–86,000 on Airbnb or Booking.com — worth ~KES 8,000 more
                  per stay, every stay.
                </p>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-gray-700">
                <PlanBullet>Flat 7.5% commission &mdash; no listing or monthly fees</PlanBullet>
                <PlanBullet>No guest-side service fee &mdash; helps conversion</PlanBullet>
                <PlanBullet>Payouts the day after check-in via M-Pesa or bank</PlanBullet>
                <PlanBullet>Cancel or unlist any time &mdash; no minimum commitment</PlanBullet>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- AI IMPORT ---------- */}
      <section className="bg-gray-50 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-800">
                <Sparkles className="h-3.5 w-3.5" />
                AI-powered
              </div>
              <h2 className="text-3xl font-bold text-gray-900">
                Paste a URL &mdash; we do the rest
              </h2>
              <p className="mt-4 text-gray-600">
                Already listed on Airbnb, Booking.com, Vrbo, FishingBooker, or your own
                website? Drop in the link and our AI reads the page, pulls every detail
                and photo, and lets you approve each field before it&rsquo;s saved.
              </p>
              <p className="mt-3 text-sm text-gray-500">
                The AI saves a draft &mdash; nothing publishes without your say-so.
              </p>
              <Link
                href="/dashboard/import"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Import an existing listing
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
                <span className="font-mono">https://</span>
                <span className="text-gray-900">airbnb.com/rooms/</span>
                <span className="animate-pulse">|</span>
              </div>
              <div className="space-y-2 text-xs text-gray-600">
                <AiStep label="Fetching page" done />
                <AiStep label="Parsing title &amp; description" done />
                <AiStep label="Extracting 24 photos" done />
                <AiStep label="Detecting amenities" done />
                <AiStep label="Drafting listing &mdash; ready to review" pending />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- HOW IT WORKS ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-gray-900">How it works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            Most hosts go from URL to live listing in a single afternoon.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <StepCard
            number="01"
            title="Paste a URL &mdash; we do the rest"
            body="Drop in any listing link. Our AI reads the page, pulls every detail and photo, and lets you approve each field before it's saved."
          />
          <StepCard
            number="02"
            title="We verify ownership"
            body="A quick human check confirms you own or manage the listing. Most hosts are approved within 24 hours."
          />
          <StepCard
            number="03"
            title="Set your price and calendar"
            body="Choose nightly or trip pricing, add seasonal rates, and sync your existing Airbnb or Booking.com calendar so dates stay in step."
          />
          <StepCard
            number="04"
            title="Welcome your first guest"
            body="Bookings come in, guests pay securely, and your payout lands in M-Pesa or your bank the day after check-in."
          />
        </div>
      </section>

      {/* ---------- WHAT YOU GET ---------- */}
      <section className="bg-gray-50 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900">What you get</h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <BenefitCard
              icon={<Calendar className="h-5 w-5 text-teal-600" />}
              title="Calendar sync &amp; availability"
              body={`Two-way iCal sync keeps Airbnb, Booking.com and ${brandName} in step. Block dates once, applied everywhere.`}
            />
            <BenefitCard
              icon={<Users className="h-5 w-5 text-teal-600" />}
              title="Direct guest messaging"
              body="Chat with guests before and after booking. Full name, email and phone from the start."
            />
            <BenefitCard
              icon={<Anchor className="h-5 w-5 text-teal-600" />}
              title="Multi-listing dashboard"
              body="Manage villas, cottages, boats and charters from one place. Per-listing pricing, per-listing calendar, one unified dashboard."
            />
            <BenefitCard
              icon={<Zap className="h-5 w-5 text-teal-600" />}
              title="Next-day payouts"
              body="Payouts the day after check-in via M-Pesa, KES bank transfer or international wire. Not 30 days later."
            />
            <BenefitCard
              icon={<ShieldCheck className="h-5 w-5 text-teal-600" />}
              title="Secure guest payments"
              body="Guests pay by card, M-Pesa or bank transfer. We handle disputes, refunds and chargebacks so you don't have to."
            />
            <BenefitCard
              icon={<MessageSquare className="h-5 w-5 text-teal-600" />}
              title={hasSpecificPlace ? `Real ${placeName} support` : 'Real coast support'}
              body="WhatsApp a human on the coast — not a chatbot in another continent. We answer evenings and weekends."
            />
          </div>
        </div>
      </section>

      {/* ---------- CALENDAR SYNC EXPLAINER ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-teal-600">
              Never double-book
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              Two-way calendar sync, on every listing
            </h2>
            <p className="mt-4 text-gray-600">
              Every listing gets its own iCal feed. Paste ours into Airbnb,
              Booking.com or Google Calendar and bookings on {brandName} instantly
              block those dates everywhere else. Paste their feed into us and
              reservations you already have elsewhere block the same dates here —
              refreshed automatically every morning, and on demand whenever you
              want.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs text-gray-500 sm:text-sm">
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                <p className="font-semibold text-gray-900">Airbnb</p>
                <p className="mt-1">iCal export link</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                <p className="font-semibold text-gray-900">Booking.com</p>
                <p className="mt-1">iCal export link</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                <p className="font-semibold text-gray-900">Google Calendar</p>
                <p className="mt-1">Secret iCal address</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-500">
              Works with anything that speaks iCal — Vrbo, FishingBooker, Hostaway,
              your own website, even a shared team calendar.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-lg font-semibold text-gray-900">
              How the sync actually works
            </h3>
            <ol className="mt-4 space-y-4 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                  1
                </span>
                <span>
                  <span className="font-medium text-gray-900">Outbound is instant.</span>{' '}
                  A booking lands on {brandName} and your export feed updates on the
                  next request. Airbnb and Booking.com poll every few hours and
                  block the dates on their side automatically.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                  2
                </span>
                <span>
                  <span className="font-medium text-gray-900">Inbound is scheduled.</span>{' '}
                  We re-fetch every connected external feed once a day and block
                  any new reservations in your {brandName} calendar automatically.
                  For same-day peace of mind, hit &ldquo;Sync Now&rdquo; on a
                  listing and the refresh happens in seconds.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                  3
                </span>
                <span>
                  <span className="font-medium text-gray-900">You stay in control.</span>{' '}
                  Manually block a maintenance week, owner stay or seasonal closure
                  from the dashboard — those blocks propagate out through the same
                  feed, so every platform sees the same availability.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                  4
                </span>
                <span>
                  <span className="font-medium text-gray-900">Errors surface, not silence.</span>{' '}
                  If a remote feed stops responding (expired link, revoked access)
                  we flag the listing on your dashboard so you can fix it before
                  it matters.
                </span>
              </li>
            </ol>

            <div className="mt-6 rounded-lg bg-teal-50 px-4 py-3 text-xs text-teal-800">
              Set it up once per listing under <span className="font-medium">Dashboard → Calendar Sync</span>.
              Most hosts take under two minutes per platform.
            </div>
          </div>
        </div>
      </section>

      {/* ---------- TESTIMONIALS — only rendered on Watamu-scoped hosts;
           these are real quotes tied to Watamu locations and we don't want
           to fake them for other places. ---------- */}
      {isWatamu && (
        <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900">Hosts on {brandName}</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <TestimonialCard
              quote="I moved Coral Breeze Villa over from Airbnb in one afternoon. My payout hits M-Pesa the day after check-out and I've already had two returning guests book direct."
              name="Amina K."
              role="Villa host · Watamu"
            />
            <TestimonialCard
              quote={`FishingBooker took 20% per charter. On ${brandName} it's 7.5% and I keep the rest — I earn more and talk to my guests directly before they arrive.`}
              name="Captain Juma"
              role="Sport-fishing charter · Watamu Marina"
            />
            <TestimonialCard
              quote="The team is in Watamu. When a guest had a question about Mida Creek tides at 10pm, someone actually knew the answer. That's never happened with Booking.com."
              name="Sarah M."
              role="Cottage host · Mida Creek"
            />
          </div>
        </section>
      )}

      {/* ---------- FAQ ---------- */}
      <section className="bg-gray-50 py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900">Frequently asked questions</h2>
          </div>
          <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            <FaqItem
              q="What does it cost to list?"
              a="Listing is completely free. There is no sign-up charge, no monthly fee, and no cost to import. You only pay when a guest confirms a booking — a flat 7.5% commission on the booking total."
            />
            <FaqItem
              q="How does the 7.5% commission work?"
              a="When a guest books and pays, we deduct 7.5% from the booking total and pay out the remaining 92.5% to you. There's no separate guest-side service fee, which is part of why guests book more readily on us than on commission-heavy platforms."
            />
            <FaqItem
              q="How does the AI import actually work?"
              a="Paste the URL of your existing listing — Airbnb, Booking.com, Vrbo, FishingBooker, Google Sites, Wix, Squarespace, WordPress, anything. Our AI fetches the page, reads the content, and generates a draft listing with description, amenities, pricing hints, location, and all the photos."
            />
            <FaqItem
              q="What if the AI gets something wrong?"
              a="The AI saves as a draft — it doesn't publish anything automatically. After the import, you land on the edit page for each listing where you can fix the name, description, tick the right amenities, pin your exact location on the map, upload extra photos, set pricing, and add trip packages or house rules."
            />
            <FaqItem
              q="How does this compare to Airbnb or Booking.com?"
              a="Airbnb's blended take is typically 14–16% split between host and guest; Booking.com commonly charges 15–18% to the host. We charge a flat 7.5% — roughly half — with no guest-side service fee. On a KES 100,000 stay that's about KES 8,000 more in your pocket than on Airbnb or Booking.com."
            />
            <FaqItem
              q="Do I have to be exclusive?"
              a="No. Keep your Airbnb, Booking.com or FishingBooker listing as long as you want — calendar sync keeps everything in one place."
            />
            <FaqItem
              q="Once I link my Airbnb or Booking.com calendar, does it stay in sync on its own?"
              a={`Yes. After you connect an iCal feed on a listing, we re-fetch it automatically once a day and block any new dates without you doing anything. Bookings made on ${brandName} push out through your export feed the moment they're confirmed, and Airbnb / Booking.com poll that feed on their own cadence (typically every couple of hours). If a feed breaks, the listing shows a sync error on your dashboard so you can fix it. For same-day certainty before a busy weekend, hit "Sync Now" on a listing to force an immediate refresh in seconds.`}
            />
            <FaqItem
              q="Who are the guests?"
              a="A mix of Nairobi, Mombasa and Kilifi weekenders, East African expats, European beach-and-safari travellers, and sport-fishing tourists."
            />
            <FaqItem
              q="What properties or boats can I list?"
              a={`Villas, apartments, cottages, bandas, bungalows, penthouses, guest houses, sport-fishing boats, dhows, catamarans, sunset cruise boats, diving boats — if it's on or near the ${coastLabel} and you own or legally manage it, you can list it.`}
            />
            <FaqItem
              q="How do I get paid?"
              a="M-Pesa, Kenyan bank transfer (KES), or international wire (USD/EUR). Payouts are released the day after check-in — not 30 days later like some platforms."
            />
            <FaqItem
              q="Is there a minimum commitment?"
              a="None. Pause, unlist or delete your listing any time from your dashboard. You're in control."
            />
          </div>
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center lg:py-24">
        <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
          Your coast. Your guests. Your listing, your way.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600">
          Set up takes ten minutes. Your first booking could be by the weekend. Join the
          hosts already earning more and working less.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/register?role=owner"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            Create your host account
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard/import"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:border-gray-300"
          >
            Import an existing listing
          </Link>
          {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ? (
            <a
              href={`https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/[^\d]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:border-gray-300"
            >
              <MessageSquare className="h-4 w-4" />
              WhatsApp us
            </a>
          ) : (
            <a
              href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Listing on ${brandName}`)}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:border-gray-300"
            >
              <MessageSquare className="h-4 w-4" />
              Email us
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

/* -------- subcomponents -------- */

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
        {icon}
      </div>
      <h3 className="mb-2 text-base font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}

function TierRow({ listings, price }: { listings: string; price: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <dt className="text-gray-700">{listings}</dt>
      <dd className="font-semibold text-gray-900">{price}</dd>
    </div>
  );
}

function PlanBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
      <span>{children}</span>
    </li>
  );
}

function StepCard({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-bold text-teal-600">{number}</p>
      <h3
        className="mt-2 text-base font-semibold text-gray-900"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <p className="mt-2 text-sm text-gray-600">{body}</p>
    </div>
  );
}

function BenefitCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
        {icon}
      </div>
      <h3
        className="mb-2 text-base font-semibold text-gray-900"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-sm italic leading-relaxed text-gray-700">&ldquo;{quote}&rdquo;</p>
      <div className="mt-5 border-t border-gray-100 pt-4">
        <p className="text-sm font-semibold text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">{role}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-gray-900">
        {q}
        <span className="ml-4 text-gray-400 transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm text-gray-600">{a}</p>
    </details>
  );
}

function AiStep({ label, done, pending }: { label: string; done?: boolean; pending?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <Check className="h-3.5 w-3.5 text-teal-600" />
      ) : pending ? (
        <span className="inline-block h-3.5 w-3.5 animate-pulse rounded-full border-2 border-teal-600 border-t-transparent" />
      ) : (
        <span className="inline-block h-3.5 w-3.5 rounded-full border border-gray-300" />
      )}
      <span
        className={done ? 'text-gray-700 line-through decoration-gray-300' : 'text-gray-900'}
        dangerouslySetInnerHTML={{ __html: label }}
      />
    </div>
  );
}

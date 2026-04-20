import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  Waves,
  PiggyBank,
  HandshakeIcon,
  Users,
  Compass,
  ShieldCheck,
  Clock,
  Sparkles,
  CalendarCheck,
  Star,
  Check,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { STOCK_IMAGES } from "@/lib/images";
import HostEarningsCalculator from "./HostEarningsCalculator";

export const metadata: Metadata = {
  title: "Host on Watamu Bookings — Share your home, support your coast",
  description:
    "List your villa, apartment, cottage, or fishing charter on Watamu's home-grown booking platform. Lower commission than Airbnb or Booking.com, local support in Watamu, and direct relationships with your guests.",
};

/**
 * /become-a-host
 *
 * Hosts landing page — the "make or break" recruiting funnel. The flow is:
 *
 *   Hero (emotional hook) →
 *   Why list with us (three headline reasons) →
 *   Earnings calculator (concrete money) →
 *   How it works (reassurance) →
 *   Support we provide →
 *   Hosts already with us (social proof) →
 *   FAQ →
 *   Final CTA
 *
 * Brand tone: warm, Swahili-coast, proud of Watamu. The page speaks to local
 * villa owners, cottage-renters, and charter captains — people who have
 * listings elsewhere but want a platform that understands their coast.
 */

const HEADLINE_REASONS = [
  {
    icon: PiggyBank,
    title: "Keep more of what you earn",
    body: "We charge a flat 8% host service fee — a fraction of Airbnb's blended 14–16% and Booking.com's 15–18% commission. That difference goes straight back to you.",
  },
  {
    icon: HandshakeIcon,
    title: "Own the guest relationship",
    body: "You get the guest's real name, phone number, and email from the moment they book. Build a returning-guest list and take repeat bookings direct — we'll never block that.",
  },
  {
    icon: Compass,
    title: "Built for the Watamu coast",
    body: "Mida Creek, Marine Park diving, marlin season, dhow sunset sails — the platform knows the rhythms of the coast so your listing surfaces to the right traveller at the right time.",
  },
];

const SUPPORT_POINTS = [
  {
    icon: Sparkles,
    title: "Free AI-assisted import",
    body: "Paste a link to your existing Airbnb, Booking.com, FishingBooker, or your own website and we'll pre-fill your whole listing in under a minute.",
  },
  {
    icon: ShieldCheck,
    title: "Verified, reviewed guests",
    body: "Every booking runs through our ID check. Every guest can be reviewed after they leave, and hosts see each guest's booking history before confirming.",
  },
  {
    icon: CalendarCheck,
    title: "Calendar sync with every platform",
    body: "One-click iCal sync with Airbnb, Booking.com, Vrbo and Google Calendar — no more double bookings, no more manual updates.",
  },
  {
    icon: Users,
    title: "Real humans in Watamu",
    body: "Message our team on WhatsApp and speak to someone who knows your street. We're not a call centre in another time zone.",
  },
  {
    icon: Clock,
    title: "Paid out in 24 hours",
    body: "Guest payments land in your M-Pesa or Kenyan bank account the day after check-in — not 30 days later.",
  },
  {
    icon: Star,
    title: "Coastal marketing reach",
    body: "We promote Watamu as a destination — tides, Marine Park tours, fishing calendars, sunset dhow sails — so your listing is found by travellers already dreaming of this coast.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Import or build your listing",
    body: "Bring your photos and description from Airbnb, Booking.com or FishingBooker with one click, or build from scratch with our guided editor.",
  },
  {
    n: "02",
    title: "We verify ownership",
    body: "A quick human check confirms you own or manage the listing. Most hosts are approved within 24 hours.",
  },
  {
    n: "03",
    title: "Set your price and calendar",
    body: "Choose nightly or trip pricing, add seasonal rates, and sync your existing calendar in minutes.",
  },
  {
    n: "04",
    title: "Welcome your first guest",
    body: "Bookings come in, guests pay securely, and your payout lands in M-Pesa or your bank the day after check-in.",
  },
];

const FAQS = [
  {
    q: "What does it cost to list?",
    a: "Listing is free. We take a flat 8% host service fee on confirmed bookings — no monthly subscription, no sign-up charges, no cost to import your existing listing.",
  },
  {
    q: "How does this compare to Airbnb or Booking.com?",
    a: "Airbnb's blended commission is typically 14–16% split between host and guest; Booking.com commonly charges 15–18% to the host. We charge 8% total to the host and nothing hidden from the guest — most of our hosts earn 8–12% more per booking on the same nightly rate.",
  },
  {
    q: "Do I have to be exclusive?",
    a: "No. Keep your Airbnb, Booking.com or FishingBooker listing as long as you want — calendar sync keeps everything in one place. Many hosts use us alongside the big platforms and let us quietly win a larger share of their bookings over time.",
  },
  {
    q: "Who are the guests?",
    a: "A mix of Nairobi, Mombasa and Kilifi weekenders, East African expats, European beach-and-safari travellers, and sport-fishing tourists. We market to all of them through partnerships with local tour operators, dive schools and safari companies.",
  },
  {
    q: "What properties or boats can I list?",
    a: "Villas, apartments, cottages, bandas, bungalows, penthouses, guest houses, sport-fishing boats, dhows, catamarans, sunset cruise boats, diving boats — if it's on or near the Watamu coast and you own or legally manage it, you can list it.",
  },
  {
    q: "How do I get paid?",
    a: "M-Pesa, Kenyan bank transfer (KES), or international wire (USD/EUR). Payouts are released the day after check-in — not 30 days later like some platforms.",
  },
  {
    q: "Is there a minimum commitment?",
    a: "None. Pause, unlist or delete your listing any time from your dashboard. You're in control.",
  },
];

export default function BecomeAHostPage() {
  return (
    <div className="bg-white">
      {/* ─────────────────────────────  HERO  ───────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={STOCK_IMAGES.hero.tropicalBeach}
            alt="White sand and turquoise water on the Watamu coast"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-28 sm:pt-32 sm:pb-36">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-4 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 mb-6">
              <Waves className="h-3.5 w-3.5" />
              <span>Hosting on the Kenyan coast</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
              Share your piece of Watamu.
              <br />
              <span className="text-[var(--color-primary-200,#99f6e4)]">
                Keep more of what you earn.
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-white/90 leading-relaxed max-w-2xl">
              Watamu Bookings is the home-grown marketplace for villas,
              cottages, fishing boats, and sunset cruises on the Kilifi coast.
              Lower commission than Airbnb and Booking.com, direct relationships
              with your guests, and real support from people who live here too.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/auth/register?role=owner">
                <Button
                  size="lg"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  Start hosting — it&apos;s free
                </Button>
              </Link>
              <Link href="#earnings">
                <Button size="lg" variant="ghost" className="!bg-white/15 !text-white hover:!bg-white/25 backdrop-blur-sm">
                  See how much you&apos;d earn
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[var(--color-primary-200,#99f6e4)]" />
                Free to list
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[var(--color-primary-200,#99f6e4)]" />
                8% flat host fee
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[var(--color-primary-200,#99f6e4)]" />
                Paid in 24 hours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[var(--color-primary-200,#99f6e4)]" />
                M-Pesa supported
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────  HEADLINE REASONS  ─────────────────────── */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-600)] mb-3">
              Why host with us
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              The platform built for the Watamu coast —
              <br className="hidden sm:block" /> not a global brand that&apos;s never been here.
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
            {HEADLINE_REASONS.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="h-12 w-12 rounded-xl bg-[var(--color-primary-50)] text-[var(--color-primary-600)] flex items-center justify-center mb-5">
                  <r.icon className="h-6 w-6" strokeWidth={1.7} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {r.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-gray-600">
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────  EARNINGS CALCULATOR  ───────────────────── */}
      <section id="earnings" className="py-20 sm:py-24 bg-gradient-to-b from-[var(--color-primary-50,#f0fdfa)] via-white to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-600)] mb-3">
                See what you could earn
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
                The same nightly rate. More money in your pocket.
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Most Watamu hosts earn 8–12% more per booking on Watamu Bookings
                than on Airbnb or Booking.com — because we charge a flat 8% host
                fee instead of the 14–18% blended commission charged by the big
                platforms.
              </p>
              <ul className="space-y-3 text-[15px] text-gray-700">
                <li className="flex items-start gap-3">
                  <div className="mt-1 h-5 w-5 rounded-full bg-[var(--color-primary-100)] flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-[var(--color-primary-700)]" />
                  </div>
                  <span>
                    <strong className="font-semibold text-gray-900">No guest-side markup.</strong>{" "}
                    The rate you set is the rate guests see.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1 h-5 w-5 rounded-full bg-[var(--color-primary-100)] flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-[var(--color-primary-700)]" />
                  </div>
                  <span>
                    <strong className="font-semibold text-gray-900">Secure payments in KES or USD.</strong>{" "}
                    M-Pesa, card, or bank transfer — your guests choose.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1 h-5 w-5 rounded-full bg-[var(--color-primary-100)] flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-[var(--color-primary-700)]" />
                  </div>
                  <span>
                    <strong className="font-semibold text-gray-900">24-hour payouts.</strong>{" "}
                    Money in your account the day after check-in.
                  </span>
                </li>
              </ul>
            </div>

            <HostEarningsCalculator />
          </div>
        </div>
      </section>

      {/* ────────────────────────  HOW IT WORKS  ────────────────────────── */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-600)] mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              From listing to your first guest in a day.
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-gray-100 bg-gray-50/60 p-6"
              >
                <div className="text-3xl font-bold text-[var(--color-primary-500)] mb-3">
                  {s.n}
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────  SUPPORT SECTION  ──────────────────────── */}
      <section className="py-20 sm:py-24 bg-gray-50/60 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-600)] mb-3">
              What you get
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Everything a modern host needs —
              <br className="hidden sm:block" /> with the local touch of a neighbour.
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SUPPORT_POINTS.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl bg-white border border-gray-100 p-6 hover:border-[var(--color-primary-200,#99f6e4)] transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-[var(--color-primary-50)] text-[var(--color-primary-600)] flex items-center justify-center mb-4">
                  <s.icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1.5">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────  SOCIAL PROOF  ─────────────────────────── */}
      <section className="py-20 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-600)] mb-3">
              Hosts already with us
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Villa owners, charter captains, and everyone in between.
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
            <figure className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
              <div className="flex items-center gap-1 text-amber-400 mb-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="text-[15px] leading-relaxed text-gray-700 mb-5">
                &ldquo;I moved Coral Breeze Villa over from Airbnb in one
                afternoon. My payout hits M-Pesa the day after check-out and
                I&apos;ve already had two returning guests book direct.&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-700)] font-semibold flex items-center justify-center">
                  A
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Amina K.</div>
                  <div className="text-xs text-gray-500">Villa host · Watamu</div>
                </div>
              </figcaption>
            </figure>

            <figure className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
              <div className="flex items-center gap-1 text-amber-400 mb-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="text-[15px] leading-relaxed text-gray-700 mb-5">
                &ldquo;FishingBooker took 20% per charter. Watamu Bookings
                takes 8%. Same boat, same trips — I earn more and talk to my
                guests directly before they arrive.&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-700)] font-semibold flex items-center justify-center">
                  J
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Captain Juma</div>
                  <div className="text-xs text-gray-500">Sport-fishing charter · Watamu Marina</div>
                </div>
              </figcaption>
            </figure>

            <figure className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
              <div className="flex items-center gap-1 text-amber-400 mb-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="text-[15px] leading-relaxed text-gray-700 mb-5">
                &ldquo;The team is in Watamu. When a guest had a question about
                Mida Creek tides at 10pm, someone actually knew the answer.
                That&apos;s never happened with Booking.com.&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[var(--color-primary-100)] text-[var(--color-primary-700)] font-semibold flex items-center justify-center">
                  S
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Sarah M.</div>
                  <div className="text-xs text-gray-500">Cottage host · Mida Creek</div>
                </div>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ────────────────────────────  FAQ  ─────────────────────────────── */}
      <section className="py-20 sm:py-24 bg-gray-50/60 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-600)] mb-3">
              Common questions
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Everything you&apos;re probably wondering.
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((f, i) => (
              <details
                key={i}
                className="group rounded-xl bg-white border border-gray-100 px-5 py-4 open:shadow-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 list-none">
                  <h3 className="text-base font-semibold text-gray-900">
                    {f.q}
                  </h3>
                  <svg
                    className="h-5 w-5 text-gray-400 shrink-0 transition-transform group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────  FINAL CTA  ──────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={STOCK_IMAGES.hero.oceanSunset}
            alt="Warm evening light on the Watamu coast"
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/55 to-black/40" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            Your coast. Your guests.
            <br />
            Your listing, your way.
          </h2>
          <p className="mt-6 text-lg text-white/90 max-w-2xl mx-auto leading-relaxed">
            Set up takes ten minutes. Your first booking could be by the weekend.
            Join the hosts already earning more and working less.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/register?role=owner">
              <Button
                size="lg"
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Create your host account
              </Button>
            </Link>
            <Link href="/dashboard/import">
              <Button
                size="lg"
                variant="ghost"
                className="!bg-white !text-gray-900 hover:!bg-white/90"
              >
                Import an existing listing
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/70">
            Questions? WhatsApp us on{" "}
            <a href="https://wa.me/254700000000" className="text-white underline underline-offset-2">
              +254 700 000 000
            </a>
            {" "}— a real human in Watamu will reply.
          </p>
        </div>
      </section>
    </div>
  );
}

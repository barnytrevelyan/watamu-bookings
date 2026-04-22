import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { STOCK_IMAGES } from '@/lib/images';
import { getCurrentPlace } from '@/lib/places/context';

export async function generateMetadata(): Promise<Metadata> {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const placeLabel = place?.name ?? 'Kenya';
  const placeIn = place?.name ? `in ${placeLabel}, Kenya` : 'on the Kenyan coast';
  return {
    title: `About ${brandName}`,
    description: `${brandName} is a local booking platform connecting travellers with beautiful properties and world-class fishing charters ${placeIn}.`,
  };
}

export default async function AboutPage() {
  const { place, host } = await getCurrentPlace();
  const brandName = host.brand_name;
  const placeName = place?.name ?? host.brand_short;
  const hasSpecificPlace = Boolean(place?.name);
  // Copy reads naturally with a resolved place ("in Watamu"); on the
  // multi-place shell (placeName='Kwetu') we substitute "the Kenyan coast"
  // so sentences don't treat Kwetu as a geographic noun.
  const coastLabel = hasSpecificPlace ? placeName : 'the Kenyan coast';
  const supportEmail = host.support_email ?? 'hello@kwetu.ke';

  // Watamu-specific practical content (emergency numbers, getting here) is
  // only surfaced when we're on a Watamu-scoped host. Other places get a
  // generic brand/platform page until we extend wb_places with a
  // practical_json column.
  const isWatamu = placeName === 'Watamu';

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[40vh] min-h-[320px]">
        <Image
          src={STOCK_IMAGES.scenery.palmTrees}
          alt={placeName === 'Kwetu' ? 'Kenyan coastline' : `${placeName} coastline`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/30" />
        <div className="relative z-10 h-full flex items-center justify-center text-center px-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white">About {brandName}</h1>
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
          {hasSpecificPlace ? (
            <>
              <p className="text-gray-600 leading-relaxed">
                {placeName} is one of East Africa's most beautiful coastal destinations — white sand beaches,
                a UNESCO Biosphere Reserve, incredible marine life, and world-renowned deep-sea fishing.
                Yet property owners and boat captains here have long depended on international platforms
                that take large commissions and don't understand the local market.
              </p>
              <p className="mt-4 text-gray-600 leading-relaxed">
                {brandName} was built to change that. We're a local-first platform that connects
                travellers directly with {placeName}&rsquo;s best accommodation and fishing charter
                operators — with lower fees, local payment options including M-Pesa, and a focus on
                the community.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-600 leading-relaxed">
                Kenya&rsquo;s coast is one of East Africa&rsquo;s most beautiful destinations — white
                sand beaches, ancient Swahili towns, a UNESCO Biosphere Reserve, and world-renowned
                deep-sea fishing. Yet property owners and boat captains here have long depended on
                international platforms that take large commissions and don&rsquo;t understand the
                local market.
              </p>
              <p className="mt-4 text-gray-600 leading-relaxed">
                <span className="italic">Kwetu</span> means &ldquo;our home.&rdquo; {brandName} was
                built to give that feeling back — a local-first platform that connects travellers
                directly with the coast&rsquo;s best hosts and fishing charter operators, with
                lower fees, M-Pesa payments, and a focus on the community.
              </p>
            </>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">What We Offer</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Holiday Properties</h3>
              <p className="text-sm text-gray-600">
                Beachfront villas, apartments, cottages and holiday homes — all hand-vetted and
                managed by local owners who know {coastLabel} best.
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
                We're based on the Kenyan coast. If you need help before, during, or after your stay,
                we're here and we understand the area.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">For Property & Boat Owners</h2>
          <p className="text-gray-600 leading-relaxed">
            If you own a rental property or fishing boat {hasSpecificPlace ? `in ${placeName}` : 'on the Kenyan coast'}, we&rsquo;d love to have you on the
            platform. We charge a flat monthly subscription per listing — no per-booking commission,
            no guest service fee — handle payments securely, and give you a full dashboard to manage
            your listings, bookings, and reviews.
          </p>
          <p className="mt-4 text-gray-600 leading-relaxed">
            Getting started is free — create an owner account, build your listing page with photos,
            pricing, and amenities, then submit it for review. Once approved, your property or boat
            will be live and bookable on the site.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 bg-teal-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-teal-700 transition-colors"
            >
              Create Owner Account
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a
              href={`mailto:${supportEmail}`}
              className="inline-flex items-center gap-2 bg-white text-gray-700 font-semibold px-6 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Questions? Email Us
            </a>
          </div>
        </div>

        {/* Watamu-specific practical info — hidden on other place-scoped hosts */}
        {isWatamu && (
          <>
            {/* Getting Here */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Getting to Watamu</h2>
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">By Air</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Fly into Malindi Airport (MAL), just 20 minutes south of Watamu. Daily flights from Nairobi
                      Wilson (Safarilink, Fly540) and from Nairobi JKIA (Jambojet) take about 1 hour. Mombasa Moi
                      International Airport (MBA) is approximately 2 hours by road.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0H21M3.375 14.25h17.25M21 12.75V7.5a2.25 2.25 0 0 0-2.25-2.25h-7.5L8.25 2.25H3.375A2.25 2.25 0 0 0 1.125 4.5v9.75" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">By Road</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Watamu is about 105 km north of Mombasa on the coast road (B8). The drive takes around
                      2 hours. From Nairobi, it&apos;s roughly 8 hours via the Nairobi–Mombasa highway. Matatus and
                      buses run daily from Mombasa and Malindi.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Getting Around</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Watamu is a small town — most places are within tuk-tuk or boda-boda (motorbike taxi)
                      distance. Many properties and hotels can arrange airport transfers. Bicycle hire is also
                      popular for exploring the village and nearby beaches.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Contacts */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Useful Contacts</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                  <h3 className="font-semibold text-red-900 text-sm mb-2">Emergency</h3>
                  <p className="text-sm text-red-800">Kenya Police: <span className="font-mono font-semibold">999</span></p>
                  <p className="text-sm text-red-800">Ambulance: <span className="font-mono font-semibold">112</span></p>
                  <p className="text-sm text-red-800 mt-1">Watamu Police Station: <span className="font-mono font-semibold">+254 42 233 2013</span></p>
                </div>
                <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                  <h3 className="font-semibold text-blue-900 text-sm mb-2">Medical</h3>
                  <p className="text-sm text-blue-800">Watamu Hospital: <span className="font-mono font-semibold">+254 42 232 3053</span></p>
                  <p className="text-sm text-blue-800">Star Hospital Malindi: <span className="font-mono font-semibold">+254 42 213 0891</span></p>
                  <p className="text-sm text-blue-800 mt-1">Nearest decompression chamber is in Mombasa</p>
                </div>
                <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                  <h3 className="font-semibold text-green-900 text-sm mb-2">Conservation</h3>
                  <p className="text-sm text-green-800">Local Ocean Conservation: <span className="font-mono font-semibold">+254 42 233 2218</span></p>
                  <p className="text-sm text-green-800 mt-1">Report stranded turtles or marine wildlife emergencies</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                  <h3 className="font-semibold text-amber-900 text-sm mb-2">KWS Marine Park</h3>
                  <p className="text-sm text-amber-800">KWS Watamu: <span className="font-mono font-semibold">+254 42 232 0646</span></p>
                  <p className="text-sm text-amber-800 mt-1">
                    <a
                      href="https://kwspay.ecitizen.go.ke/single-park-entry/watamu-marine-park/guests"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-700 font-medium underline hover:no-underline"
                    >
                      Pay park fees online →
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="text-center pt-8 border-t border-gray-100">
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/properties"
              className="inline-block bg-[var(--color-primary-600)] text-white py-3 px-8 rounded-lg font-semibold hover:bg-[var(--color-primary-700)] transition-colors"
            >
              Browse Properties
            </Link>
            <Link
              href="/map"
              className="inline-block bg-white text-gray-700 py-3 px-8 rounded-lg font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Explore the Map
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

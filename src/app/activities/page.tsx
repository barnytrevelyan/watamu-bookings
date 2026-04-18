import Image from 'next/image';
import Link from 'next/link';
import { STOCK_IMAGES } from '@/lib/images';

const ACTIVITIES = [
  {
    id: 'deep-sea-fishing',
    title: 'Deep-Sea Fishing',
    image: STOCK_IMAGES.fishing.deepSea,
    description: `Watamu is East Africa's premier sport fishing destination and one of the world's top billfish hotspots. The deep waters of the Watamu Bank, just a few nautical miles from shore, are home to black marlin, striped marlin, sailfish, yellowfin tuna, wahoo, and dorado. The main season runs from August to March, with December and January being the peak months for marlin. Half-day and full-day charters depart from Watamu Creek and Ocean Sports. Watamu is a tag-and-release fishery — the vast majority of billfish are released alive.`,
    highlight: 'Peak season: August to March',
  },
  {
    id: 'watersports',
    title: 'Watersports',
    image: STOCK_IMAGES.fishing.kayaking,
    description: `Watamu's consistent trade winds make it one of Kenya's best spots for kite surfing, particularly from June to September and December to March. The wide, shallow lagoon at low tide provides ideal learning conditions. Stand-up paddleboarding (SUP) is popular year-round in the calm morning waters, while kayaking through the mangrove channels of Mida Creek offers a unique perspective. Jet skis, windsurfing, and wakeboarding are also available at several beach operators.`,
    highlight: 'Best kite surfing: Jun-Sep & Dec-Mar',
  },
  {
    id: 'marine-park',
    title: 'Marine Park & Snorkelling',
    image: STOCK_IMAGES.fishing.snorkeling,
    description: `The Watamu Marine National Park, established in 1968, is one of Kenya's oldest marine protected areas. It covers an area of coral reef, seagrass beds, and rocky outcrops teeming with tropical fish, sea turtles, octopus, and moray eels. Glass-bottom boat trips and guided snorkelling excursions run daily from Watamu beach and Turtle Bay. The best visibility is between October and March. Dolphins are frequently spotted, and whale sharks visit between October and February.`,
    highlight: 'Best visibility: October to March',
  },
  {
    id: 'turtle-watch',
    title: 'Turtle Watch & Conservation',
    image: STOCK_IMAGES.scenery.marinepark,
    description: `Local Ocean Conservation (formerly Watamu Turtle Watch) runs one of Kenya's most successful marine conservation programmes. Visit their centre next to Ocean Sports to learn about sea turtle rescue, rehabilitation, and release. You can observe recovering turtles in their pools and even sponsor a turtle's release back to the ocean. The organisation also runs a by-catch net release programme with local fishermen, which has freed thousands of trapped sea turtles. A must-visit for families.`,
    highlight: 'Open daily for visits and tours',
  },
  {
    id: 'mida-creek',
    title: 'Mida Creek',
    image: STOCK_IMAGES.scenery.dhow,
    description: `Mida Creek is a stunning tidal inlet bordered by ancient mangrove forests and home to an extraordinary diversity of birdlife, including flamingos, kingfishers, herons, and ospreys. Take a traditional dhow sailing trip through the creek at sunset — one of the most magical experiences in Watamu. Walk the elevated Mida Creek boardwalk through the mangroves, visit the local community project, or combine creek exploration with a crab safari. At low tide, the exposed sandbanks attract hundreds of wading birds.`,
    highlight: 'Best at sunset — take a dhow trip',
  },
  {
    id: 'places-to-eat',
    title: 'Places to Eat',
    image: STOCK_IMAGES.scenery.fishMarket,
    description: `Watamu punches well above its weight for food. Ocean Sports is the social hub — enjoy wood-fired pizza, fresh fish, and cold beers right on the beach. Pilipan is an upscale Italian-owned restaurant in the village with outstanding pasta and seafood. For the best ice cream on the Kenyan coast, visit Andrea's — a Watamu institution serving homemade Italian gelato with flavours like passion fruit and coconut. Other gems include Ascot Residence for Swahili cooking, Papa Remo for beachside grills, and Crab Shack for a rustic seafood feast on the sand.`,
    highlight: "Don't miss Andrea's Ice Cream!",
  },
];

export default function ActivitiesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-700 py-20 px-4 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Things to Do in Watamu
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            From world-class deep-sea fishing to pristine coral reefs, mangrove
            creeks, and incredible food — Watamu has it all.
          </p>
        </div>
      </section>

      {/* Activities */}
      <div className="max-w-7xl mx-auto px-4 py-16 space-y-20">
        {ACTIVITIES.map((activity, index) => (
          <section
            key={activity.id}
            id={activity.id}
            className="scroll-mt-20"
          >
            <div
              className={`flex flex-col ${
                index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
              } gap-10 items-center`}
            >
              {/* Image */}
              <div className="w-full lg:w-1/2">
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-lg">
                  <Image
                    src={activity.image}
                    alt={activity.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                  {activity.highlight && (
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow">
                      {activity.highlight}
                    </div>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="w-full lg:w-1/2">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  {activity.title}
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  {activity.description}
                </p>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Quick links nav */}
      <section className="bg-gray-50 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-lg font-semibold text-gray-900 mb-6">
            Jump to Activity
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {ACTIVITIES.map((activity) => (
              <a
                key={activity.id}
                href={`#${activity.id}`}
                className="px-4 py-2 bg-white rounded-full text-sm font-medium text-gray-700 hover:text-teal-600 hover:bg-teal-50 border border-gray-200 hover:border-teal-200 transition-colors shadow-sm"
              >
                {activity.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Experience Watamu?
          </h2>
          <p className="text-gray-600 mb-10 max-w-lg mx-auto">
            Book your accommodation and fishing charter to make the most of
            everything Watamu has to offer.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/boats"
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-lg px-8 py-3 rounded-lg transition-colors shadow-lg"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
                />
              </svg>
              Book a Fishing Charter
            </Link>
            <Link
              href="/properties"
              className="inline-flex items-center gap-2 border-2 border-teal-600 text-teal-600 hover:bg-teal-50 font-semibold text-lg px-8 py-3 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </svg>
              Browse Properties
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

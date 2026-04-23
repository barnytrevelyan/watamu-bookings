/**
 * Tiny inline knowledge base for the chatbot's `search_docs` tool.
 *
 * For Phase 1 we deliberately avoid RAG/embeddings — the corpus is small
 * enough that naive keyword scoring over a hand-curated set of snippets
 * beats the operational cost of an embedding pipeline. If this grows past
 * ~100 entries, swap this module for a pgvector table behind the same
 * interface and the rest of the bot stays unchanged.
 */

export interface DocSnippet {
  /** Short human title (shown to the user if cited). */
  title: string;
  /** Relative URL the user can visit to read more. */
  url: string;
  /** The actual content the bot sees when this snippet is retrieved. */
  body: string;
  /** Lower-cased keywords used for naive ranking. */
  keywords: string[];
}

export const DOCS: DocSnippet[] = [
  {
    title: 'How Kwetu works',
    url: '/about',
    body: `Kwetu is a Kenya-first booking platform for coastal short-lets. Guests browse
properties and fishing charters; hosts list directly and keep more of each
booking than on Airbnb or Booking.com. Kwetu charges hosts a flat 7.5%
commission — no subscription fees, no guest-facing service fee. Payments
are taken at booking time; funds are released to the host at check-in.`,
    keywords: ['how', 'works', 'about', 'kwetu', 'commission', 'fees', 'what', 'platform'],
  },
  {
    title: 'Commission and host fees',
    url: '/become-a-host',
    body: `Hosts pay a flat 7.5% commission on each confirmed booking. There is no
subscription fee, no listing fee, and no guest-facing service fee — the
price guests see is the price they pay. Hosts can see their gross and net
earnings side-by-side in the dashboard. Payouts are released at check-in
for each stay.`,
    keywords: [
      'commission',
      'fee',
      'fees',
      'cost',
      'cut',
      'percentage',
      'host',
      'payout',
      'earnings',
      '7.5',
    ],
  },
  {
    title: 'Becoming a host',
    url: '/become-a-host',
    body: `Anyone with a Kenyan coast property can list on Kwetu. Sign up, add your
property (or import it from an existing Airbnb/Booking.com listing with AI),
set a nightly price, and your listing goes live after a quick review. Each
property also gets a free subdomain mini-site (e.g. swimbo.kwetu.ke) to use
in place of a dedicated website.`,
    keywords: ['host', 'list', 'sign up', 'join', 'become', 'add property', 'listing'],
  },
  {
    title: 'Payments and cancellations',
    url: '/terms',
    body: `Guests pay the full booking price at the time of booking, via card
(Stripe) or M-Pesa. Funds are held by Kwetu and released to the host at
check-in. Cancellation policies are set by each host on their listing —
look for the cancellation policy on the property page before booking.`,
    keywords: [
      'payment',
      'pay',
      'cancel',
      'cancellation',
      'refund',
      'card',
      'mpesa',
      'm-pesa',
      'stripe',
      'deposit',
    ],
  },
  {
    title: 'Flexi pricing (last-minute discounts)',
    url: '/properties?last_minute=1',
    body: `Many Kwetu hosts run automatic last-minute discounts via our Flexi pricing
system. When a property has unsold nights close to the check-in date, the
nightly price drops on a gradient down to a host-set floor. Look for the
"last-minute deal" badge on the search results, or filter directly with
"Last-minute deals" on the Properties page.`,
    keywords: [
      'flexi',
      'last minute',
      'last-minute',
      'discount',
      'deal',
      'cheap',
      'reduced',
      'sale',
    ],
  },
  {
    title: 'Fishing charters and boat trips',
    url: '/boats',
    body: `Kwetu offers fishing charters and boat trips up and down the Kenyan coast:
half-day and full-day deep-sea fishing, sunset cruises, snorkelling trips.
Browse the boat fleet, pick a trip, and book for a specific date. Boat
listings include the boat's capacity and the trip's departure point.`,
    keywords: ['boat', 'fishing', 'charter', 'trip', 'cruise', 'sea', 'snorkel', 'deep sea'],
  },
  {
    title: 'Destinations we cover',
    url: '/',
    body: `Kwetu currently covers Watamu, Malindi, Kilifi (including Kilifi County and
Vipingo) on the Kenyan coast. More destinations launch as we onboard
more hosts. If you want to book in a location we don't yet cover, send
us a note via the contact page.`,
    keywords: [
      'where',
      'destinations',
      'watamu',
      'malindi',
      'kilifi',
      'vipingo',
      'location',
      'cover',
      'coast',
    ],
  },
  {
    title: 'Contact support',
    url: '/contact',
    body: `For any question the chatbot can't answer, or for help mid-stay, visit
the contact page. Email support typically replies within a few hours
during Kenyan working hours.`,
    keywords: ['contact', 'support', 'help', 'email', 'problem', 'issue'],
  },
  {
    title: 'Activities on the Kenyan coast',
    url: '/activities',
    body: `The coast offers kitesurfing, snorkelling in Watamu Marine Park, dolphin
watching, creek trips through Mida Creek, deep-sea fishing, and plenty of
beachside restaurants. Kwetu's Activities page is a guide to what to do
while you're here.`,
    keywords: [
      'activities',
      'things to do',
      'kitesurf',
      'snorkel',
      'dolphin',
      'creek',
      'restaurants',
      'fun',
    ],
  },
];

/**
 * Naive keyword-overlap ranker. Returns the top N snippets whose keywords
 * overlap the query. Scores are integers — the snippet with the most keyword
 * matches wins, with light boosting for title matches.
 */
export function searchDocs(query: string, limit = 3): DocSnippet[] {
  const q = query.toLowerCase();
  const tokens = q
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return [];

  const scored = DOCS.map((doc) => {
    let score = 0;
    for (const token of tokens) {
      if (doc.keywords.some((k) => k.includes(token) || token.includes(k))) score += 2;
      if (doc.title.toLowerCase().includes(token)) score += 3;
      if (doc.body.toLowerCase().includes(token)) score += 1;
    }
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.doc);
}

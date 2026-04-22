import type { SurveyDefinition } from '../types';

/**
 * Guest discovery questionnaire.
 *
 * Questions derived from §8.2 of the Kwetu planning meeting with Lynda
 * (2026-04-22). We care most about: what guests actually search for,
 * what they've been burned by, and what add-ons would genuinely make
 * them choose a local platform over the big two.
 *
 * Keep it short — guests are doing us a favour. Aim for ~8 minutes.
 */
export const guestSurvey: SurveyDefinition = {
  audience: 'guest',
  subtitle: 'Guest questionnaire',
  title: 'What would make coastal Kenya easier to book?',
  byline: 'A short questionnaire from the Kwetu founding team — Barny & Lynda.',
  intro:
    "We're building Kwetu — a Kenya-first booking platform for " +
    "beachfront stays and local experiences. Before we decide what " +
    "matters most, we'd love to hear what you actually look for when " +
    "you book a coastal place, what's gone wrong in the past, and " +
    "what would make you try something new. It should take about " +
    "8 minutes.",
  sections: [
    {
      id: 'about_you',
      title: 'A bit about you',
      fields: [
        {
          id: 'guest_origin',
          kind: 'radio',
          label: 'Where do you travel from?',
          options: [
            { value: 'kenya_resident', label: 'I live in Kenya' },
            { value: 'east_africa', label: 'Elsewhere in East Africa' },
            { value: 'uk_europe', label: 'UK / Europe' },
            { value: 'north_america', label: 'North America' },
            { value: 'other', label: 'Somewhere else', allowOther: true },
          ],
        },
        {
          id: 'guest_frequency',
          kind: 'radio',
          label: 'How often do you book a stay on the Kenyan coast?',
          options: [
            { value: 'first_time', label: 'I\u2019ve never been — considering it' },
            { value: 'rare', label: 'Once every few years' },
            { value: 'annual', label: 'Once or twice a year' },
            { value: 'regular', label: 'Multiple trips a year' },
            { value: 'local', label: 'I live on the coast and host visitors' },
          ],
        },
        {
          id: 'guest_party_type',
          kind: 'checkbox',
          label: 'Who do you usually travel with?',
          options: [
            { value: 'family', label: 'Family (kids)' },
            { value: 'couple', label: 'Partner / couple' },
            { value: 'friends', label: 'Group of friends' },
            { value: 'solo', label: 'Solo' },
            { value: 'work', label: 'For work / retreat' },
          ],
        },
      ],
    },
    {
      id: 'search_criteria',
      title: 'When you\u2019re looking for a place',
      intro: 'What actually drives your choice?',
      fields: [
        {
          id: 'must_haves',
          kind: 'checkbox',
          label: 'Which of these are must-haves for you?',
          help: 'Tick the ones that make or break a booking.',
          options: [
            { value: 'beachfront', label: 'Beachfront' },
            { value: 'sea_view', label: 'Sea view' },
            { value: 'close_to_beach', label: 'Walking distance to the beach' },
            { value: 'pool', label: 'Swimming pool' },
            { value: 'air_con', label: 'Air conditioning' },
            { value: 'wifi', label: 'Reliable wifi' },
            { value: 'generator', label: 'Backup power / generator' },
            { value: 'kitchen', label: 'Full kitchen' },
            { value: 'staff_included', label: 'House staff included' },
            { value: 'private_garden', label: 'Private garden / outdoor space' },
            { value: 'pet_friendly', label: 'Pet-friendly' },
            { value: 'family_friendly', label: 'Kid-friendly (cot, high chair, etc.)' },
            { value: 'parking', label: 'Secure parking' },
          ],
        },
        {
          id: 'search_priority',
          kind: 'radio',
          label: 'What do you look at first when comparing options?',
          options: [
            { value: 'price', label: 'Price' },
            { value: 'photos', label: 'Photos' },
            { value: 'reviews', label: 'Reviews' },
            { value: 'location', label: 'Exact location / distance to beach' },
            { value: 'host_response', label: 'How the host responds to messages' },
          ],
        },
        {
          id: 'budget_night',
          kind: 'slider',
          label: 'Typical nightly budget for the whole property (KES)',
          help: 'Ballpark — drag to give us a sense of what you\u2019d spend.',
          min: 5000,
          max: 80000,
          step: 1000,
          unit: ' KES',
        },
        {
          id: 'currency_pref',
          kind: 'radio',
          label: 'Which currency do you prefer to see prices in?',
          options: [
            { value: 'kes', label: 'Kenyan Shillings (KES)' },
            { value: 'usd', label: 'US Dollars (USD)' },
            { value: 'gbp', label: 'GB Pounds (GBP)' },
            { value: 'eur', label: 'Euros (EUR)' },
            { value: 'either', label: 'Either — show me both' },
          ],
        },
      ],
    },
    {
      id: 'frustrations',
      title: 'What\u2019s gone wrong before?',
      intro:
        "Be honest — we want to fix the annoyances the big platforms shrug off.",
      fields: [
        {
          id: 'past_frustrations',
          kind: 'checkbox',
          label: 'Have any of these happened to you?',
          options: [
            { value: 'key_box_no_instructions', label: 'Arriving at a key box with no real instructions' },
            { value: 'no_local_support', label: 'No local person to call when something went wrong' },
            { value: 'listing_misleading', label: 'The listing was misleading (photos, location, amenities)' },
            { value: 'no_room_servicing', label: 'No room servicing / cleaning during the stay' },
            { value: 'power_water_no_backup', label: 'Power or water went out with no backup' },
            { value: 'host_unresponsive', label: 'Host went silent mid-stay' },
            { value: 'refund_refused', label: 'Platform refused a fair refund' },
            { value: 'hidden_fees', label: 'Surprise fees at checkout' },
            { value: 'dispute_painful', label: 'Dispute process was painful' },
            { value: 'fake_listing', label: 'Turned up to find the listing didn\u2019t exist' },
            { value: 'other', label: 'Something else', allowOther: true },
          ],
        },
        {
          id: 'frustration_story',
          kind: 'longtext',
          label: 'A specific bad experience — what happened?',
          placeholder: 'Optional — but stories help us design the fix.',
        },
      ],
    },
    {
      id: 'local_platform',
      title: 'Would you pick a local platform over Airbnb?',
      fields: [
        {
          id: 'local_appeal',
          kind: 'scale',
          label: 'How appealing is a Kenya-first platform run by people you can actually call?',
          scaleLow: 'Not really',
          scaleHigh: 'Very',
        },
        {
          id: 'airbnb_trust',
          kind: 'scale',
          label: 'How much does Airbnb\u2019s brand make you trust a listing?',
          scaleLow: 'Doesn\u2019t matter',
          scaleHigh: 'Critical',
        },
        {
          id: 'switch_drivers',
          kind: 'checkbox',
          label: 'Which of these would actually make you book on Kwetu instead of Airbnb?',
          options: [
            { value: 'price', label: 'A lower total price' },
            { value: 'local_support', label: 'A real person on the phone, in the country' },
            { value: 'whatsapp_host', label: 'Being able to message the host on WhatsApp' },
            { value: 'addon_bundle', label: 'Bundled add-ons (chef, transfers, fishing, etc.)' },
            { value: 'curated', label: 'A curated set of properties, no scams' },
            { value: 'richer_info', label: 'Richer local info — what\u2019s on, what\u2019s nearby, who\u2019s the host' },
            { value: 'fair_refunds', label: 'Fair, sensible refund handling (not pointlessly punitive either way)' },
            { value: 'better_search', label: 'Smarter search (distance to beach in metres, sea view, etc.)' },
            { value: 'other', label: 'Something else', allowOther: true },
          ],
        },
        {
          id: 'switch_free_text',
          kind: 'longtext',
          label: 'Anything else that would swing it?',
          placeholder: 'Optional.',
        },
      ],
    },
    {
      id: 'addons',
      title: 'Add-ons for your stay',
      intro:
        'Beyond the stay itself — what would you happily book through the same platform?',
      fields: [
        {
          id: 'addons_interest',
          kind: 'checkbox',
          label: 'Which of these would you actually use?',
          options: [
            { value: 'chef', label: 'Private chef (with menu + allergy form)' },
            { value: 'transfers', label: 'Airport transfers / taxis' },
            { value: 'fishing', label: 'Fishing charters (half / full day / sunset)' },
            { value: 'kitesurf', label: 'Kitesurfing lessons' },
            { value: 'snorkel_creek', label: 'Snorkelling / creek trips' },
            { value: 'kws_fees', label: 'Marine park / KWS fees' },
            { value: 'restaurant', label: 'Restaurant booking for arrival night' },
            { value: 'house_staff', label: 'House staff (ayah, extra help)' },
            { value: 'car_hire', label: 'Car hire' },
            { value: 'guide', label: 'Local guide for day trips' },
            { value: 'nothing', label: 'Nothing — just the stay, please' },
            { value: 'other', label: 'Something else', allowOther: true },
          ],
        },
        {
          id: 'chef_interest',
          kind: 'scale',
          label: 'How interested would you be in a private chef with a proper food / allergy form?',
          scaleLow: 'Not at all',
          scaleHigh: 'Very',
        },
      ],
    },
    {
      id: 'communication',
      title: 'Talking to the host and to us',
      fields: [
        {
          id: 'preferred_channel',
          kind: 'radio',
          label: 'How do you prefer to contact a host before a stay?',
          options: [
            { value: 'in_platform', label: 'In-platform messages' },
            { value: 'email', label: 'Email' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'phone', label: 'Phone call' },
            { value: 'mixed', label: 'Whichever is easiest at the time' },
          ],
        },
        {
          id: 'negotiation_appetite',
          kind: 'radio',
          label: 'Would you make an offer ("I have X for Y nights — would you accept?") if the platform allowed it?',
          options: [
            { value: 'yes', label: 'Yes, happily' },
            { value: 'maybe', label: 'Maybe on a longer stay' },
            { value: 'no', label: 'No — I\u2019d rather see a fixed price' },
          ],
        },
      ],
    },
    {
      id: 'closing',
      title: 'Anything else?',
      fields: [
        {
          id: 'anything_else',
          kind: 'longtext',
          label: 'What haven\u2019t we asked that we should have?',
          placeholder: 'Optional — all suggestions welcome.',
        },
        {
          id: 'follow_up_ok',
          kind: 'radio',
          label: 'Happy for us to email you when Kwetu is open for bookings?',
          options: [
            { value: 'yes', label: 'Yes, please' },
            { value: 'no', label: 'No thanks' },
          ],
        },
      ],
    },
  ],
  thankYou: {
    title: 'Thank you',
    body:
      'We\u2019ve got your answers — this will directly shape what Kwetu looks like when we open for bookings. Karibu sana.',
  },
};

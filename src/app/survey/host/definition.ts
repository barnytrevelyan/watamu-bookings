import type { SurveyDefinition } from '../types';

/**
 * Host discovery questionnaire.
 *
 * Questions derived directly from §8.1 of the Kwetu planning meeting
 * with Lynda (2026-04-22). Expanded to capture the specific pain
 * points that came up in the conversation — Super Host pressure,
 * dispute handling, communication restrictions, refund bias — so we
 * can hear how widely shared those frustrations are before baking
 * policy around them.
 *
 * Keep total completion time under ~15 minutes. Everything optional
 * except the 2-3 answers we genuinely need to cluster responses.
 */
export const hostSurvey: SurveyDefinition = {
  audience: 'host',
  subtitle: 'Host questionnaire',
  title: 'What would make a better booking platform for you?',
  byline: 'A 10-15 minute questionnaire from the Kwetu founding team — Barny & Lynda.',
  intro:
    "We're building Kwetu — a Kenya-first short-let booking platform " +
    "designed to treat hosts as partners rather than suppliers. Before " +
    "we lock the feature set, we want to hear directly from hosts: " +
    "what the big platforms get wrong, what they get right, and what " +
    "would genuinely move you across. Your answers stay with the " +
    "founding team.",
  sections: [
    {
      id: 'about_you',
      title: 'About you and your listings',
      intro:
        'A quick picture of where you host and what you host — so we can weight responses by context.',
      fields: [
        {
          id: 'host_area',
          kind: 'checkbox',
          label: 'Where are your listings based?',
          required: true,
          options: [
            { value: 'watamu', label: 'Watamu' },
            { value: 'kilifi', label: 'Kilifi' },
            { value: 'malindi', label: 'Malindi' },
            { value: 'diani', label: 'Diani' },
            { value: 'lamu', label: 'Lamu' },
            { value: 'mombasa', label: 'Mombasa' },
            { value: 'nairobi', label: 'Nairobi' },
            { value: 'other', label: 'Somewhere else', allowOther: true },
          ],
        },
        {
          id: 'host_listing_count',
          kind: 'radio',
          label: 'How many properties do you currently let?',
          options: [
            { value: '1', label: 'Just the one' },
            { value: '2-3', label: '2 - 3' },
            { value: '4-10', label: '4 - 10' },
            { value: '10+', label: 'More than 10' },
          ],
        },
        {
          id: 'host_platforms',
          kind: 'checkbox',
          label: 'Where do you currently take bookings?',
          help: 'Tick all that apply.',
          options: [
            { value: 'airbnb', label: 'Airbnb' },
            { value: 'bookingcom', label: 'Booking.com' },
            { value: 'vrbo', label: 'VRBO / HomeAway' },
            { value: 'own_site', label: 'My own website' },
            { value: 'whatsapp', label: 'WhatsApp / direct message' },
            { value: 'agent', label: 'A local agent' },
            { value: 'word_of_mouth', label: 'Word of mouth / repeat guests' },
            { value: 'other', label: 'Other', allowOther: true },
          ],
        },
        {
          id: 'host_occupancy',
          kind: 'radio',
          label: 'Roughly how full are you in a typical month (high season)?',
          options: [
            { value: 'under_25', label: 'Under 25% booked' },
            { value: '25_50', label: '25 - 50%' },
            { value: '50_75', label: '50 - 75%' },
            { value: '75_plus', label: 'Over 75%' },
          ],
        },
      ],
    },
    {
      id: 'frustrations',
      title: 'What frustrates you about the big platforms?',
      intro:
        'Be as blunt as you like — these are the things Kwetu has to answer if we want you to list with us.',
      fields: [
        {
          id: 'frustrations_pick',
          kind: 'checkbox',
          label: 'Which of these frustrate you on Airbnb / Booking.com?',
          help: 'Tick any that ring true.',
          options: [
            { value: 'commission_high', label: 'Commission / fees are too high' },
            { value: 'refund_guest_biased', label: 'Refund policies favour guests, even when the issue isn\u2019t the host\u2019s fault' },
            { value: 'dispute_process', label: 'Dispute resolution feels punitive' },
            { value: 'superhost_pressure', label: 'Super Host / status pressure' },
            { value: 'comms_blocked', label: 'Can\u2019t share phone numbers or WhatsApp with guests' },
            { value: 'impersonal_support', label: 'Impersonal, ticket-queue support' },
            { value: 'slow_payouts', label: 'Slow payouts' },
            { value: 'no_local_context', label: 'Listings feel impersonal — no local context for the guest' },
            { value: 'algo_opaque', label: 'Search ranking / algorithm feels opaque' },
            { value: 'off_platform_penalty', label: 'Penalised for any off-platform bookings' },
            { value: 'other', label: 'Something else', allowOther: true },
          ],
        },
        {
          id: 'frustration_story',
          kind: 'longtext',
          label: 'A specific bad experience, if one comes to mind.',
          help: 'A story is worth more than a checklist — tell us what actually happened.',
          placeholder: 'e.g. "A guest got USD 96 back for a one-night AC issue that had been resolved…"',
        },
        {
          id: 'dispute_frequency',
          kind: 'scale',
          label: 'How often do platform disputes go against you unfairly?',
          scaleLow: 'Almost never',
          scaleHigh: 'Frequently',
        },
      ],
    },
    {
      id: 'loves',
      title: 'What do the big platforms get right?',
      intro:
        "We don't want to throw out what's working — what should we keep?",
      fields: [
        {
          id: 'loves_pick',
          kind: 'checkbox',
          label: 'What do you genuinely like about Airbnb or Booking.com?',
          options: [
            { value: 'guest_volume', label: 'Guest volume / reach' },
            { value: 'instant_book', label: 'Instant-booking flow' },
            { value: 'trust_signals', label: 'Guest reviews and trust signals' },
            { value: 'global_brand', label: 'Globally recognised brand' },
            { value: 'calendar_tools', label: 'Calendar / pricing tools' },
            { value: 'messaging_inbox', label: 'Messaging inbox' },
            { value: 'payouts_secure', label: 'Payouts feel secure once they arrive' },
            { value: 'nothing', label: 'Honestly? Not much' },
            { value: 'other', label: 'Something else', allowOther: true },
          ],
        },
        {
          id: 'loves_free_text',
          kind: 'longtext',
          label: 'Anything a new platform would be stupid to lose?',
          placeholder: 'Optional — whatever comes to mind.',
        },
      ],
    },
    {
      id: 'wants',
      title: 'What would you want from Kwetu?',
      intro:
        "A few ideas we've been kicking around — tell us which of them would actually make a difference.",
      fields: [
        {
          id: 'wants_features',
          kind: 'checkbox',
          label: 'Which of these would you actually use?',
          help: 'Tick all that apply.',
          options: [
            { value: 'relationship_manager', label: 'A real person I can call when something goes wrong' },
            { value: 'own_subdomain', label: 'A free mini-site for my property (e.g. mylisting.kwetu.ke)' },
            { value: 'gross_net_transparency', label: 'Gross vs net transparency — see what I really earn after fees' },
            { value: 'ai_import', label: 'AI-assisted import from my existing Airbnb / Booking.com listing' },
            { value: 'calendar_sync', label: 'Two-way calendar sync (ICS) with other platforms' },
            { value: 'last_minute_pricing', label: 'Automated last-minute discount suggestions' },
            { value: 'addons_marketplace', label: 'Add-ons guests can book alongside the stay (chef, transfers, fishing, watersports)' },
            { value: 'monthly_analytics', label: 'Monthly performance emails — views, conversion, benchmarks' },
            { value: 'whatsapp_comms', label: 'Direct WhatsApp-style messaging with guests, no keyword blocks' },
            { value: 'two_way_ratings', label: 'Two-way ratings — hosts can rate guests too' },
            { value: 'no_superhost', label: 'No "Super Host" status game' },
            { value: 'host_friendly_refunds', label: 'Host-friendly refund policy for things outside your control' },
            { value: 'price_match', label: 'Guest-side "price match" requests we can accept or decline' },
          ],
        },
        {
          id: 'wants_free_text',
          kind: 'longtext',
          label: 'Anything missing from that list?',
          placeholder: 'Optional — what would make you switch in a heartbeat?',
        },
        {
          id: 'addons_interest',
          kind: 'checkbox',
          label: 'Add-ons guests could book through Kwetu — which would you actually sell?',
          help: 'We take a small commission on each; hosts earn a cut where they\u2019re part of the delivery.',
          options: [
            { value: 'chef', label: 'Private chef' },
            { value: 'transfers', label: 'Airport transfers / taxis' },
            { value: 'fishing', label: 'Fishing charters' },
            { value: 'watersports', label: 'Kitesurfing / wakeboarding' },
            { value: 'snorkel_creek', label: 'Snorkelling / creek trips' },
            { value: 'kws_fees', label: 'KWS / marine park fees' },
            { value: 'restaurant', label: 'Restaurant booking for arrival night' },
            { value: 'house_staff', label: 'House staff (ayah, extra help)' },
            { value: 'none', label: 'None — keep it simple, just the stay' },
            { value: 'other', label: 'Something else', allowOther: true },
          ],
        },
      ],
    },
    {
      id: 'commission',
      title: 'Commission',
      intro:
        'Airbnb charges hosts around 15% and Booking.com around 16%. We want to be materially cheaper.',
      fields: [
        {
          id: 'commission_current',
          kind: 'longtext',
          label: 'Roughly what commission are you paying today on each platform?',
          placeholder: 'e.g. Airbnb 15%, Booking.com 17%, own site 0%',
        },
        {
          id: 'commission_move',
          kind: 'slider',
          label: 'What commission rate would genuinely move you across?',
          help: '7.5% is the rate we\u2019re modelling — drag to tell us where your line is.',
          min: 0,
          max: 20,
          step: 0.5,
          unit: '%',
        },
        {
          id: 'commission_savings_split',
          kind: 'radio',
          label: 'If we saved you commission vs Airbnb, what would you do with the saving?',
          options: [
            { value: 'keep_all', label: 'Keep it all — I\u2019m underpaid for the work I do' },
            { value: 'split_50_50', label: 'Split it — pass some to the guest as a lower price' },
            { value: 'pass_to_guest', label: 'Pass most of it to the guest to drive bookings' },
            { value: 'not_sure', label: 'Haven\u2019t thought about it' },
          ],
        },
      ],
    },
    {
      id: 'brand_vs_service',
      title: 'Brand trust vs local service',
      fields: [
        {
          id: 'brand_importance',
          kind: 'scale',
          label: 'How important is the Airbnb / Booking.com brand name to your guests?',
          scaleLow: 'Doesn\u2019t matter',
          scaleHigh: 'Critical',
        },
        {
          id: 'local_service_importance',
          kind: 'scale',
          label: 'How important is a warm, local human on the other end of the phone?',
          scaleLow: 'Doesn\u2019t matter',
          scaleHigh: 'Critical',
        },
        {
          id: 'exclusivity_worry',
          kind: 'radio',
          label: 'Would you list with us even if you kept your Airbnb / Booking.com listings?',
          options: [
            { value: 'yes', label: 'Yes — I\u2019d happily list in parallel' },
            { value: 'maybe', label: 'Maybe — depends on the commission and the reach' },
            { value: 'no', label: 'No — I\u2019d want to see real traffic before moving' },
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
          label: "What haven't we asked that we should have?",
          placeholder: 'Optional — rant, suggestion, story, all welcome.',
        },
        {
          id: 'follow_up_ok',
          kind: 'radio',
          label: 'Happy for us to follow up with a call or WhatsApp?',
          options: [
            { value: 'yes', label: 'Yes, please' },
            { value: 'maybe', label: 'Maybe — once you have a prototype' },
            { value: 'no', label: 'No thanks' },
          ],
        },
      ],
    },
  ],
  thankYou: {
    title: 'Thank you',
    body:
      'We\u2019ve got your answers. Lynda and Barny read every response personally — if you left contact details, expect to hear from one of us in the next week or two.',
  },
};

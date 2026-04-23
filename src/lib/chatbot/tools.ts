/**
 * Tool schemas surfaced to Claude for the site chatbot.
 *
 * Schemas are deliberately tight — the narrower the tool, the less the model
 * has to guess, and the easier it is to audit what the bot can and cannot do.
 *
 * Phase 1 scope (guest-facing, read-only):
 *   - search_listings     list stays + boat trips matching filters
 *   - get_listing         full detail for a single property or boat
 *   - check_availability  are these dates bookable
 *   - get_price           what would this booking actually cost
 *   - search_docs         FAQ / policy / how-it-works knowledge base
 *
 * Host-facing tools land in Phase 2. Booking mutation is explicitly out of
 * scope — the bot hands off to the existing booking flow for anything
 * transactional.
 */

import type Anthropic from '@anthropic-ai/sdk';

// The SDK's Tool type is resolved by name rather than imported directly to
// keep this module free of deep SDK internals. The shape is standard
// JSON Schema plus `name` and `description`.
export type ChatTool = Anthropic.Messages.Tool;

export const TOOLS: ChatTool[] = [
  {
    name: 'search_listings',
    description:
      'Search Kwetu for stays (properties) or fishing/boat trips. Use when the user asks about availability, places to stay, boats to hire, etc. Always prefer this over making up facts. Returns up to 8 matches plus a canonical URL the user can visit to see all results.',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['property', 'boat'],
          description:
            'What to search for. "property" for stays (villas, apartments, houses). "boat" for fishing charters and boat trips.',
        },
        place: {
          type: 'string',
          description:
            'Place slug: one of "watamu", "malindi", "kilifi", "kilifi-county", "vipingo". Leave unset to search the entire Kenyan coast.',
        },
        check_in: {
          type: 'string',
          description:
            'Check-in date in YYYY-MM-DD format. Optional — if omitted the search ignores date-based availability.',
        },
        check_out: {
          type: 'string',
          description:
            'Check-out date in YYYY-MM-DD format. Required when check_in is set. For boats, use the trip date here too.',
        },
        guests: {
          type: 'number',
          description: 'Minimum number of guests the listing must accommodate.',
        },
        bedrooms_min: {
          type: 'number',
          description: 'Minimum number of bedrooms (property search only).',
        },
        max_price_kes: {
          type: 'number',
          description:
            'Maximum price per night in Kenyan shillings (property) or per trip (boat). Omit for no cap.',
        },
        amenities: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Amenity names the property must have, e.g. ["pool", "beachfront", "wifi"]. Only supported for property search. Match is case-insensitive and lenient.',
        },
        last_minute_only: {
          type: 'boolean',
          description:
            'Restrict to properties currently offering a last-minute (flexi) discount. Defaults to false.',
        },
      },
      required: ['kind'],
    },
  },
  {
    name: 'get_listing',
    description:
      'Fetch full detail for one specific listing by slug. Use after search_listings when the user asks a follow-up ("tell me more about…", "does it have a pool?", "how many bedrooms?").',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['property', 'boat'],
          description: 'Whether this is a property or a boat listing.',
        },
        slug: {
          type: 'string',
          description: 'The listing slug (from the URL, e.g. "swimbo" in /properties/swimbo).',
        },
      },
      required: ['kind', 'slug'],
    },
  },
  {
    name: 'check_availability',
    description:
      'Confirm whether a specific property or boat is actually available for specific dates. Use when the user asks "is it free on…" or "can I book it for…". Takes either a property slug + check_in/check_out, or a boat slug + trip_date.',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['property', 'boat'],
        },
        slug: {
          type: 'string',
          description: 'Listing slug from the URL.',
        },
        check_in: {
          type: 'string',
          description: 'YYYY-MM-DD. Required for properties.',
        },
        check_out: {
          type: 'string',
          description: 'YYYY-MM-DD. Required for properties.',
        },
        trip_date: {
          type: 'string',
          description: 'YYYY-MM-DD. Required for boats.',
        },
      },
      required: ['kind', 'slug'],
    },
  },
  {
    name: 'get_price',
    description:
      'Compute the actual price for a specific booking, including flexi (last-minute) discounts and cleaning fees where applicable. Use when the user asks "how much", "what would it cost", etc.',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['property', 'boat'],
        },
        slug: {
          type: 'string',
          description: 'Listing slug from the URL.',
        },
        check_in: {
          type: 'string',
          description: 'YYYY-MM-DD. Required for properties.',
        },
        check_out: {
          type: 'string',
          description: 'YYYY-MM-DD. Required for properties.',
        },
        trip_date: {
          type: 'string',
          description: 'YYYY-MM-DD. Required for boats.',
        },
      },
      required: ['kind', 'slug'],
    },
  },
  {
    name: 'search_docs',
    description:
      'Search Kwetu\'s help/FAQ corpus for answers to general questions: how Kwetu works, commissions, cancellation, payments, how to become a host, etc. Prefer this over answering from your own memory when the user asks anything policy-shaped.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The question or topic to look up, in natural language.',
        },
      },
      required: ['query'],
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);

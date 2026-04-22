# Discovery surveys — where the data lives and how to read it

Two questionnaires — `/survey/host` and `/survey/guest` — collect research
responses from prospective hosts and guests before launch. Questions are
driven by the Lynda planning meeting (minutes §8.1 + §8.2, 2026-04-22).

## Storage

**Database:** Supabase project `jiyoxdeiyydyxjymahrh`, table `wb_survey_responses`.

Schema (`supabase/migrations/20260422_survey_responses.sql`):

| Column          | Type                     | Notes                                       |
| --------------- | ------------------------ | ------------------------------------------- |
| `id`            | `uuid` PK                | Default `gen_random_uuid()`                 |
| `audience`      | `text`                   | `'host'` or `'guest'`                       |
| `contact_name`  | `text` nullable          | Optional — not required to submit           |
| `contact_email` | `text` nullable          | Optional                                    |
| `contact_phone` | `text` nullable          | Optional (WhatsApp / phone)                 |
| `answers`       | `jsonb`                  | Full questionnaire payload, keys = field ID |
| `meta`          | `jsonb`                  | UA, referer, accept-language                |
| `submitted_at`  | `timestamptz` default `now()` |                                        |

Indexes: `(audience, submitted_at desc)` and `(contact_email)`.

**RLS:** enabled, **no public policies**. Nothing is readable or writable from
the anon/authed browser clients. All reads/writes go through the service
role only.

## Write path

- Client: `src/app/survey/SurveyForm.tsx` (single-page renderer used by both
  audiences).
- Server: `src/app/api/survey/route.ts` — `POST` endpoint that validates
  audience, trims the contact fields, attaches `meta`, and inserts via
  `createClient()` from `src/lib/supabase/admin.ts` (service-role).
- Definitions: `src/app/survey/host/definition.ts` and
  `src/app/survey/guest/definition.ts` — edit these to change questions.
  Shape: `SurveyDefinition` in `src/app/survey/types.ts`.

The `/survey/*` pages render on a bare shell (no nav, no footer) so
respondents don't wander off into the main site mid-form. That's handled
by the `x-wb-path` header set in `src/middleware.ts` and read in
`src/app/layout.tsx` — when the path starts with `/survey`, Navbar +
Footer are skipped.

## Read path

### Option 1 — Admin UI (primary)

Sign in with an admin role, then go to `/admin/surveys` (also reachable
from the Admin sidebar → "Surveys"). Features:

- Host / Guest filter pills + counts.
- Each response collapsible; questions auto-labelled by looking up the
  field ID in the definition (so renamed labels don't break old rows).
- `mailto:` link on each contact email.
- URL params: `?audience=host` or `?audience=guest`.

Source: `src/app/admin/surveys/page.tsx` — service-role fetch, dynamic
rendering (`force-dynamic`) so new responses show immediately.

Access gate is in `src/app/admin/layout.tsx`: must be authenticated and
`wb_profiles.role === 'admin'`.

### Option 2 — Supabase dashboard

Table Editor → `wb_survey_responses`. For a quick export:

```sql
select
  audience,
  contact_name,
  contact_email,
  contact_phone,
  submitted_at,
  answers
from wb_survey_responses
order by submitted_at desc;
```

CSV download is in the top-right of the query result panel.

### Option 3 — ad-hoc analysis

The `answers` JSONB means you can aggregate any single question without
touching the schema, e.g.:

```sql
-- What fraction of hosts would accept an offer-style booking?
select
  answers->>'offer_appetite' as answer,
  count(*)
from wb_survey_responses
where audience = 'host'
group by 1
order by 2 desc;
```

## Changing the questions

1. Edit the relevant `definition.ts` (new field, new option, new section).
2. Keep field `id`s stable where possible — old rows reference them; changing
   an `id` breaks the label lookup on `/admin/surveys` for past responses.
3. No migration needed — answers are JSONB.

## Form URLs (share these)

- Hosts: https://kwetu.ke/survey/host
- Guests: https://kwetu.ke/survey/guest

Both have `robots: noindex, nofollow` — they won't show up in search.

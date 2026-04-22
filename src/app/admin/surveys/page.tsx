import { createClient } from '@/lib/supabase/admin';
import { hostSurvey } from '@/app/survey/host/definition';
import { guestSurvey } from '@/app/survey/guest/definition';
import type { FieldDef, SurveyDefinition } from '@/app/survey/types';
import Link from 'next/link';

// Always fetch fresh — new survey responses should show up immediately.
export const dynamic = 'force-dynamic';

interface SurveyRow {
  id: string;
  audience: 'host' | 'guest';
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  answers: Record<string, unknown>;
  meta: Record<string, unknown>;
  submitted_at: string;
}

export default async function SurveysAdminPage({
  searchParams,
}: {
  searchParams?: { audience?: string };
}) {
  const audienceFilter =
    searchParams?.audience === 'host' || searchParams?.audience === 'guest'
      ? searchParams.audience
      : null;

  // Service-role client — the table has RLS on with no public policy,
  // so we intentionally bypass it here. The admin layout has already
  // gated access on role === 'admin'.
  const supabase = createClient();
  let query = supabase
    .from('wb_survey_responses')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(500);
  if (audienceFilter) query = query.eq('audience', audienceFilter);
  const { data, error } = await query;

  const rows = (data ?? []) as SurveyRow[];
  const hostCount = rows.filter((r) => r.audience === 'host').length;
  const guestCount = rows.filter((r) => r.audience === 'guest').length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Survey responses</h1>
          <p className="mt-1 text-sm text-gray-600">
            Host &amp; guest discovery questionnaires.{' '}
            <Link href="/survey/host" className="text-teal-700 underline">
              Host form
            </Link>
            {' \u00B7 '}
            <Link href="/survey/guest" className="text-teal-700 underline">
              Guest form
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <FilterPill label="All" count={rows.length} href="/admin/surveys" active={!audienceFilter} />
          <FilterPill
            label="Hosts"
            count={audienceFilter === null ? hostCount : hostCount}
            href="/admin/surveys?audience=host"
            active={audienceFilter === 'host'}
          />
          <FilterPill
            label="Guests"
            count={audienceFilter === null ? guestCount : guestCount}
            href="/admin/surveys?audience=guest"
            active={audienceFilter === 'guest'}
          />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load responses: {error.message}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-600">
            No responses yet. Share the form links to collect your first
            responses.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <ResponseCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  count,
  href,
  active,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        'rounded-full px-3 py-1 text-xs font-medium transition ' +
        (active
          ? 'bg-gray-900 text-white'
          : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300')
      }
    >
      {label}
      <span className={active ? 'ml-2 text-gray-300' : 'ml-2 text-gray-400'}>
        {count}
      </span>
    </Link>
  );
}

function ResponseCard({ row }: { row: SurveyRow }) {
  const def: SurveyDefinition = row.audience === 'host' ? hostSurvey : guestSurvey;
  const fieldIndex = new Map<string, FieldDef>();
  for (const section of def.sections) {
    for (const field of section.fields) fieldIndex.set(field.id, field);
  }

  const submittedLocal = new Date(row.submitted_at).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <details className="group rounded-2xl border border-gray-200 bg-white p-5 open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={
                'rounded-full px-2 py-0.5 text-xs font-semibold ' +
                (row.audience === 'host'
                  ? 'bg-teal-50 text-teal-800'
                  : 'bg-amber-50 text-amber-800')
              }
            >
              {row.audience}
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">
              {row.contact_name || 'Anonymous'}
            </span>
            {row.contact_email && (
              <a
                href={`mailto:${row.contact_email}`}
                className="truncate text-xs text-teal-700 underline"
              >
                {row.contact_email}
              </a>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{submittedLocal}</p>
        </div>
        <span className="text-xs text-gray-400 group-open:hidden">Expand</span>
        <span className="hidden text-xs text-gray-400 group-open:inline">Collapse</span>
      </summary>

      <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 text-sm">
        {Object.entries(row.answers).map(([key, value]) => {
          const field = fieldIndex.get(key);
          const label = field?.label ?? humanise(key);
          return (
            <div key={key} className="grid gap-1 sm:grid-cols-[1fr_2fr] sm:gap-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {label}
              </div>
              <div className="text-gray-900">{renderAnswer(field, value)}</div>
            </div>
          );
        })}
        {row.contact_phone && (
          <div className="grid gap-1 sm:grid-cols-[1fr_2fr] sm:gap-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Phone / WhatsApp
            </div>
            <div className="text-gray-900">{row.contact_phone}</div>
          </div>
        )}
      </div>
    </details>
  );
}

function renderAnswer(field: FieldDef | undefined, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">—</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400">—</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span
            key={String(v)}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800"
          >
            {labelFor(field, String(v))}
          </span>
        ))}
      </div>
    );
  }
  if (typeof value === 'number') {
    const unit = field?.unit ?? '';
    return (
      <span>
        {value}
        {unit}
      </span>
    );
  }
  return <span className="whitespace-pre-wrap">{labelFor(field, String(value))}</span>;
}

function labelFor(field: FieldDef | undefined, raw: string): string {
  if (!field?.options) return raw;
  const opt = field.options.find((o) => o.value === raw);
  return opt ? opt.label : raw;
}

function humanise(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

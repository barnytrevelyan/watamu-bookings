'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { AnswerMap, AnswerValue, FieldDef, SurveyDefinition } from './types';

/**
 * Single-page survey renderer. The whole form is on one scrollable
 * page rather than a wizard — respondent count will be small (coastal
 * network), and a wizard adds friction with no upside for us. We
 * validate only `required` fields on submit.
 *
 * This component is deliberately self-contained: it doesn't import
 * anything from the main site so the /survey pages can stay clean
 * even if the surrounding Kwetu UI changes.
 */
export default function SurveyForm({ def }: { def: SurveyDefinition }) {
  const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(def));
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const allFields = useMemo(
    () => def.sections.flatMap((s) => s.fields),
    [def]
  );

  function updateAnswer(id: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleCheckbox(id: string, value: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [id]: next };
    });
  }

  function validate(): string | null {
    for (const field of allFields) {
      if (!field.required) continue;
      const val = answers[field.id];
      const missing =
        val === null ||
        val === undefined ||
        (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0);
      if (missing) {
        return `Please answer: ${field.label}`;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setStatus('error');
      setErrorMsg(validationError);
      return;
    }
    setStatus('submitting');
    setErrorMsg(null);

    // Stitch the free-text "Other: …" responses back onto the main
    // answer payload so the inbox view doesn't need special handling.
    const answersToSend: AnswerMap = { ...answers };
    for (const [key, text] of Object.entries(otherText)) {
      if (text.trim()) answersToSend[`${key}__other`] = text.trim();
    }

    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: def.audience,
          contact,
          answers: answersToSend,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save your response.');
      }
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  if (status === 'done') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-teal-600" />
        <h1 className="mt-4 text-3xl font-bold text-gray-900">{def.thankYou.title}</h1>
        <p className="mt-3 text-gray-600 leading-relaxed">{def.thankYou.body}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      {/* ---- Heading ---- */}
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-600">
          {def.subtitle}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
          {def.title}
        </h1>
        {def.byline && (
          <p className="mt-2 text-sm text-gray-500">{def.byline}</p>
        )}
        <p className="mt-5 text-gray-700 leading-relaxed">{def.intro}</p>
      </header>

      {def.sections.map((section, i) => (
        <section
          key={section.id}
          className="mb-10 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-gray-900">
            <span className="mr-3 inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-sm font-semibold text-teal-700 align-middle">
              {i + 1}
            </span>
            {section.title}
          </h2>
          {section.intro && (
            <p className="mt-2 text-sm text-gray-600">{section.intro}</p>
          )}

          <div className="mt-6 space-y-7">
            {section.fields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={answers[field.id]}
                otherText={otherText[field.id] ?? ''}
                onChange={(v) => updateAnswer(field.id, v)}
                onToggleCheckbox={(v) => toggleCheckbox(field.id, v)}
                onOtherTextChange={(v) =>
                  setOtherText((prev) => ({ ...prev, [field.id]: v }))
                }
              />
            ))}
          </div>
        </section>
      ))}

      {/* ---- Contact ---- */}
      <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Who are you? (optional)</h2>
        <p className="mt-2 text-sm text-gray-600">
          Leave any of these blank if you&rsquo;d rather stay anonymous. If
          you&rsquo;d like us to follow up on anything you&rsquo;ve written, an
          email or a phone number helps a lot.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Name"
            value={contact.name}
            onChange={(v) => setContact((c) => ({ ...c, name: v }))}
          />
          <TextInput
            label="Email"
            type="email"
            value={contact.email}
            onChange={(v) => setContact((c) => ({ ...c, email: v }))}
          />
          <TextInput
            label="Phone or WhatsApp"
            value={contact.phone}
            onChange={(v) => setContact((c) => ({ ...c, phone: v }))}
          />
        </div>
      </section>

      {/* ---- Actions ---- */}
      {errorMsg && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60"
        >
          {status === 'submitting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending&hellip;
            </>
          ) : (
            'Submit'
          )}
        </button>
      </div>
      <p className="mt-6 text-center text-xs text-gray-400">
        Your answers go to the Kwetu founding team only. We won&rsquo;t publish
        anything you&rsquo;ve written without asking you first.
      </p>
    </form>
  );
}

/* -------------------- helpers -------------------- */

function initialAnswers(def: SurveyDefinition): AnswerMap {
  const out: AnswerMap = {};
  for (const section of def.sections) {
    for (const field of section.fields) {
      switch (field.kind) {
        case 'checkbox':
          out[field.id] = [];
          break;
        case 'scale':
        case 'slider':
        case 'number':
          out[field.id] =
            typeof field.min === 'number' && typeof field.max === 'number'
              ? Math.round((field.min + field.max) / 2)
              : null;
          break;
        default:
          out[field.id] = '';
      }
    }
  }
  return out;
}

function FieldRenderer({
  field,
  value,
  otherText,
  onChange,
  onToggleCheckbox,
  onOtherTextChange,
}: {
  field: FieldDef;
  value: AnswerValue;
  otherText: string;
  onChange: (v: AnswerValue) => void;
  onToggleCheckbox: (v: string) => void;
  onOtherTextChange: (v: string) => void;
}) {
  const label = (
    <div>
      <label className="block text-sm font-semibold text-gray-900">
        {field.label}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {field.help && (
        <p className="mt-1 text-xs text-gray-500">{field.help}</p>
      )}
    </div>
  );

  switch (field.kind) {
    case 'text':
    case 'email':
    case 'phone':
      return (
        <div>
          {label}
          <input
            type={field.kind === 'email' ? 'email' : field.kind === 'phone' ? 'tel' : 'text'}
            value={(value as string) ?? ''}
            placeholder={field.placeholder}
            maxLength={field.maxLength ?? 300}
            onChange={(e) => onChange(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
      );
    case 'longtext':
      return (
        <div>
          {label}
          <textarea
            value={(value as string) ?? ''}
            placeholder={field.placeholder}
            maxLength={field.maxLength ?? 2000}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
      );
    case 'number':
      return (
        <div>
          {label}
          <input
            type="number"
            value={value === null || value === undefined ? '' : String(value)}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className="mt-2 w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
          {field.unit && <span className="ml-2 text-sm text-gray-500">{field.unit}</span>}
        </div>
      );
    case 'radio':
      return (
        <div>
          {label}
          <div className="mt-3 space-y-2">
            {(field.options ?? []).map((opt) => {
              const checked = value === opt.value;
              return (
                <label
                  key={opt.value}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ' +
                    (checked
                      ? 'border-teal-500 bg-teal-50 text-teal-900'
                      : 'border-gray-200 bg-white hover:border-gray-300')
                  }
                >
                  <input
                    type="radio"
                    name={field.id}
                    value={opt.value}
                    checked={checked}
                    onChange={() => onChange(opt.value)}
                    className="mt-0.5 h-4 w-4 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="flex-1">{opt.label}</span>
                </label>
              );
            })}
          </div>
          {(field.options ?? []).find((o) => o.allowOther && o.value === value) && (
            <input
              type="text"
              value={otherText}
              onChange={(e) => onOtherTextChange(e.target.value)}
              placeholder="Please specify"
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            />
          )}
        </div>
      );
    case 'checkbox': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const showOther = (field.options ?? []).some(
        (o) => o.allowOther && arr.includes(o.value)
      );
      return (
        <div>
          {label}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(field.options ?? []).map((opt) => {
              const checked = arr.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ' +
                    (checked
                      ? 'border-teal-500 bg-teal-50 text-teal-900'
                      : 'border-gray-200 bg-white hover:border-gray-300')
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCheckbox(opt.value)}
                    className="mt-0.5 h-4 w-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span className="flex-1">{opt.label}</span>
                </label>
              );
            })}
          </div>
          {showOther && (
            <input
              type="text"
              value={otherText}
              onChange={(e) => onOtherTextChange(e.target.value)}
              placeholder="Please specify"
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            />
          )}
        </div>
      );
    }
    case 'scale': {
      const v = typeof value === 'number' ? value : 3;
      return (
        <div>
          {label}
          <div className="mt-3 flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = v === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(n)}
                  className={
                    'h-11 w-11 rounded-full border text-sm font-semibold transition ' +
                    (active
                      ? 'border-teal-500 bg-teal-600 text-white shadow-sm'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400')
                  }
                  aria-pressed={active}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>{field.scaleLow ?? 'Low'}</span>
            <span>{field.scaleHigh ?? 'High'}</span>
          </div>
        </div>
      );
    }
    case 'slider': {
      const v = typeof value === 'number' ? value : field.min ?? 0;
      return (
        <div>
          {label}
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xs text-gray-500">{field.min}{field.unit}</span>
            <span className="text-lg font-semibold text-gray-900">
              {v}
              {field.unit}
            </span>
            <span className="text-xs text-gray-500">{field.max}{field.unit}</span>
          </div>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 0.5}
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
            className="mt-2 w-full accent-teal-600"
          />
        </div>
      );
    }
    default:
      return null;
  }
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
      />
    </div>
  );
}

'use client';

import Link from 'next/link';

interface BillingModePickerProps {
  value: 'commission' | 'subscription';
  onChange: (value: 'commission' | 'subscription') => void;
  disabled?: boolean;
  /** Hide the footer link (useful on edit pages where context is clear) */
  compact?: boolean;
}

/**
 * Host billing mode selector — lets a host choose between paying a flat
 * monthly subscription fee or the standard 8% commission per booking.
 * Used on both the create and edit forms for properties and boats.
 *
 * Commission rate is canonical 8% (see project_commission_rate memory).
 * Subscription pricing comes from wb_settings / DEFAULT_BILLING_SETTINGS —
 * tiered per-listing (KES 3,000 for the 1st, KES 1,500 for 2–5, KES 1,000
 * for 6–20, KES 500 for 21–50, KES 250 for 51+).
 */
export default function BillingModePicker({
  value,
  onChange,
  disabled,
  compact,
}: BillingModePickerProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Billing mode for this listing</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          You can change this anytime from{' '}
          <Link href="/dashboard/billing" className="text-teal-600 hover:underline">
            Billing
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('commission')}
          className={`text-left rounded-lg border p-3 transition-colors ${
            value === 'commission'
              ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500'
              : 'border-gray-200 hover:border-gray-300'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-4 w-4 rounded-full border-2 ${
                value === 'commission' ? 'border-teal-600 bg-teal-600' : 'border-gray-300'
              }`}
            />
            <span className="font-medium text-sm text-gray-900">8% commission</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            No fixed cost. We take 8% of each confirmed booking's accommodation total.
          </p>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('subscription')}
          className={`text-left rounded-lg border p-3 transition-colors ${
            value === 'subscription'
              ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500'
              : 'border-gray-200 hover:border-gray-300'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-4 w-4 rounded-full border-2 ${
                value === 'subscription' ? 'border-teal-600 bg-teal-600' : 'border-gray-300'
              }`}
            />
            <span className="font-medium text-sm text-gray-900">Monthly subscription</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Flat fee, no commission. From KES 3,000/mo for your first listing, tapering
            down to KES 250/mo each beyond your 50th.
          </p>
        </button>
      </div>

      {!compact && value === 'subscription' && (
        <p className="mt-3 text-xs text-gray-500">
          Your subscription is managed on the{' '}
          <Link href="/dashboard/billing" className="text-teal-600 hover:underline">
            Billing page
          </Link>
          . First-time subscribers get a free trial before the first invoice.
        </p>
      )}
    </div>
  );
}

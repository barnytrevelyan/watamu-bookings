'use client';

import { useState } from 'react';

export default function RespondForm({
  bookingId,
  token,
  defaultAction,
}: {
  bookingId: string;
  token: string;
  defaultAction: 'confirm' | 'decline';
}) {
  const [action, setAction] = useState<'confirm' | 'decline'>(defaultAction);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'confirmed' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token, reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Something went wrong.');
        setSubmitting(false);
        return;
      }
      setDone(json.status);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done === 'confirmed') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
        <p className="text-2xl mb-2" aria-hidden>&#x2705;</p>
        <h2 className="text-lg font-semibold text-emerald-900 mb-1">Booking confirmed</h2>
        <p className="text-sm text-emerald-800">
          The dates are now locked on your calendar and your guest has been sent a confirmation email.
        </p>
      </div>
    );
  }

  if (done === 'declined') {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-2xl mb-2" aria-hidden>&#x2716;&#xFE0F;</p>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Enquiry declined</h2>
        <p className="text-sm text-gray-700">
          We&rsquo;ve let the guest know. The dates are not held.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setAction('confirm')}
          className={`rounded-xl border-2 p-4 text-left transition-colors ${
            action === 'confirm'
              ? 'border-teal-600 bg-teal-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <p className="font-semibold text-gray-900">Confirm deposit received</p>
          <p className="text-xs text-gray-500 mt-1">Locks the dates on your calendar.</p>
        </button>
        <button
          type="button"
          onClick={() => setAction('decline')}
          className={`rounded-xl border-2 p-4 text-left transition-colors ${
            action === 'decline'
              ? 'border-red-600 bg-red-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <p className="font-semibold text-gray-900">Decline</p>
          <p className="text-xs text-gray-500 mt-1">Dates stay free; guest is notified.</p>
        </button>
      </div>

      {action === 'decline' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message to guest (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Sorry, the property is already booked on those dates."
            className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-colors ${
          action === 'confirm'
            ? 'bg-teal-700 hover:bg-teal-800'
            : 'bg-red-700 hover:bg-red-800'
        } ${submitting ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {submitting
          ? 'Submitting…'
          : action === 'confirm'
          ? 'Confirm deposit received'
          : 'Decline enquiry'}
      </button>
    </div>
  );
}

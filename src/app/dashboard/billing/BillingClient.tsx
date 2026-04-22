"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import {
  computeMonthlyChargeKes,
  computeAnnualChargeKes,
  formatKes,
  priceForListingNumber,
  tierForListingNumber,
} from '@/lib/subscriptions/pricing';
import type { BillingSettings, SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions/types';

interface Listing {
  id: string;
  name: string;
  billing_mode: string;
  is_published: boolean;
  created_at: string;
  type: 'property' | 'boat';
}

interface Props {
  hasSubscription: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionPlan: SubscriptionPlan | null;
  properties: Listing[];
  boats: Listing[];
  hostPhone: string | null;
  settings: BillingSettings;
  trialMonths: number;
}

export default function BillingClient({
  hasSubscription,
  subscriptionStatus,
  subscriptionPlan,
  properties,
  boats,
  hostPhone,
  settings,
  trialMonths,
}: Props) {
  const router = useRouter();
  const allListings = useMemo(() => [...properties, ...boats], [properties, boats]);
  const publishedListings = useMemo(() => allListings.filter((l) => l.is_published), [allListings]);

  // Activation state
  const [plan, setPlan] = useState<SubscriptionPlan>('monthly');
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(publishedListings.map((l) => [l.id, true]))
  );
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const quotedMonthly = computeMonthlyChargeKes(selectedCount, settings);
  const quotedAnnual = computeAnnualChargeKes(selectedCount, settings);
  const quotedTotal = plan === 'annual' ? quotedAnnual : quotedMonthly;

  const canActivate = subscriptionStatus !== 'active' && subscriptionStatus !== 'trial' && subscriptionStatus !== 'grace';
  const showToggles = hasSubscription && (subscriptionStatus === 'active' || subscriptionStatus === 'trial' || subscriptionStatus === 'grace');

  async function handleActivate() {
    const ids = Object.entries(selected).filter(([, v]) => v).map(([id]) => {
      const l = allListings.find((x) => x.id === id);
      return l ? { id, type: l.type } : null;
    }).filter(Boolean) as Array<{ id: string; type: 'property' | 'boat' }>;
    if (ids.length === 0) {
      toast.error('Select at least one listing');
      return;
    }

    setActivating(true);
    try {
      const res = await fetch('/api/subscriptions/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, listing_ids: ids }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? 'Activation failed');
        return;
      }
      const trialGranted = json.trial_months ?? 0;
      if (trialGranted > 0) {
        toast.success(`Subscription activated — ${trialGranted}-month free trial started`);
      } else {
        toast.success('Subscription activated — invoice issued');
      }
      if (json.soft_flags?.length) {
        console.warn('[billing] soft flags on activation', json.soft_flags);
      }
      router.refresh();
    } catch (err: unknown) {
      console.error(err);
      toast.error('Something went wrong');
    } finally {
      setActivating(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel your subscription? Your listings will be unpublished until you reactivate.')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revert_listings: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? 'Cancel failed');
        return;
      }
      toast.success('Subscription cancelled');
      router.refresh();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      {/* Activation form */}
      {canActivate && publishedListings.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Activate subscription</h2>
            <p className="text-sm text-gray-500 mt-1">
              {trialMonths > 0
                ? `Pick your plan and listings. Your first ${trialMonths} month${trialMonths === 1 ? '' : 's'} are free.`
                : 'Pick your plan and listings.'}
            </p>
            {!hostPhone && (
              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                Add a phone number to your profile before activating — it's used for M-Pesa receipts and anti-abuse checks.
              </div>
            )}
          </div>

          {/* Plan toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPlan('monthly')}
              className={`flex-1 rounded-lg border px-4 py-3 text-left ${plan === 'monthly' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="font-semibold">Monthly</div>
              <div className="text-sm text-gray-600">Invoiced every month</div>
            </button>
            <button
              type="button"
              onClick={() => setPlan('annual')}
              className={`flex-1 rounded-lg border px-4 py-3 text-left ${plan === 'annual' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="font-semibold">Annual — pay 10, get 12</div>
              <div className="text-sm text-gray-600">Save {formatKes(computeMonthlyChargeKes(Math.max(selectedCount, 1), settings) * 12 - computeAnnualChargeKes(Math.max(selectedCount, 1), settings))}</div>
            </button>
          </div>

          {/* Listing picker */}
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {publishedListings.map((l, idx) => (
              <label key={l.id} className="flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!selected[l.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [l.id]: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{l.name}</div>
                    <div className="text-xs text-gray-500">{l.type === 'property' ? 'Property' : 'Boat'}</div>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>{formatKes(priceForListingNumber(idx + 1, settings))}/mo</div>
                  <div className="text-xs text-gray-400">{tierForListingNumber(idx + 1, settings).label}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Quote */}
          <div className="rounded-lg bg-gray-50 p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">{selectedCount} listing{selectedCount === 1 ? '' : 's'} · {plan}</div>
              <div className="text-xl font-bold text-gray-900">{formatKes(quotedTotal)}{plan === 'annual' ? '/year' : '/month'}</div>
            </div>
            <Button
              onClick={handleActivate}
              disabled={activating || selectedCount === 0}
              className="bg-teal-600 hover:bg-teal-700 text-white"
              size="lg"
            >
              {activating ? 'Activating…' : trialMonths > 0 ? `Start ${trialMonths}-month free trial` : 'Activate subscription'}
            </Button>
          </div>
        </section>
      )}

      {/* Listing summary + cancel (for active subs). Per-listing commission
          toggles are retired — subscription is the only model. We still list
          the host's listings here so they can see what's on their plan. */}
      {showToggles && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Listings on your subscription</h2>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {allListings.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{l.name}</div>
                  <div className="text-xs text-gray-500">{l.type === 'property' ? 'Property' : 'Boat'}{!l.is_published && ' · Unpublished'}</div>
                </div>
                <span className="text-xs font-semibold text-teal-700">Subscription</span>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-5 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel subscription'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

'use client';

/**
 * /dashboard/flexi-pricing — account-wide flexi (last-minute) pricing.
 *
 * Two jobs:
 *  1. Set host-level defaults (inherited by any property with a null
 *     override).
 *  2. Bulk-toggle flexi on/off across every property the host owns, so a
 *     host with 20 cottages doesn't have to click into each one.
 *
 * Per-property overrides still happen on the property edit page —
 * those win over the default. This page is the "set it once and forget"
 * entry point.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Sparkles, ArrowLeft, Home, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface HostDefaults {
  enabled: boolean;
  window_days: number;
  cutoff_days: number;
  floor_percent: number;
}

interface PropertyRow {
  id: string;
  name: string;
  base_price_per_night: number | null;
  flexi_enabled: boolean;
  flexi_window_days: number | null;
  flexi_cutoff_days: number | null;
  flexi_floor_percent: number | null;
}

export default function FlexiPricingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [defaults, setDefaults] = useState<HostDefaults>({
    enabled: false,
    window_days: 7,
    cutoff_days: 1,
    floor_percent: 70,
  });
  const [properties, setProperties] = useState<PropertyRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const supabase = createClient();
        const [{ data: profile }, { data: props }] = await Promise.all([
          supabase
            .from('wb_profiles')
            .select(
              'flexi_default_enabled, flexi_default_window_days, flexi_default_cutoff_days, flexi_default_floor_percent',
            )
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('wb_properties')
            .select(
              'id, name, base_price_per_night, flexi_enabled, flexi_window_days, flexi_cutoff_days, flexi_floor_percent',
            )
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
        ]);
        if (profile) {
          setDefaults({
            enabled: Boolean(profile.flexi_default_enabled),
            window_days: profile.flexi_default_window_days ?? 7,
            cutoff_days: profile.flexi_default_cutoff_days ?? 1,
            floor_percent: profile.flexi_default_floor_percent ?? 70,
          });
        }
        setProperties((props as PropertyRow[] | null) ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function saveDefaults() {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('wb_profiles')
      .update({
        flexi_default_enabled: defaults.enabled,
        flexi_default_window_days: defaults.window_days,
        flexi_default_cutoff_days: defaults.cutoff_days,
        flexi_default_floor_percent: defaults.floor_percent,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Could not save defaults.');
      return;
    }
    toast.success('Defaults saved.');
  }

  async function bulkApply(enable: boolean) {
    if (!user) return;
    const verb = enable ? 'enable' : 'disable';
    const n = properties.length;
    if (!confirm(`${verb[0]!.toUpperCase() + verb.slice(1)} flexi pricing on all ${n} ${n === 1 ? 'property' : 'properties'}?`)) {
      return;
    }
    setBulkSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('wb_properties')
      .update({ flexi_enabled: enable })
      .eq('owner_id', user.id);
    setBulkSaving(false);
    if (error) {
      toast.error(`Could not ${verb} flexi pricing.`);
      return;
    }
    setProperties((prev) => prev.map((p) => ({ ...p, flexi_enabled: enable })));
    toast.success(`Flexi pricing ${enable ? 'enabled' : 'disabled'} on all properties.`);
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-primary-100)] bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-sandy-50)] p-6 sm:p-8 animate-fade-in">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--color-primary-200)] opacity-30 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link
              href="/dashboard"
              className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-primary-100)] bg-white/80 text-gray-600 backdrop-blur transition-colors hover:border-[var(--color-primary-200)] hover:text-[var(--color-primary-700)]"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-primary-700)]">
                  Pricing
                </span>
                <Sparkles className="h-4 w-4 text-[var(--color-coral-500)]" />
              </div>
              <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
                Flexi pricing
              </h1>
              <p className="mt-1 max-w-xl text-sm text-gray-600">
                Drop your nightly rate automatically as the check-in date approaches.
                A booked property earns more than an empty one — and Kenya residents
                love a last-minute deal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Defaults card */}
      <Card className="p-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Account defaults
            </h2>
            <p className="mt-1 text-xs text-gray-600">
              Properties with no override use these values.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={defaults.enabled}
            onClick={() => setDefaults((d) => ({ ...d, enabled: !d.enabled }))}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              defaults.enabled ? 'bg-[var(--color-primary-600)]' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                defaults.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800">
              Discount window
              <span className="ml-2 text-xs font-normal text-gray-400">
                days before check-in
              </span>
            </label>
            <Input
              type="number"
              min={1}
              max={90}
              value={defaults.window_days}
              onChange={(e) =>
                setDefaults((d) => ({ ...d, window_days: parseInt(e.target.value, 10) || 1 }))
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800">
              Booking notice
              <span className="ml-2 text-xs font-normal text-gray-400">
                days needed before check-in
              </span>
            </label>
            <Input
              type="number"
              min={0}
              max={89}
              value={defaults.cutoff_days}
              onChange={(e) =>
                setDefaults((d) => ({
                  ...d,
                  cutoff_days: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
            />
            <p className="mt-1 text-[11px] text-gray-500">
              0 = accept same-day bookings. Flexi price reaches its floor here.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-800">
              Floor
              <span className="ml-2 text-xs font-normal text-gray-400">
                % of base price
              </span>
            </label>
            <Input
              type="number"
              min={10}
              max={100}
              value={defaults.floor_percent}
              onChange={(e) =>
                setDefaults((d) => ({
                  ...d,
                  floor_percent: parseInt(e.target.value, 10) || 10,
                }))
              }
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={saveDefaults} disabled={saving}>
            {saving ? 'Saving…' : 'Save defaults'}
          </Button>
        </div>
      </Card>

      {/* Per-property table + bulk apply */}
      <Card className="p-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Your properties</h2>
            <p className="mt-1 text-xs text-gray-600">
              Per-property settings win. Blank window/floor inherit the defaults above.
            </p>
          </div>
          {properties.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkApply(true)}
                disabled={bulkSaving}
              >
                Enable on all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkApply(false)}
                disabled={bulkSaving}
              >
                Disable on all
              </Button>
            </div>
          )}
        </div>

        {properties.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            You don&apos;t have any properties yet.
          </div>
        ) : (
          <div className="mt-5 divide-y divide-gray-100">
            {properties.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-50)] text-[var(--color-primary-600)]">
                    <Home className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {p.flexi_enabled ? (
                        <span className="inline-flex items-center gap-1 text-[var(--color-primary-700)]">
                          <CheckCircle2 className="h-3 w-3" /> Flexi on · window{' '}
                          {p.flexi_window_days ?? defaults.window_days}d · notice{' '}
                          {p.flexi_cutoff_days ?? defaults.cutoff_days}d · floor{' '}
                          {p.flexi_floor_percent ?? defaults.floor_percent}%
                        </span>
                      ) : (
                        <span>Flexi off</span>
                      )}
                    </div>
                  </div>
                </div>
                <Link
                  href={`/dashboard/properties/${p.id}`}
                  className="text-sm font-medium text-[var(--color-primary-700)] hover:underline"
                >
                  Edit
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

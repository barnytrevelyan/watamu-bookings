'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import toast from 'react-hot-toast';

type ImportSource = 'airbnb' | 'fishingbooker' | 'booking' | 'ai' | null;
type Step = 'choose' | 'url' | 'preview' | 'saving' | 'done';
type AiProvider = 'anthropic' | 'openai';
type AiKind = 'property' | 'boat' | 'mixed';

/**
 * One scraped listing in the review step. `include` controls whether this
 * listing will be saved; `images[i].include` controls whether each image is
 * kept. `data` holds all the editable fields the host can tweak.
 */
interface EditableListing {
  include: boolean;
  data: any;
  images: { url: string; include: boolean }[];
}

/** Normalize the API response into EditableListing[]. AI returns a list; other
 *  importers return a single object we wrap into a one-element list so the
 *  preview UI can treat every source the same way. */
function normalizeImport(responseData: any): EditableListing[] {
  // AI multi-listing response: { listings: [...] }
  if (responseData?.listings && Array.isArray(responseData.listings)) {
    return responseData.listings.map((d: any) => toEditable(d));
  }
  // Single-listing response (Airbnb, Booking, FishingBooker)
  return [toEditable(responseData)];
}

function toEditable(data: any): EditableListing {
  const images = Array.isArray(data?.images) ? data.images : [];
  // Strip images from `data` so the images array is the single source of truth.
  const { images: _omit, ...rest } = data ?? {};
  return {
    include: true,
    data: rest,
    images: images.map((url: string) => ({ url, include: true })),
  };
}

const SOURCE_LABEL: Record<Exclude<ImportSource, null>, string> = {
  airbnb: 'Airbnb',
  fishingbooker: 'FishingBooker',
  booking: 'Booking.com',
  ai: 'your own website',
};

const SOURCE_PLACEHOLDER: Record<Exclude<ImportSource, null>, string> = {
  airbnb: 'https://www.airbnb.com/rooms/12345678',
  fishingbooker: 'https://www.fishingbooker.com/charter/12345',
  booking: 'https://www.booking.com/hotel/ke/your-property.html',
  ai: 'https://your-villa-website.com/',
};

export default function ImportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [source, setSource] = useState<ImportSource>(null);
  const [step, setStep] = useState<Step>('choose');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [listings, setListings] = useState<EditableListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdItems, setCreatedItems] = useState<
    Array<{ id: string; kind: 'property' | 'boat' }>
  >([]);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null);
  // AI importer fields — the API key is used once per request and never stored.
  // By default, we use Watamu Bookings' own AI key (free, rate-limited) so
  // hosts don't need to go get one. Advanced hosts can paste their own key
  // for unlimited imports.
  const [aiProvider, setAiProvider] = useState<AiProvider>('anthropic');
  const [aiKind, setAiKind] = useState<AiKind>('property');
  const [aiKey, setAiKey] = useState('');
  const [aiUsePlatformKey, setAiUsePlatformKey] = useState(true);

  // Gate the whole flow behind watamu-bookings auth. The /api/import/* endpoints
  // verify the Supabase session and return 401 "Authentication required" if the
  // user isn't signed in — which was surfacing as a confusing in-form error.
  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import a Listing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bring your existing listing from another platform.
          </p>
        </div>
        <Card className="p-8 text-center border-teal-200 bg-teal-50/40">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Sign in to import your listing
          </h2>
          <p className="text-sm text-gray-600 mb-5 max-w-lg mx-auto">
            You need a Watamu Bookings host account to import. Good news:
            you don&apos;t need to be signed into Airbnb or FishingBooker —
            we read the public listing page directly.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => router.push('/auth/login?redirect=/dashboard/import')}
            >
              Sign in
            </Button>
            <Button
              onClick={() => router.push('/auth/register?role=owner')}
            >
              Create host account
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  async function handleImport() {
    if (!url.trim()) {
      setError('Please paste a listing URL');
      return;
    }
    if (source === 'ai' && !aiUsePlatformKey && !aiKey.trim()) {
      setError('Please paste your AI provider API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint =
        source === 'airbnb'
          ? '/api/import/airbnb'
          : source === 'booking'
            ? '/api/import/booking'
            : source === 'ai'
              ? '/api/import/ai'
              : '/api/import/fishingbooker';

      const body =
        source === 'ai'
          ? aiUsePlatformKey
            ? {
                // Let the server use its WATAMU_AI_API_KEY fallback.
                url: url.trim(),
                kind: aiKind,
              }
            : {
                url: url.trim(),
                apiKey: aiKey.trim(),
                provider: aiProvider,
                kind: aiKind,
              }
          : { url: url.trim() };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (!res.ok) {
        // Log the server's debug payload if it sent one (helps triage
        // cookie/auth issues that only show up in production).
        if (result?.debug) {
          // eslint-disable-next-line no-console
          console.warn('[import] server debug:', result.debug);
        }
        const debugSuffix = result?.debug
          ? ` [sbCookieCount=${result.debug.sbCookieCount ?? '?'}]`
          : '';
        throw new Error((result.error || 'Import failed') + debugSuffix);
      }

      const normalized = normalizeImport(result.data);
      if (normalized.length === 0) {
        throw new Error('No listings were extracted from that URL.');
      }
      setListings(normalized);
      setStep('preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Global default when a listing doesn't carry its own `kind` tag (used by
  // the non-AI importers, which return a single listing typed by source).
  function defaultKind(): 'property' | 'boat' {
    if (source === 'fishingbooker') return 'boat';
    if (source === 'ai') return aiKind === 'boat' ? 'boat' : 'property';
    return 'property'; // airbnb, booking
  }

  // Per-listing kind: AI may return cottages and boats from the same site, so
  // every listing carries its own `data.kind`. Older shapes (single-source
  // importers) don't, so we fall back to the global default.
  function kindOf(listing: EditableListing): 'property' | 'boat' {
    const k = listing?.data?.kind;
    if (k === 'boat' || k === 'property') return k;
    return defaultKind();
  }

  async function handleSave() {
    if (!user || !listings) return;

    const approved = listings.filter((l) => l.include);
    if (approved.length === 0) {
      setError('Please select at least one listing to save.');
      return;
    }

    // Guard against scraper failures that produced empty/404 garbage.
    const invalid = approved.find((l) => {
      const n = (l.data?.name || '').trim();
      return !n || /^(404|Not Found|Page Not Found|Access Denied)$/i.test(n);
    });
    if (invalid) {
      setError('One of the selected listings has no usable name. Edit or exclude it first.');
      return;
    }

    setError(null);
    setStep('saving');
    setSaveProgress({ current: 0, total: approved.length });

    const importSourceTag =
      source === 'ai'
        ? aiUsePlatformKey
          ? 'ai:platform'
          : `ai:${aiProvider}`
        : source ?? 'manual';

    const supabase = createClient();
    const createdItemsLocal: Array<{ id: string; kind: 'property' | 'boat' }> = [];

    try {
      for (let i = 0; i < approved.length; i++) {
        const listing = approved[i];
        setSaveProgress({ current: i, total: approved.length });

        // Resolve kind PER-LISTING. AI imports may return cottages and boats
        // from the same domain, so each listing carries its own kind tag.
        const kind = kindOf(listing);
        const d = listing.data;
        const rawName = (d.name || '').trim();
        const baseSlug = rawName
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/^-+|-+$/g, '');
        const slug = `${baseSlug || 'listing'}-${Math.random().toString(36).slice(2, 7)}`;

        // Only the images the host ticked make it through.
        const keptUrls = listing.images.filter((img) => img.include).map((img) => img.url);

        // Mirror the kept images to Supabase storage so we keep our own copies
        // even if the source site takes down the listing. This is a best-effort
        // mirror: if any individual image fails we fall back to the original
        // remote URL rather than blocking the import.
        let finalImageUrls: string[] = keptUrls;
        if (keptUrls.length > 0) {
          try {
            const mirrorRes = await fetch('/api/import/mirror-images', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                urls: keptUrls,
                listing_type: kind,
              }),
            });
            if (mirrorRes.ok) {
              const mirrored = await mirrorRes.json();
              if (Array.isArray(mirrored?.urls) && mirrored.urls.length === keptUrls.length) {
                finalImageUrls = mirrored.urls;
              }
            }
          } catch {
            // network hiccup — keep the originals
          }
        }

        if (kind === 'property') {
          const { data: property, error: propError } = await supabase
            .from('wb_properties')
            .insert({
              owner_id: user.id,
              name: rawName,
              slug,
              description: d.description,
              property_type: d.property_type || 'house',
              address: d.address || '',
              city: d.city || 'Watamu',
              county: 'Kilifi',
              country: 'Kenya',
              latitude: d.latitude ?? null,
              longitude: d.longitude ?? null,
              base_price_per_night: d.price_per_night || 0,
              currency: d.currency || 'KES',
              max_guests: d.max_guests || 2,
              bedrooms: d.bedrooms || 1,
              bathrooms: d.bathrooms || 1,
              cancellation_policy: 'moderate',
              is_published: false,
              status: 'pending_review',
              source_url: d.source_url || url.trim(),
              import_source: importSourceTag,
              video_url: (d.video_url || '').trim() || null,
            })
            .select('id')
            .single();

          if (propError) throw propError;

          if (finalImageUrls.length > 0) {
            const imageRows = finalImageUrls.map((u: string, idx: number) => ({
              property_id: property.id,
              listing_type: 'property',
              url: u,
              alt_text: `${rawName} - Image ${idx + 1}`,
              sort_order: idx,
              is_cover: idx === 0,
            }));
            const { error: imgErr } = await supabase.from('wb_images').insert(imageRows);
            if (imgErr) throw imgErr;
          }

          createdItemsLocal.push({ id: property.id, kind: 'property' });
        } else {
          const { data: boat, error: boatError } = await supabase
            .from('wb_boats')
            .insert({
              owner_id: user.id,
              name: rawName,
              slug,
              description: d.description,
              boat_type: d.boat_type || 'sport_fisher',
              length_ft: d.length_ft,
              capacity: d.capacity || 6,
              crew_size: d.crew_size || 2,
              captain_name: d.captain_name,
              captain_bio: d.captain_bio,
              target_species: d.target_species || [],
              fishing_techniques: d.fishing_techniques || [],
              departure_point: 'Watamu Marine Park Jetty',
              currency: 'KES',
              cancellation_policy: 'moderate',
              is_published: false,
              status: 'pending_review',
              source_url: d.source_url || url.trim(),
              import_source: importSourceTag,
              video_url: (d.video_url || '').trim() || null,
            })
            .select('id')
            .single();

          if (boatError) throw boatError;

          if (d.trips?.length > 0) {
            const tripRows = d.trips
              .filter((t: any) => t.name)
              .map((t: any, idx: number) => ({
                boat_id: boat.id,
                name: t.name,
                trip_type: t.trip_type || 'half_day',
                duration_hours: t.duration_hours || 4,
                price_total: t.price_total || 0,
                price_per_person: t.price_per_person,
                departure_time: t.departure_time,
                includes: t.includes || [],
                target_species: t.target_species || [],
                seasonal_months: [],
                sort_order: idx,
              }));
            const { error: tripErr } = await supabase.from('wb_boat_trips').insert(tripRows);
            if (tripErr) throw tripErr;
          }

          if (finalImageUrls.length > 0) {
            const imageRows = finalImageUrls.map((u: string, idx: number) => ({
              boat_id: boat.id,
              listing_type: 'boat',
              url: u,
              alt_text: `${rawName} - Image ${idx + 1}`,
              sort_order: idx,
              is_cover: idx === 0,
            }));
            const { error: imgErr } = await supabase.from('wb_images').insert(imageRows);
            if (imgErr) throw imgErr;
          }

          createdItemsLocal.push({ id: boat.id, kind: 'boat' });
        }
      }

      setCreatedItems(createdItemsLocal);
      setSaveProgress({ current: approved.length, total: approved.length });
      setStep('done');
      toast.success(
        approved.length === 1
          ? 'Listing imported successfully!'
          : `${approved.length} listings imported successfully!`
      );
    } catch (err: any) {
      setError(err.message);
      setStep('preview');
      setSaveProgress(null);
      toast.error('Failed to save listing');
    }
  }

  // Mutate a single listing's data field (e.g. rename it, change price).
  function updateListingData(index: number, patch: Record<string, any>) {
    setListings((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], data: { ...next[index].data, ...patch } };
      return next;
    });
  }

  function toggleListingInclude(index: number) {
    setListings((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], include: !next[index].include };
      return next;
    });
  }

  function toggleImageInclude(listingIdx: number, imageIdx: number) {
    setListings((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const lst = next[listingIdx];
      const newImages = lst.images.map((img, i) =>
        i === imageIdx ? { ...img, include: !img.include } : img
      );
      next[listingIdx] = { ...lst, images: newImages };
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import a Listing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bring your existing listing from another platform. We&apos;ll import your photos, description, and pricing.
        </p>
      </div>

      {/* Step 1: Choose source */}
      {step === 'choose' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => { setSource('airbnb'); setStep('url'); }}
            className="group text-left border-2 border-gray-200 rounded-2xl p-6 hover:border-[#FF5A5F] hover:bg-red-50/30 transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-[#FF5A5F] flex items-center justify-center text-white font-bold text-lg">
                A
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-[#FF5A5F]">Airbnb</h3>
                <p className="text-xs text-gray-500">Import a property listing</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              We&apos;ll import your property name, photos, description, pricing, amenities, and location.
            </p>
          </button>

          <button
            type="button"
            onClick={() => { setSource('booking'); setStep('url'); }}
            className="group text-left border-2 border-gray-200 rounded-2xl p-6 hover:border-[#003580] hover:bg-blue-50/30 transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-[#003580] flex items-center justify-center text-white font-bold text-lg">
                B.
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-[#003580]">Booking.com</h3>
                <p className="text-xs text-gray-500">Import a property listing</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              We&apos;ll import your property name, photos, description, pricing, location, and guest rating.
            </p>
          </button>

          <button
            type="button"
            onClick={() => { setSource('fishingbooker'); setStep('url'); }}
            className="group text-left border-2 border-gray-200 rounded-2xl p-6 hover:border-blue-500 hover:bg-blue-50/30 transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                FB
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">FishingBooker</h3>
                <p className="text-xs text-gray-500">Import a boat charter</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              We&apos;ll import your boat specs, trip packages, captain info, photos, and target species.
            </p>
          </button>

          <button
            type="button"
            onClick={() => { setSource('ai'); setStep('url'); }}
            className="group text-left border-2 border-gray-200 rounded-2xl p-6 hover:border-teal-500 hover:bg-teal-50/30 transition-all sm:col-span-2 lg:col-span-3"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                ✨
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-teal-700">
                  Your own website <span className="text-xs font-normal text-gray-500">(AI-powered)</span>
                </h3>
                <p className="text-xs text-gray-500">Import from any property or boat website</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Paste a link to your own website and bring your own Anthropic or OpenAI API key.
              We&apos;ll use AI to read the page and draft a listing for you to review. Your key is used once and never stored.
            </p>
          </button>
        </div>
      )}

      {/* Step 2: Enter URL */}
      {step === 'url' && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => {
                setStep('choose');
                setSource(null);
                setUrl('');
                setAiKey('');
                setError(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {source === 'ai'
                ? 'Import from your own website'
                : `Paste your ${source ? SOURCE_LABEL[source] : ''} listing URL`}
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={source ? SOURCE_PLACEHOLDER[source] : ''}
                className="text-base"
              />
              <p className="text-xs text-gray-500 mt-2">
                {source === 'ai'
                  ? 'Paste a public link to your own property or boat website — any page describing the listing will do.'
                  : `Go to your ${source ? SOURCE_LABEL[source] : ''} listing page and copy the URL from your browser.`}
              </p>
            </div>

            {source === 'ai' && (
              <div className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">What&apos;s on this site?</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAiKind('property')}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        aiKind === 'property'
                          ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Stays only
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiKind('boat')}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        aiKind === 'boat'
                          ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Charters only
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiKind('mixed')}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        aiKind === 'mixed'
                          ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Both / not sure
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                    Our AI crawls up to 8 pages of your site and detects each listing separately — cottages, villas, fishing boats, dhows, and more. Pick &ldquo;Both&rdquo; if your site has stays <em>and</em> charters.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-900 mb-2">Who pays for the AI?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAiUsePlatformKey(true)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                        aiUsePlatformKey
                          ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold">Use Watamu Bookings&apos; AI</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Free for hosts · up to 15 imports / day
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiUsePlatformKey(false)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                        !aiUsePlatformKey
                          ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold">Use my own key</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Unlimited · you pay the AI provider directly
                      </div>
                    </button>
                  </div>
                </div>

                {!aiUsePlatformKey && (
                  <>
                    <div>
                      <p className="text-sm font-medium text-gray-900 mb-2">AI provider</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAiProvider('anthropic')}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            aiProvider === 'anthropic'
                              ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          Anthropic (Claude)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiProvider('openai')}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            aiProvider === 'openai'
                              ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          OpenAI (GPT)
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-900 mb-2">
                        {aiProvider === 'anthropic' ? 'Anthropic API key' : 'OpenAI API key'}
                      </p>
                      <Input
                        type="password"
                        value={aiKey}
                        onChange={(e) => setAiKey(e.target.value)}
                        placeholder={aiProvider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                        autoComplete="off"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-gray-600 mt-2">
                        Your key is sent once to {aiProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'} to read this
                        page and is never stored on our servers.{' '}
                        {aiProvider === 'anthropic' ? (
                          <a
                            href="https://console.anthropic.com/settings/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-700 hover:underline"
                          >
                            Get an Anthropic key →
                          </a>
                        ) : (
                          <a
                            href="https://platform.openai.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-700 hover:underline"
                          >
                            Get an OpenAI key →
                          </a>
                        )}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={
                loading ||
                !url.trim() ||
                (source === 'ai' && !aiUsePlatformKey && !aiKey.trim())
              }
              className="w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {source === 'ai' ? 'Reading your page with AI…' : 'Importing...'}
                </span>
              ) : source === 'ai' ? (
                'Read with AI'
              ) : (
                'Import Listing'
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Preview — one editable card per listing, with include toggles. */}
      {step === 'preview' && listings && listings.length > 0 && (() => {
        const includedCount = listings.filter((l) => l.include).length;
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {listings.length === 1
                    ? 'Review Imported Listing'
                    : `Review ${listings.length} Imported Listings`}
                </h2>
                {listings.length > 1 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Uncheck any listing or image you don&apos;t want to save. Edit details inline.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setStep('url'); setListings(null); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                &larr; Try another URL
              </button>
            </div>

            {listings.map((listing, lIdx) => {
              const d = listing.data;
              const kind = kindOf(listing);
              const includedImages = listing.images.filter((img) => img.include).length;
              return (
                <Card
                  key={lIdx}
                  className={`p-5 transition-opacity ${
                    listing.include ? 'opacity-100' : 'opacity-60 bg-gray-50'
                  }`}
                >
                  {/* Header: include checkbox + quick summary */}
                  <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
                    <label className="flex items-start gap-3 cursor-pointer select-none flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={listing.include}
                        onChange={() => toggleListingInclude(lIdx)}
                        className="mt-1 w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            value={d.name || ''}
                            onChange={(e) => updateListingData(lIdx, { name: e.target.value })}
                            placeholder="Listing name"
                            className="text-xl font-bold text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-teal-500 focus:outline-none focus:ring-0 px-0 py-0.5 flex-1 min-w-0"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              const next = kind === 'property' ? 'boat' : 'property';
                              updateListingData(lIdx, { kind: next });
                            }}
                            title="Tap to switch between Property and Boat — use this if the AI mis-classified the listing"
                            className={`shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${
                              kind === 'boat'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                            }`}
                          >
                            {kind === 'boat' ? '⚓ Boat' : '🏠 Property'}
                          </button>
                        </div>
                        {d.source_url && (
                          <p className="text-[11px] text-gray-400 mt-1 truncate">
                            Source: {d.source_url}
                          </p>
                        )}
                      </div>
                    </label>
                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${
                      listing.include ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {listing.include ? 'Will save' : 'Excluded'}
                    </span>
                  </div>

                  {/* Editable description */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 block mb-1">Description</label>
                    <textarea
                      value={d.description || ''}
                      onChange={(e) => updateListingData(lIdx, { description: e.target.value })}
                      rows={3}
                      className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  {/* Editable field grid */}
                  {kind === 'property' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Type</label>
                        <select
                          value={d.property_type || 'house'}
                          onChange={(e) => updateListingData(lIdx, { property_type: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        >
                          {['villa', 'apartment', 'cottage', 'house', 'hotel', 'banda', 'bungalow', 'studio', 'penthouse', 'beach_house'].map((t) => (
                            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Price / night</label>
                        <div className="flex items-center gap-1">
                          <input
                            value={d.currency || 'KES'}
                            onChange={(e) => updateListingData(lIdx, { currency: e.target.value.toUpperCase().slice(0, 3) })}
                            className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm uppercase focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                          />
                          <input
                            type="number"
                            value={d.price_per_night ?? ''}
                            onChange={(e) => updateListingData(lIdx, { price_per_night: e.target.value ? parseFloat(e.target.value) : null })}
                            placeholder="—"
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">City</label>
                        <input
                          value={d.city || ''}
                          onChange={(e) => updateListingData(lIdx, { city: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Guests</label>
                        <input
                          type="number"
                          value={d.max_guests ?? ''}
                          onChange={(e) => updateListingData(lIdx, { max_guests: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="—"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Bedrooms</label>
                        <input
                          type="number"
                          value={d.bedrooms ?? ''}
                          onChange={(e) => updateListingData(lIdx, { bedrooms: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="—"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Bathrooms</label>
                        <input
                          type="number"
                          value={d.bathrooms ?? ''}
                          onChange={(e) => updateListingData(lIdx, { bathrooms: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="—"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Boat type</label>
                        <select
                          value={d.boat_type || 'sport_fisher'}
                          onChange={(e) => updateListingData(lIdx, { boat_type: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        >
                          {['sport_fisher', 'dhow', 'catamaran', 'speedboat', 'sailing_yacht', 'fishing_boat'].map((t) => (
                            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Length (ft)</label>
                        <input
                          type="number"
                          value={d.length_ft ?? ''}
                          onChange={(e) => updateListingData(lIdx, { length_ft: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="—"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Capacity</label>
                        <input
                          type="number"
                          value={d.capacity ?? ''}
                          onChange={(e) => updateListingData(lIdx, { capacity: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="—"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Crew size</label>
                        <input
                          type="number"
                          value={d.crew_size ?? ''}
                          onChange={(e) => updateListingData(lIdx, { crew_size: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="—"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs text-gray-500 block mb-1">Captain name</label>
                        <input
                          value={d.captain_name || ''}
                          onChange={(e) => updateListingData(lIdx, { captain_name: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Video tour URL — optional, shared by properties and boats */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 block mb-1">
                      Video tour URL{' '}
                      <span className="text-gray-400">(optional — YouTube, Vimeo, or MP4)</span>
                    </label>
                    <input
                      type="url"
                      value={d.video_url || ''}
                      onChange={(e) => updateListingData(lIdx, { video_url: e.target.value })}
                      placeholder="https://youtu.be/... or https://vimeo.com/..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  {/* Trip packages (boats only, read-only view) */}
                  {kind === 'boat' && d.trips?.length > 0 && (
                    <div className="mb-4 pt-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-2">Trip Packages ({d.trips.length})</p>
                      <div className="space-y-1.5">
                        {d.trips.map((trip: any, i: number) => (
                          <div key={i} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
                            <span className="text-gray-900">{trip.name}</span>
                            <span className="font-medium text-teal-700">
                              {trip.price_total > 0 ? `${d.currency || 'KES'} ${trip.price_total}` : 'Price TBD'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Images — per-image include checkbox */}
                  {listing.images.length > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-500">
                          Images ({includedImages} of {listing.images.length} selected)
                        </p>
                        <div className="flex gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              setListings((prev) => {
                                if (!prev) return prev;
                                const next = [...prev];
                                next[lIdx] = {
                                  ...next[lIdx],
                                  images: next[lIdx].images.map((img) => ({ ...img, include: true })),
                                };
                                return next;
                              })
                            }
                            className="text-teal-600 hover:text-teal-700"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setListings((prev) => {
                                if (!prev) return prev;
                                const next = [...prev];
                                next[lIdx] = {
                                  ...next[lIdx],
                                  images: next[lIdx].images.map((img) => ({ ...img, include: false })),
                                };
                                return next;
                              })
                            }
                            className="text-gray-500 hover:text-gray-700"
                          >
                            Select none
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {listing.images.map((img, iIdx) => (
                          <button
                            key={iIdx}
                            type="button"
                            onClick={() => toggleImageInclude(lIdx, iIdx)}
                            className={`relative aspect-video rounded-lg overflow-hidden group ring-2 transition-all ${
                              img.include
                                ? 'ring-teal-500'
                                : 'ring-gray-200 opacity-40 hover:opacity-60'
                            }`}
                            title={img.include ? 'Click to exclude this image' : 'Click to include this image'}
                          >
                            <img
                              src={img.url}
                              alt={`Image ${iIdx + 1}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute top-1.5 right-1.5">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                img.include ? 'bg-teal-500 text-white' : 'bg-white/80 border border-gray-300'
                              }`}>
                                {img.include && (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            {iIdx === 0 && img.include && (
                              <span className="absolute bottom-1.5 left-1.5 bg-white/95 px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-700">
                                Cover
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}

            <Card className="border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    {includedCount === 1
                      ? 'Your listing will be submitted for review'
                      : `${includedCount} listings will be submitted for review`}
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Imported photos are mirrored to Watamu Bookings storage, so your listing keeps working
                    even if you remove it from the original site. Our team will verify ownership before
                    going live — you can keep editing in the meantime.
                  </p>
                </div>
              </div>
            </Card>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setStep('url'); setListings(null); }} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={includedCount === 0}
                className="flex-1"
              >
                {includedCount === 0
                  ? 'Select at least one listing'
                  : includedCount === 1
                    ? 'Submit for Review'
                    : `Submit ${includedCount} for Review`}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Step 4: Saving */}
      {step === 'saving' && (
        <Card className="p-12 text-center">
          <svg className="animate-spin h-10 w-10 text-teal-600 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-700 font-medium">
            {saveProgress && saveProgress.total > 1
              ? `Creating listing ${saveProgress.current + 1} of ${saveProgress.total}…`
              : 'Creating your listing…'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Mirroring photos to Watamu Bookings storage</p>
        </Card>
      )}

      {/* Step 5: Done */}
      {step === 'done' && (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {createdItems.length === 1 ? 'Import Complete!' : `${createdItems.length} Listings Imported!`}
          </h2>
          <p className="text-gray-600 mb-6">
            {createdItems.length === 1
              ? 'Your listing has been submitted for review. Our team will verify ownership and approve it shortly. You can edit details in the meantime.'
              : 'Your listings have been submitted for review. Our team will verify ownership and approve them shortly. You can edit details in the meantime.'}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                setStep('choose');
                setSource(null);
                setUrl('');
                setAiKey('');
                setListings(null);
                setCreatedItems([]);
                setSaveProgress(null);
                setError(null);
              }}
            >
              Import Another
            </Button>
            {createdItems.length === 1 ? (
              <Button
                onClick={() => {
                  const { id, kind } = createdItems[0];
                  router.push(
                    kind === 'boat'
                      ? `/dashboard/boats/${id}`
                      : `/dashboard/properties/${id}`
                  );
                }}
              >
                Edit Listing
              </Button>
            ) : (
              <Button onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

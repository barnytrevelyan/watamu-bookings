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
type AiKind = 'property' | 'boat';

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
  const [importedData, setImportedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
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

      setImportedData(result.data);
      setStep('preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Resolves whether the imported data should become a property or a boat.
  function resolveKind(): 'property' | 'boat' {
    if (source === 'fishingbooker') return 'boat';
    if (source === 'ai') return aiKind;
    return 'property'; // airbnb, booking
  }

  async function handleSave() {
    if (!user || !importedData) return;

    // Guard against scraper failures that produced empty/404 garbage.
    const rawName = (importedData.name || '').trim();
    if (!rawName || /^(404|Not Found|Page Not Found|Access Denied)$/i.test(rawName)) {
      setError('The imported listing has no usable name. Please try a different URL.');
      return;
    }

    setStep('saving');

    // Build a slug with a short random suffix so repeat imports of the same
    // listing name don't collide on the unique-index.
    const slugSuffix = Math.random().toString(36).slice(2, 7);
    const baseSlug = rawName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const slug = `${baseSlug || 'listing'}-${slugSuffix}`;

    try {
      const supabase = createClient();

      const kind = resolveKind();
      // Tag the import_source so we know where each row came from later. For the
      // AI route we include the LLM provider so support can tell Anthropic vs
      // OpenAI imports apart.
      const importSourceTag =
        source === 'ai'
          ? aiUsePlatformKey
            ? 'ai:platform'
            : `ai:${aiProvider}`
          : source ?? 'manual';

      if (kind === 'property') {
        // Create property from imported data (Airbnb, Booking.com, and AI
        // property imports share the same shape).

        const { data: property, error: propError } = await supabase
          .from('wb_properties')
          .insert({
            owner_id: user.id,
            name: importedData.name,
            slug,
            description: importedData.description,
            property_type: importedData.property_type || 'house',
            address: importedData.address || '',
            city: importedData.city || 'Watamu',
            county: 'Kilifi',
            country: 'Kenya',
            latitude: importedData.latitude,
            longitude: importedData.longitude,
            base_price_per_night: importedData.price_per_night || 0,
            currency: importedData.currency || 'KES',
            max_guests: importedData.max_guests || 2,
            bedrooms: importedData.bedrooms || 1,
            bathrooms: importedData.bathrooms || 1,
            cancellation_policy: 'moderate',
            is_published: false,
            status: 'pending_review',
            source_url: importedData.source_url || url.trim(),
            import_source: importSourceTag,
          })
          .select('id')
          .single();

        if (propError) throw propError;

        // Insert images — surface errors instead of silently orphaning the property.
        if (importedData.images?.length > 0) {
          const imageRows = importedData.images.map((url: string, i: number) => ({
            property_id: property.id,
            listing_type: 'property',
            url,
            alt_text: `${importedData.name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          }));
          const { error: imgErr } = await supabase.from('wb_images').insert(imageRows);
          if (imgErr) throw imgErr;
        }

        setCreatedId(property.id);
      } else {
        // Create boat from imported data — reuse the slug computed above
        const { data: boat, error: boatError } = await supabase
          .from('wb_boats')
          .insert({
            owner_id: user.id,
            name: importedData.name,
            slug,
            description: importedData.description,
            boat_type: importedData.boat_type || 'sport_fisher',
            length_ft: importedData.length_ft,
            capacity: importedData.capacity || 6,
            crew_size: importedData.crew_size || 2,
            captain_name: importedData.captain_name,
            captain_bio: importedData.captain_bio,
            target_species: importedData.target_species || [],
            fishing_techniques: importedData.fishing_techniques || [],
            departure_point: 'Watamu Marine Park Jetty',
            currency: 'KES',
            cancellation_policy: 'moderate',
            is_published: false,
            status: 'pending_review',
            source_url: importedData.source_url || url.trim(),
            import_source: importSourceTag,
          })
          .select('id')
          .single();

        if (boatError) throw boatError;

        // Insert trip packages
        if (importedData.trips?.length > 0) {
          const tripRows = importedData.trips
            .filter((t: any) => t.name)
            .map((t: any, i: number) => ({
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
              sort_order: i,
            }));
          const { error: tripErr } = await supabase.from('wb_boat_trips').insert(tripRows);
          if (tripErr) throw tripErr;
        }

        // Insert images — surface errors instead of silently orphaning the boat.
        if (importedData.images?.length > 0) {
          const imageRows = importedData.images.map((url: string, i: number) => ({
            boat_id: boat.id,
            listing_type: 'boat',
            url,
            alt_text: `${importedData.name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          }));
          const { error: imgErr } = await supabase.from('wb_images').insert(imageRows);
          if (imgErr) throw imgErr;
        }

        setCreatedId(boat.id);
      }

      setStep('done');
      toast.success('Listing imported successfully!');
    } catch (err: any) {
      setError(err.message);
      setStep('preview');
      toast.error('Failed to save listing');
    }
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
                  <p className="text-sm font-medium text-gray-900 mb-2">What is this listing?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAiKind('property')}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        aiKind === 'property'
                          ? 'border-teal-600 bg-white text-teal-700 ring-1 ring-teal-600'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Property / stay
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
                      Boat charter
                    </button>
                  </div>
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

      {/* Step 3: Preview imported data */}
      {step === 'preview' && importedData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Review Imported Data</h2>
            <button
              type="button"
              onClick={() => { setStep('url'); setImportedData(null); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Try another URL
            </button>
          </div>

          {/* Image preview */}
          {importedData.images?.length > 0 && (
            <div className="grid grid-cols-4 gap-2 rounded-xl overflow-hidden">
              {importedData.images.slice(0, 4).map((img: string, i: number) => (
                <div
                  key={i}
                  className={`relative aspect-video ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
                >
                  <img
                    src={img}
                    alt={`Imported ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {i === 0 && (
                    <span className="absolute top-2 left-2 bg-white/90 px-2 py-0.5 rounded text-xs font-medium text-gray-700">
                      Cover
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {importedData.images?.length > 4 && (
            <p className="text-xs text-gray-500">
              + {importedData.images.length - 4} more photos will be imported
            </p>
          )}

          {/* Details */}
          <Card className="p-5">
            <h3 className="text-xl font-bold text-gray-900 mb-1">{importedData.name || 'Untitled'}</h3>
            <p className="text-sm text-gray-600 mb-4 line-clamp-3">{importedData.description}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {(source === 'airbnb' ||
                source === 'booking' ||
                (source === 'ai' && aiKind === 'property')) && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Type</p>
                    <p className="font-medium text-gray-900 capitalize">{importedData.property_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Price</p>
                    <p className="font-medium text-gray-900">
                      {importedData.price_per_night
                        ? `${importedData.currency} ${importedData.price_per_night}/night`
                        : 'Not detected'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Guests</p>
                    <p className="font-medium text-gray-900">{importedData.max_guests || 'Not detected'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Bedrooms</p>
                    <p className="font-medium text-gray-900">{importedData.bedrooms || 'Not detected'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Location</p>
                    <p className="font-medium text-gray-900">{importedData.city || 'Watamu'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Rating</p>
                    <p className="font-medium text-gray-900">
                      {importedData.rating ? `${importedData.rating} (${importedData.review_count} reviews)` : 'Not detected'}
                    </p>
                  </div>
                </>
              )}

              {(source === 'fishingbooker' ||
                (source === 'ai' && aiKind === 'boat')) && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Boat Type</p>
                    <p className="font-medium text-gray-900 capitalize">{importedData.boat_type?.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Length</p>
                    <p className="font-medium text-gray-900">{importedData.length_ft ? `${importedData.length_ft} ft` : 'Not detected'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Capacity</p>
                    <p className="font-medium text-gray-900">{importedData.capacity ? `${importedData.capacity} people` : 'Not detected'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Captain</p>
                    <p className="font-medium text-gray-900">{importedData.captain_name || 'Not detected'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Rating</p>
                    <p className="font-medium text-gray-900">
                      {importedData.rating ? `${importedData.rating} (${importedData.review_count} reviews)` : 'Not detected'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Trip Packages</p>
                    <p className="font-medium text-gray-900">{importedData.trips?.length || 0} found</p>
                  </div>
                </>
              )}
            </div>

            {/* Trip packages for boats */}
            {(source === 'fishingbooker' || (source === 'ai' && aiKind === 'boat')) &&
              importedData.trips?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Trip Packages</p>
                <div className="space-y-2">
                  {importedData.trips.map((trip: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
                      <span className="text-gray-900">{trip.name}</span>
                      <span className="font-medium text-teal-700">
                        {trip.price_total > 0 ? `$${trip.price_total}` : 'Price TBD'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Target species */}
            {importedData.target_species?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Target Species Detected</p>
                <div className="flex flex-wrap gap-1.5">
                  {importedData.target_species.map((species: string) => (
                    <span key={species} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">
                      {species}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-900">Your listing will be submitted for review</p>
                <p className="text-xs text-amber-700 mt-1">
                  Imported listings are reviewed by our team to verify ownership before going live.
                  You can edit details, add photos, and adjust pricing while you wait.
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
            <Button variant="outline" onClick={() => { setStep('url'); setImportedData(null); }} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1">
              Submit for Review
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Saving */}
      {step === 'saving' && (
        <Card className="p-12 text-center">
          <svg className="animate-spin h-10 w-10 text-teal-600 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-700 font-medium">Creating your listing...</p>
          <p className="text-sm text-gray-500 mt-1">Importing photos and details</p>
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Import Complete!</h2>
          <p className="text-gray-600 mb-6">
            Your listing has been submitted for review. Our team will verify ownership and approve it shortly. You can edit details in the meantime.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setStep('choose');
                setSource(null);
                setUrl('');
                setAiKey('');
                setImportedData(null);
                setCreatedId(null);
                setError(null);
              }}
            >
              Import Another
            </Button>
            <Button
              onClick={() => {
                const kind = resolveKind();
                if (kind === 'property') {
                  router.push(`/dashboard/properties/${createdId}`);
                } else {
                  router.push(`/dashboard/boats/${createdId}`);
                }
              }}
            >
              Edit Listing
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

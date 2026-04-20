'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import toast from 'react-hot-toast';

/**
 * AI Import Wizard
 *
 * One box. Paste any listing URL — Airbnb, Booking.com, FishingBooker, Vrbo,
 * your own Wix / Squarespace / WordPress site, or anything else with a
 * reasonable OpenGraph + JSON-LD footprint — and we extract name, photos,
 * description, pricing, amenities, location, and auto-detect whether it's a
 * property or a boat listing.
 *
 * Frontend picks the right API endpoint based on the hostname:
 *   airbnb.*          → /api/import/airbnb
 *   fishingbooker.com → /api/import/fishingbooker
 *   booking.com       → /api/import/booking-com
 *   anything else     → /api/import/generic  (sends optional listing_type hint)
 */

type Step = 'url' | 'preview' | 'saving' | 'done';
type DetectedSource = 'airbnb' | 'fishingbooker' | 'booking_com' | 'generic';
type ListingType = 'property' | 'boat' | null;

function detectSourceFromUrl(rawUrl: string): DetectedSource | null {
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    if (/(^|\.)airbnb\.[a-z.]+$/.test(host)) return 'airbnb';
    if (/(^|\.)fishingbooker\.com$/.test(host)) return 'fishingbooker';
    if (/(^|\.)booking\.com$/.test(host)) return 'booking_com';
    return 'generic';
  } catch {
    return null;
  }
}

function endpointFor(source: DetectedSource): string {
  switch (source) {
    case 'airbnb': return '/api/import/airbnb';
    case 'fishingbooker': return '/api/import/fishingbooker';
    case 'booking_com': return '/api/import/booking-com';
    case 'generic': return '/api/import/generic';
  }
}

function sourceLabel(source: DetectedSource): string {
  switch (source) {
    case 'airbnb': return 'Airbnb';
    case 'fishingbooker': return 'FishingBooker';
    case 'booking_com': return 'Booking.com';
    case 'generic': return 'that website';
  }
}

export default function ImportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importedData, setImportedData] = useState<any>(null);
  const [detectedSource, setDetectedSource] = useState<DetectedSource | null>(null);
  const [listingType, setListingType] = useState<ListingType>(null);
  // listingTypeHint is the user-forced type for generic imports — it tells the
  // generic scraper not to auto-classify. Null = let the scraper decide.
  const [listingTypeHint, setListingTypeHint] = useState<'property' | 'boat' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function handleImport() {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError('Please paste a listing URL');
      return;
    }

    const source = detectSourceFromUrl(cleanUrl);
    if (!source) {
      setError('That doesn\u2019t look like a valid https:// URL. Double-check it and try again.');
      return;
    }

    setLoading(true);
    setError(null);
    setDetectedSource(source);

    try {
      const endpoint = endpointFor(source);
      const body: Record<string, any> = { url: cleanUrl };
      if (source === 'generic' && listingTypeHint) {
        body.listing_type = listingTypeHint;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Import failed');
      }

      setImportedData(result.data);
      // Fixed-source endpoints return property/boat implicitly based on the
      // endpoint; generic returns it explicitly. Default from the source.
      const resolvedListingType: 'property' | 'boat' =
        result.listing_type
          ? result.listing_type
          : source === 'fishingbooker'
            ? 'boat'
            : 'property';
      setListingType(resolvedListingType);
      setStep('preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!user || !importedData || !listingType || !detectedSource) return;

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

    // import_source stamped on the listing row so the audit trail shows where
    // the draft came from. Dashes → underscores for DB readability.
    const importSourceTag = detectedSource.replace(/-/g, '_');

    try {
      const supabase = createClient();

      if (listingType === 'property') {
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

        if (importedData.images?.length > 0) {
          const imageRows = importedData.images.map((imgUrl: string, i: number) => ({
            property_id: property.id,
            listing_type: 'property',
            url: imgUrl,
            alt_text: `${importedData.name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          }));
          const { error: imgErr } = await supabase.from('wb_images').insert(imageRows);
          if (imgErr) throw imgErr;
        }

        setCreatedId(property.id);
      } else {
        // Boat — reuse the slug computed above.
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

        if (importedData.images?.length > 0) {
          const imageRows = importedData.images.map((imgUrl: string, i: number) => ({
            boat_id: boat.id,
            listing_type: 'boat',
            url: imgUrl,
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

  function resetAll() {
    setStep('url');
    setUrl('');
    setImportedData(null);
    setDetectedSource(null);
    setListingType(null);
    setListingTypeHint(null);
    setError(null);
    setCreatedId(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Import Wizard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste any listing URL. We&apos;ll read the page and draft a new listing for you — photos, description, pricing, and location — which you can review and edit before publishing.
        </p>
      </div>

      {/* Step 1: URL entry */}
      {step === 'url' && (
        <Card className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Listing URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.airbnb.com/rooms/12345678  —  or any other URL"
              className="text-base"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-2">
              Works best with Airbnb, Booking.com, FishingBooker, Vrbo, and well-built hotel / charter websites (OpenGraph + structured data). JavaScript-only sites may return incomplete results.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Is this listing a property or a boat?</p>
            <div className="inline-flex rounded-lg border border-gray-200 p-1 text-sm">
              <button
                type="button"
                onClick={() => setListingTypeHint(null)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  listingTypeHint === null ? 'bg-teal-600 text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Auto-detect
              </button>
              <button
                type="button"
                onClick={() => setListingTypeHint('property')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  listingTypeHint === 'property' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Property
              </button>
              <button
                type="button"
                onClick={() => setListingTypeHint('boat')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  listingTypeHint === 'boat' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Boat charter
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Auto-detect looks for fishing/charter keywords; override if it picks the wrong type.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={loading || !url.trim()}
            className="w-full"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Reading the page...
              </span>
            ) : (
              'Import Listing'
            )}
          </Button>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && importedData && detectedSource && listingType && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Review imported data</h2>
              <p className="text-xs text-gray-500">
                Imported from {sourceLabel(detectedSource)} as a {listingType === 'boat' ? 'boat charter' : 'property'}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setStep('url'); setImportedData(null); setDetectedSource(null); setListingType(null); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Try another URL
            </button>
          </div>

          {importedData.images?.length > 0 && (
            <div className="grid grid-cols-4 gap-2 rounded-xl overflow-hidden">
              {importedData.images.slice(0, 4).map((img: string, i: number) => (
                <div
                  key={i}
                  className={`relative aspect-video ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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

          <Card className="p-5">
            <h3 className="text-xl font-bold text-gray-900 mb-1">{importedData.name || 'Untitled'}</h3>
            <p className="text-sm text-gray-600 mb-4 line-clamp-3 whitespace-pre-wrap">{importedData.description}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {listingType === 'property' && (
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

              {listingType === 'boat' && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Boat type</p>
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
                    <p className="text-xs text-gray-500">Trip packages</p>
                    <p className="font-medium text-gray-900">{importedData.trips?.length || 0} found</p>
                  </div>
                </>
              )}
            </div>

            {listingType === 'boat' && importedData.trips?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Trip packages</p>
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

            {importedData.target_species?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Target species detected</p>
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
              Submit for review
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Saving */}
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

      {/* Step 4: Done */}
      {step === 'done' && (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Import complete!</h2>
          <p className="text-gray-600 mb-6">
            Your listing has been submitted for review. Our team will verify ownership and approve it shortly. You can edit details in the meantime.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={resetAll}>
              Import another
            </Button>
            <Button
              onClick={() => {
                if (listingType === 'property') {
                  router.push(`/dashboard/properties/${createdId}`);
                } else {
                  router.push(`/dashboard/boats/${createdId}`);
                }
              }}
            >
              Edit listing
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

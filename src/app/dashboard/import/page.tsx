'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import toast from 'react-hot-toast';

type ImportSource = 'airbnb' | 'fishingbooker' | null;
type Step = 'choose' | 'url' | 'preview' | 'saving' | 'done';

export default function ImportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [source, setSource] = useState<ImportSource>(null);
  const [step, setStep] = useState<Step>('choose');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importedData, setImportedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function handleImport() {
    if (!url.trim()) {
      setError('Please paste a listing URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = source === 'airbnb'
        ? '/api/import/airbnb'
        : '/api/import/fishingbooker';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Import failed');
      }

      setImportedData(result.data);
      setStep('preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!user || !importedData) return;
    setStep('saving');

    try {
      const supabase = createClient();

      if (source === 'airbnb') {
        // Create property from imported data
        const slug = importedData.name
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/^-+|-+$/g, '');

        const { data: property, error: propError } = await supabase
          .from('wb_properties')
          .insert({
            owner_id: user.id,
            title: importedData.name,
            slug,
            description: importedData.description,
            property_type: importedData.property_type || 'house',
            address: importedData.address || '',
            city: importedData.city || 'Watamu',
            latitude: importedData.latitude,
            longitude: importedData.longitude,
            price_per_night: importedData.price_per_night || 0,
            currency: importedData.currency || 'KES',
            max_guests: importedData.max_guests || 2,
            bedrooms: importedData.bedrooms || 1,
            bathrooms: importedData.bathrooms || 1,
            cancellation_policy: 'moderate',
            is_published: false,
            status: 'draft',
          })
          .select('id')
          .single();

        if (propError) throw propError;

        // Insert images
        if (importedData.images?.length > 0) {
          const imageRows = importedData.images.map((url: string, i: number) => ({
            property_id: property.id,
            listing_type: 'property',
            url,
            alt_text: `${importedData.name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          }));
          await supabase.from('wb_images').insert(imageRows);
        }

        setCreatedId(property.id);
      } else {
        // Create boat from imported data
        const slug = importedData.name
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/^-+|-+$/g, '');

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
            status: 'draft',
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
          await supabase.from('wb_boat_trips').insert(tripRows);
        }

        // Insert images
        if (importedData.images?.length > 0) {
          const imageRows = importedData.images.map((url: string, i: number) => ({
            boat_id: boat.id,
            listing_type: 'boat',
            url,
            alt_text: `${importedData.name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          }));
          await supabase.from('wb_images').insert(imageRows);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
      )}

      {/* Step 2: Enter URL */}
      {step === 'url' && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => { setStep('choose'); setSource(null); setUrl(''); setError(null); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              Paste your {source === 'airbnb' ? 'Airbnb' : 'FishingBooker'} listing URL
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  source === 'airbnb'
                    ? 'https://www.airbnb.com/rooms/12345678'
                    : 'https://www.fishingbooker.com/charter/12345'
                }
                className="text-base"
              />
              <p className="text-xs text-gray-500 mt-2">
                {source === 'airbnb'
                  ? 'Go to your Airbnb listing page and copy the URL from your browser.'
                  : 'Go to your FishingBooker charter page and copy the URL from your browser.'}
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
                  Importing...
                </span>
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
              {source === 'airbnb' && (
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

              {source === 'fishingbooker' && (
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
            {source === 'fishingbooker' && importedData.trips?.length > 0 && (
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
                <p className="text-sm font-medium text-amber-900">Your listing will be saved as a draft</p>
                <p className="text-xs text-amber-700 mt-1">
                  You can edit all details, add more photos, and adjust pricing before publishing.
                  Missing fields (marked &quot;Not detected&quot;) can be filled in manually.
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
              Import as Draft
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
            Your listing has been created as a draft. You can now edit details, add more photos, and publish when ready.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setStep('choose');
                setSource(null);
                setUrl('');
                setImportedData(null);
                setCreatedId(null);
              }}
            >
              Import Another
            </Button>
            <Button
              onClick={() => {
                if (source === 'airbnb') {
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

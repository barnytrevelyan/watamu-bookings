'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import toast from 'react-hot-toast';

/**
 * AI Import Wizard — `/dashboard/import`
 *
 * One box. Paste any listing URL and we draft a new property or boat listing
 * from the page. Dedicated scrapers handle Airbnb / Booking.com / FishingBooker
 * (no AI tokens consumed). Anything else goes through the generic LLM scraper.
 *
 * Host routing (frontend):
 *   airbnb.*          → /api/import/airbnb
 *   fishingbooker.com → /api/import/fishingbooker
 *   booking.com       → /api/import/booking-com
 *   anything else     → /api/import/generic  (passes optional listing_type hint)
 *
 * After the page is extracted the user lands in a fully-editable preview:
 * edit name / description / pricing / capacity / amenities / house rules,
 * deselect unwanted photos, and submit for review. All scraper sources
 * produce compatible shapes so the preview treats them uniformly.
 */

type Step = 'url' | 'picker' | 'preview' | 'saving' | 'done';
type DetectedSource = 'airbnb' | 'fishingbooker' | 'booking_com' | 'generic';
type ListingType = 'property' | 'boat';

const PROPERTY_TYPES = ['villa', 'apartment', 'cottage', 'house', 'hotel', 'guesthouse', 'banda', 'penthouse'] as const;
const BOAT_TYPES = ['sport_fisher', 'catamaran', 'dhow', 'yacht', 'sailboat', 'speedboat'] as const;
const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict', 'non_refundable'] as const;
const TRIP_TYPES = ['half_day', 'half_day_morning', 'half_day_afternoon', 'full_day', 'overnight', 'multi_day', 'sunset_cruise'] as const;
const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP', 'TZS', 'UGX'] as const;

interface ImportedTrip {
  name: string;
  duration_hours: number | null;
  price_total: number | null;
  price_per_person: number | null;
  trip_type: string;
  departure_time: string | null;
  description?: string;
  includes?: string[];
  target_species?: string[];
}

// Unified preview state — superset of the fields any scraper returns. Unknown
// fields stay null/[] for scrapers that don't produce them (e.g. Airbnb won't
// return amenities yet; generic will).
interface PreviewState {
  // common
  name: string;
  description: string;
  images: string[];              // curated (deselections applied)
  allImages: string[];           // full scraped list (for reselection)
  sourceUrl: string;
  rating: number | null;
  reviewCount: number | null;

  // property-only
  propertyType: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  pricePerNight: number | null;
  currency: string;
  maxGuests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  amenities: string[];
  houseRules: string[];
  checkInTime: string | null;
  checkOutTime: string | null;
  minNights: number | null;
  maxNights: number | null;
  cleaningFee: number | null;
  securityDeposit: number | null;
  cancellationPolicy: string | null;

  // boat-only
  boatType: string;
  lengthFt: number | null;
  capacity: number | null;
  crewSize: number | null;
  captainName: string | null;
  captainBio: string | null;
  captainExperienceYears: number | null;
  targetSpecies: string[];
  fishingTechniques: string[];
  trips: ImportedTrip[];
  departurePoint: string | null;
}

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

function sourceUsesAI(source: DetectedSource): boolean {
  return source === 'generic';
}

function buildPreview(raw: any, listingType: ListingType, sourceUrl: string): PreviewState {
  const imgs: string[] = Array.isArray(raw.images) ? raw.images.filter((s: any) => typeof s === 'string') : [];
  return {
    name: String(raw.name || '').trim(),
    description: String(raw.description || '').trim(),
    images: imgs.slice(),
    allImages: imgs.slice(),
    sourceUrl: raw.source_url || sourceUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    reviewCount: typeof raw.review_count === 'number' ? raw.review_count : null,

    propertyType: raw.property_type || 'house',
    address: raw.address || '',
    city: raw.city || 'Watamu',
    latitude: typeof raw.latitude === 'number' ? raw.latitude : null,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : null,
    pricePerNight: typeof raw.price_per_night === 'number' ? raw.price_per_night : null,
    currency: (raw.currency || 'KES').toString().toUpperCase(),
    maxGuests: typeof raw.max_guests === 'number' ? raw.max_guests : null,
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : null,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : null,
    beds: typeof raw.beds === 'number' ? raw.beds : null,
    amenities: Array.isArray(raw.amenities) ? raw.amenities.filter((s: any) => typeof s === 'string') : [],
    houseRules: Array.isArray(raw.house_rules) ? raw.house_rules.filter((s: any) => typeof s === 'string') : [],
    checkInTime: raw.check_in_time ?? null,
    checkOutTime: raw.check_out_time ?? null,
    minNights: typeof raw.min_nights === 'number' ? raw.min_nights : null,
    maxNights: typeof raw.max_nights === 'number' ? raw.max_nights : null,
    cleaningFee: typeof raw.cleaning_fee === 'number' ? raw.cleaning_fee : null,
    securityDeposit: typeof raw.security_deposit === 'number' ? raw.security_deposit : null,
    cancellationPolicy: raw.cancellation_policy ?? null,

    boatType: raw.boat_type || 'sport_fisher',
    lengthFt: typeof raw.length_ft === 'number' ? raw.length_ft : null,
    capacity: typeof raw.capacity === 'number' ? raw.capacity : null,
    crewSize: typeof raw.crew_size === 'number' ? raw.crew_size : null,
    captainName: raw.captain_name ?? null,
    captainBio: raw.captain_bio ?? null,
    captainExperienceYears: typeof raw.captain_experience_years === 'number' ? raw.captain_experience_years : null,
    targetSpecies: Array.isArray(raw.target_species) ? raw.target_species.filter((s: any) => typeof s === 'string') : [],
    fishingTechniques: Array.isArray(raw.fishing_techniques) ? raw.fishing_techniques.filter((s: any) => typeof s === 'string') : [],
    trips: Array.isArray(raw.trips) ? raw.trips.filter((t: any) => t && typeof t.name === 'string') : [],
    departurePoint: raw.departure_point ?? 'Watamu Marine Park Jetty',
  };
}

function slugify(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  const base = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'listing'}-${suffix}`;
}

export default function ImportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Reading the page…');
  const [detectedSource, setDetectedSource] = useState<DetectedSource | null>(null);
  const [listingType, setListingType] = useState<ListingType | null>(null);
  const [listingTypeHint, setListingTypeHint] = useState<'property' | 'boat' | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [amenityDraft, setAmenityDraft] = useState('');
  const [ruleDraft, setRuleDraft] = useState('');

  // Multi-listing discovery state — populated only for generic URLs when
  // /api/import/discover finds 2+ distinct listings on the same site.
  // Clicking a card in the picker step opens that listing in the preview
  // step; "Back to picker" preserves the list so the host can come back and
  // import a second (or third) listing from the same source.
  const [discovered, setDiscovered] = useState<any[] | null>(null);
  const [discoveredImportedSlugs, setDiscoveredImportedSlugs] = useState<Set<number>>(new Set());

  // Rotating loading messages while the import runs. Short, truthful, and tied
  // to the actual stages (fetch → parse / LLM → return). For AI imports we tell
  // the user it's thinking, because gpt-4o on a big page can take 10–15s.
  useEffect(() => {
    if (!loading) return;
    const usesAi = detectedSource === 'generic';
    const seq = usesAi
      ? [
          'Fetching the page…',
          'Looking for other listings on the site…',
          'Asking the AI to separate each listing…',
          'Almost there — picking photos…',
        ]
      : ['Fetching the page…', 'Parsing listing data…', 'Picking photos…'];
    let i = 0;
    setLoadingMessage(seq[0]);
    const id = setInterval(() => {
      i = Math.min(i + 1, seq.length - 1);
      setLoadingMessage(seq[i]);
    }, 2500);
    return () => clearInterval(id);
  }, [loading, detectedSource]);

  async function handleImport() {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError('Please paste a listing URL');
      return;
    }

    // Wait for the auth session to finish loading before firing the request —
    // otherwise the cookies can race and the server returns 401.
    if (authLoading || !user) {
      setError('Still signing you in — give it a second and try again.');
      return;
    }

    const source = detectSourceFromUrl(cleanUrl);
    if (!source) {
      setError('That doesn’t look like a valid https:// URL. Double-check it and try again.');
      return;
    }

    setLoading(true);
    setError(null);
    setDetectedSource(source);
    setDiscovered(null);
    setDiscoveredImportedSlugs(new Set());

    try {
      // Generic URLs go through multi-listing discovery — a lot of small
      // operators advertise 2+ listings on one site (e.g. a lodge with
      // cottages AND a fishing boat). The fixed-host scrapers always describe
      // a single listing so they skip discovery entirely.
      if (source === 'generic') {
        const res = await fetch('/api/import/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: cleanUrl }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Import failed');

        let listings: any[] = Array.isArray(result.listings) ? result.listings : [];

        // If the user hinted a type, filter down so we only show relevant
        // matches — but keep the full list as a fallback if the filter empties it.
        if (listingTypeHint) {
          const filtered = listings.filter((l) => l.listing_type === listingTypeHint);
          if (filtered.length > 0) listings = filtered;
        }

        if (listings.length === 0) {
          throw new Error('Could not identify any listings on that page. It may be JavaScript-only or require login. Try pasting a specific listing URL instead.');
        }

        if (listings.length === 1) {
          const only = listings[0];
          const resolvedType: ListingType = only.listing_type === 'boat' ? 'boat' : 'property';
          setListingType(resolvedType);
          setPreview(buildPreview(only, resolvedType, only.source_url || cleanUrl));
          setStep('preview');
          return;
        }

        // 2+ listings — offer a picker.
        setDiscovered(listings);
        setStep('picker');
        return;
      }

      // Fixed-host scrapers — single listing assumed.
      const endpoint = endpointFor(source);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');

      const resolvedListingType: ListingType =
        result.listing_type
          ? (result.listing_type === 'boat' ? 'boat' : 'property')
          : source === 'fishingbooker'
            ? 'boat'
            : 'property';

      setListingType(resolvedListingType);
      setPreview(buildPreview(result.data, resolvedListingType, cleanUrl));
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  // Move from picker → preview for one of the discovered listings.
  function pickDiscoveredListing(idx: number) {
    if (!discovered) return;
    const item = discovered[idx];
    if (!item) return;
    const resolvedType: ListingType = item.listing_type === 'boat' ? 'boat' : 'property';
    setListingType(resolvedType);
    setPreview(buildPreview(item, resolvedType, item.source_url || url));
    setError(null);
    setStep('preview');
  }

  function backToPicker() {
    setPreview(null);
    setListingType(null);
    setError(null);
    setStep('picker');
  }

  async function handleSave() {
    if (!user || !preview || !listingType || !detectedSource) return;

    const name = preview.name.trim();
    if (!name) {
      setError('Please give the listing a name before saving.');
      return;
    }
    if (/^(404|Not Found|Page Not Found|Access Denied)$/i.test(name)) {
      setError('That name looks like a scrape error — please edit it before saving.');
      return;
    }
    if (preview.images.length === 0) {
      setError('Please keep at least one photo before saving.');
      return;
    }

    setError(null);
    setStep('saving');

    const slug = slugify(name);
    const importSourceTag = detectedSource.replace(/-/g, '_');

    try {
      const supabase = createClient();
      let newId: string | null = null;

      if (listingType === 'property') {
        // Join house_rules back into a single text field (wb_properties.house_rules is TEXT, not array).
        const houseRulesText = preview.houseRules.filter(Boolean).join('\n');
        const { data: property, error: propError } = await supabase
          .from('wb_properties')
          .insert({
            owner_id: user.id,
            name,
            slug,
            description: preview.description,
            property_type: preview.propertyType || 'house',
            address: preview.address || '',
            city: preview.city || 'Watamu',
            county: 'Kilifi',
            country: 'Kenya',
            latitude: preview.latitude,
            longitude: preview.longitude,
            base_price_per_night: preview.pricePerNight ?? 0,
            currency: preview.currency || 'KES',
            max_guests: preview.maxGuests ?? 2,
            bedrooms: preview.bedrooms ?? 1,
            bathrooms: preview.bathrooms ?? 1,
            check_in_time: preview.checkInTime,
            check_out_time: preview.checkOutTime,
            cancellation_policy: preview.cancellationPolicy || 'moderate',
            house_rules: houseRulesText || null,
            cleaning_fee: preview.cleaningFee,
            is_published: false,
            status: 'pending_review',
            source_url: preview.sourceUrl,
            import_source: importSourceTag,
          })
          .select('id')
          .single();
        if (propError) throw propError;

        if (preview.images.length > 0) {
          const imageRows = preview.images.map((imgUrl, i) => ({
            property_id: property.id,
            listing_type: 'property',
            url: imgUrl,
            alt_text: `${name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          }));
          const { error: imgErr } = await supabase.from('wb_images').insert(imageRows);
          if (imgErr) throw imgErr;
        }

        newId = property.id;
        setCreatedId(property.id);
      } else {
        const { data: boat, error: boatError } = await supabase
          .from('wb_boats')
          .insert({
            owner_id: user.id,
            name,
            slug,
            description: preview.description,
            boat_type: preview.boatType || 'sport_fisher',
            length_ft: preview.lengthFt,
            capacity: preview.capacity ?? 6,
            crew_size: preview.crewSize ?? 2,
            captain_name: preview.captainName,
            captain_bio: preview.captainBio,
            captain_experience_years: preview.captainExperienceYears,
            target_species: preview.targetSpecies,
            fishing_techniques: preview.fishingTechniques,
            departure_point: preview.departurePoint || 'Watamu Marine Park Jetty',
            currency: preview.currency || 'KES',
            cancellation_policy: preview.cancellationPolicy || 'moderate',
            is_published: false,
            status: 'pending_review',
            source_url: preview.sourceUrl,
            import_source: importSourceTag,
          })
          .select('id')
          .single();
        if (boatError) throw boatError;

        if (preview.trips.length > 0) {
          const tripRows = preview.trips
            .filter((t) => t.name && t.name.trim())
            .map((t, i) => ({
              boat_id: boat.id,
              name: t.name,
              trip_type: TRIP_TYPES.includes(t.trip_type as any) ? t.trip_type : 'half_day',
              duration_hours: t.duration_hours ?? 4,
              price_total: t.price_total ?? 0,
              price_per_person: t.price_per_person,
              departure_time: t.departure_time,
              includes: t.includes || [],
              target_species: t.target_species || [],
              seasonal_months: [],
              sort_order: i,
            }));
          if (tripRows.length > 0) {
            const { error: tripErr } = await supabase.from('wb_boat_trips').insert(tripRows);
            if (tripErr) throw tripErr;
          }
        }

        if (preview.images.length > 0) {
          const imageRows = preview.images.map((imgUrl, i) => ({
            boat_id: boat.id,
            listing_type: 'boat',
            url: imgUrl,
            alt_text: `${name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          }));
          const { error: imgErr } = await supabase.from('wb_images').insert(imageRows);
          if (imgErr) throw imgErr;
        }

        newId = boat.id;
        setCreatedId(boat.id);
      }

      toast.success('Submitted for review — you can keep editing while we check it');

      // If this import came from multi-listing discovery AND there are
      // still unsaved listings on the source site, steer the host back to
      // the picker so they can import the next one without re-scraping.
      // Otherwise, land them on the listing edit page.
      const importedIdx = discovered
        ? discovered.findIndex(
            (d) => d.listing_type === listingType && d.name?.trim() === preview.name.trim()
          )
        : -1;
      const willHaveMore =
        discovered !== null &&
        discovered.length > 1 &&
        discovered.some(
          (_, i) =>
            i !== importedIdx &&
            !discoveredImportedSlugs.has(i)
        );

      if (willHaveMore) {
        backToPickerAfterSave();
      } else if (newId) {
        router.push(listingType === 'property' ? `/dashboard/properties/${newId}` : `/dashboard/boats/${newId}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save listing');
      setStep('preview');
      toast.error('Failed to save listing');
    }
  }

  function resetAll() {
    setStep('url');
    setUrl('');
    setPreview(null);
    setDetectedSource(null);
    setListingType(null);
    setListingTypeHint(null);
    setError(null);
    setCreatedId(null);
    setDiscovered(null);
    setDiscoveredImportedSlugs(new Set());
  }

  // If a host just imported one listing from a multi-listing source, they
  // usually want to grab another — so go back to the picker instead of
  // navigating away. The imported one gets a green tick.
  function backToPickerAfterSave() {
    if (!discovered || !preview) return;
    // Identify which discovered item was just saved by matching name + type.
    const idx = discovered.findIndex(
      (d) => d.listing_type === listingType && d.name?.trim() === preview.name.trim()
    );
    if (idx >= 0) {
      setDiscoveredImportedSlugs((prev) => {
        const next = new Set(prev);
        next.add(idx);
        return next;
      });
    }
    setPreview(null);
    setListingType(null);
    setCreatedId(null);
    setError(null);
    setStep('picker');
  }

  // ---------- preview mutators ----------
  function updatePreview(patch: Partial<PreviewState>) {
    setPreview((p) => (p ? { ...p, ...patch } : p));
  }

  function toggleImage(imgUrl: string) {
    setPreview((p) => {
      if (!p) return p;
      const selected = new Set(p.images);
      if (selected.has(imgUrl)) selected.delete(imgUrl);
      else selected.add(imgUrl);
      // preserve the original scraped order
      const newImages = p.allImages.filter((u) => selected.has(u));
      return { ...p, images: newImages };
    });
  }

  function addAmenity() {
    const v = amenityDraft.trim().toLowerCase();
    if (!v) return;
    setPreview((p) => (p && !p.amenities.includes(v) ? { ...p, amenities: [...p.amenities, v] } : p));
    setAmenityDraft('');
  }

  function removeAmenity(a: string) {
    setPreview((p) => (p ? { ...p, amenities: p.amenities.filter((x) => x !== a) } : p));
  }

  function addRule() {
    const v = ruleDraft.trim();
    if (!v) return;
    setPreview((p) => (p && !p.houseRules.includes(v) ? { ...p, houseRules: [...p.houseRules, v] } : p));
    setRuleDraft('');
  }

  function removeRule(r: string) {
    setPreview((p) => (p ? { ...p, houseRules: p.houseRules.filter((x) => x !== r) } : p));
  }

  function updateTrip(idx: number, patch: Partial<ImportedTrip>) {
    setPreview((p) => {
      if (!p) return p;
      const trips = p.trips.map((t, i) => (i === idx ? { ...t, ...patch } : t));
      return { ...p, trips };
    });
  }

  function removeTrip(idx: number) {
    setPreview((p) => (p ? { ...p, trips: p.trips.filter((_, i) => i !== idx) } : p));
  }

  function addTrip() {
    setPreview((p) =>
      p
        ? {
            ...p,
            trips: [
              ...p.trips,
              {
                name: 'New trip',
                duration_hours: 4,
                price_total: 0,
                price_per_person: null,
                trip_type: 'half_day',
                departure_time: null,
                description: '',
                includes: [],
                target_species: [],
              },
            ],
          }
        : p
    );
  }

  // Computed helpers.
  const unselectedCount = useMemo(
    () => (preview ? preview.allImages.length - preview.images.length : 0),
    [preview]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">AI Import Wizard</h1>
          <span className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">Beta</span>
        </div>
        <p className="text-sm text-gray-500">
          Paste any listing URL — Airbnb, Booking.com, FishingBooker, Vrbo, or your own site — and we’ll draft a listing for you with photos, description, pricing, amenities and location. Review and edit everything before it goes live.
        </p>
      </div>

      {/* Step 1: URL entry */}
      {step === 'url' && (
        <Card className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Listing URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.airbnb.com/rooms/12345678  —  or any other URL"
              className="text-base"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-2">
              Airbnb, Booking.com and FishingBooker use dedicated scrapers (no AI). Anything else is extracted with an AI model for best coverage of hotel and charter websites.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Is this a property or a boat?</p>
            <div className="inline-flex rounded-lg border border-gray-200 p-1 text-sm">
              {([
                ['Auto-detect', null],
                ['Property', 'property'],
                ['Boat charter', 'boat'],
              ] as const).map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setListingTypeHint(value)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    listingTypeHint === value ? 'bg-teal-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Only applies to generic URLs. Fixed-host scrapers already know the type.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <Button
            onClick={handleImport}
            disabled={authLoading || loading || !url.trim()}
            className="w-full"
          >
            {authLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing you in…
              </span>
            ) : loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {loadingMessage}
              </span>
            ) : (
              'Import Listing'
            )}
          </Button>
        </Card>
      )}

      {/* Step 1b: multi-listing picker (only for generic URLs when 2+ listings
          are discovered on the site). */}
      {step === 'picker' && discovered && (
        <div className="space-y-5">
          <Card className="p-5 bg-teal-50 border-teal-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  We found {discovered.length} listings on that site
                </h2>
                <p className="text-sm text-gray-700">
                  Pick one to review and edit. You can come back here afterwards to import the others.
                </p>
              </div>
              <button
                type="button"
                onClick={resetAll}
                className="text-sm text-gray-500 hover:text-gray-700 shrink-0"
              >
                ← Try another URL
              </button>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {discovered.map((item, idx) => {
              const imported = discoveredImportedSlugs.has(idx);
              const cover = Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null;
              const typeLabel = item.listing_type === 'boat' ? 'Boat charter' : 'Property';
              const subTypeLabel = item.listing_type === 'boat'
                ? (item.boat_type ? String(item.boat_type).replace(/_/g, ' ') : 'boat')
                : (item.property_type ? String(item.property_type) : 'property');
              const price = item.listing_type === 'property'
                ? (typeof item.price_per_night === 'number' ? `${item.currency || 'KES'} ${item.price_per_night.toLocaleString()} / night` : null)
                : (Array.isArray(item.trips) && item.trips.length > 0 && typeof item.trips[0]?.price_total === 'number'
                    ? `from ${item.currency || 'KES'} ${item.trips[0].price_total.toLocaleString()}`
                    : null);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => pickDiscoveredListing(idx)}
                  className={`text-left rounded-lg border transition overflow-hidden ${
                    imported
                      ? 'border-emerald-400 bg-emerald-50/60'
                      : 'border-gray-200 bg-white hover:border-teal-400 hover:shadow-md'
                  }`}
                >
                  {cover ? (
                    <div className="aspect-video w-full overflow-hidden bg-gray-100 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt={item.name} className="w-full h-full object-cover" />
                      {imported && (
                        <div className="absolute inset-0 bg-emerald-900/40 flex items-center justify-center">
                          <span className="bg-white rounded-full p-2 shadow">
                            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-video w-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                      No photos detected
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        item.listing_type === 'boat'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-teal-100 text-teal-800'
                      }`}>
                        {typeLabel}
                      </span>
                      <span className="text-[11px] text-gray-500 capitalize">{subTypeLabel}</span>
                      {imported && (
                        <span className="ml-auto text-[11px] font-medium text-emerald-700">Imported ✓</span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 leading-snug">{item.name || 'Untitled listing'}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-600 line-clamp-3">{item.description}</p>
                    )}
                    {price && (
                      <p className="text-sm font-medium text-gray-900">{price}</p>
                    )}
                    <p className="text-[11px] text-gray-400 truncate">{item.source_url}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: editable preview */}
      {step === 'preview' && preview && detectedSource && listingType && (
        <div className="space-y-5">
          <Card className="p-4 bg-gray-50 flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-500">Imported from</span>{' '}
              <span className="font-medium text-gray-900">{sourceLabel(detectedSource)}</span>
              <span className="text-gray-500"> as </span>
              <span className="font-medium text-gray-900">{listingType === 'boat' ? 'a boat charter' : 'a property'}</span>
              {sourceUsesAI(detectedSource) && (
                <span className="ml-2 inline-flex items-center text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">AI-extracted</span>
              )}
            </div>
            {discovered && discovered.length > 1 ? (
              <button
                type="button"
                onClick={backToPicker}
                className="text-sm text-teal-700 hover:text-teal-900"
              >
                ← Back to {discovered.length} listings
              </button>
            ) : (
              <button
                type="button"
                onClick={resetAll}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Try another URL
              </button>
            )}
          </Card>

          {/* Image gallery — click to deselect; click again to re-select. */}
          {preview.allImages.length > 0 && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Photos</h2>
                  <p className="text-xs text-gray-500">
                    {preview.images.length} selected{unselectedCount > 0 ? ` · ${unselectedCount} hidden` : ''} · click a photo to toggle
                  </p>
                </div>
                {unselectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => updatePreview({ images: preview.allImages.slice() })}
                    className="text-xs text-teal-700 hover:text-teal-900 font-medium"
                  >
                    Restore all
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {preview.allImages.map((img, i) => {
                  const selected = preview.images.includes(img);
                  const coverSelected = preview.images[0] === img;
                  return (
                    <button
                      key={img + i}
                      type="button"
                      onClick={() => toggleImage(img)}
                      className={`relative aspect-video overflow-hidden rounded-lg border-2 transition ${
                        selected ? 'border-teal-500' : 'border-transparent opacity-40 hover:opacity-70'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      {coverSelected && (
                        <span className="absolute top-1.5 left-1.5 bg-white/95 px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-800 uppercase tracking-wide">
                          Cover
                        </span>
                      )}
                      {!selected && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium bg-black/30">
                          Hidden
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Core editable fields */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Listing details</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <Input
                value={preview.name}
                onChange={(e) => updatePreview({ name: e.target.value })}
                className="text-base font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={preview.description}
                onChange={(e) => updatePreview({ description: e.target.value })}
                rows={8}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">{preview.description.length.toLocaleString()} characters</p>
            </div>

            {listingType === 'property' ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Type">
                    <select
                      value={preview.propertyType}
                      onChange={(e) => updatePreview({ propertyType: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                    >
                      {PROPERTY_TYPES.map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Price / night">
                    <div className="flex gap-1.5">
                      <select
                        value={preview.currency}
                        onChange={(e) => updatePreview({ currency: e.target.value })}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm w-20"
                      >
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <NumberField
                        value={preview.pricePerNight}
                        onChange={(n) => updatePreview({ pricePerNight: n })}
                        placeholder="0"
                      />
                    </div>
                  </Field>
                  <Field label="Cleaning fee">
                    <NumberField value={preview.cleaningFee} onChange={(n) => updatePreview({ cleaningFee: n })} />
                  </Field>
                  <Field label="Max guests">
                    <NumberField value={preview.maxGuests} onChange={(n) => updatePreview({ maxGuests: n })} />
                  </Field>
                  <Field label="Bedrooms">
                    <NumberField value={preview.bedrooms} onChange={(n) => updatePreview({ bedrooms: n })} />
                  </Field>
                  <Field label="Bathrooms">
                    <NumberField value={preview.bathrooms} onChange={(n) => updatePreview({ bathrooms: n })} />
                  </Field>
                  <Field label="Beds">
                    <NumberField value={preview.beds} onChange={(n) => updatePreview({ beds: n })} />
                  </Field>
                  <Field label="Min nights">
                    <NumberField value={preview.minNights} onChange={(n) => updatePreview({ minNights: n })} />
                  </Field>
                  <Field label="Max nights">
                    <NumberField value={preview.maxNights} onChange={(n) => updatePreview({ maxNights: n })} />
                  </Field>
                  <Field label="Check-in">
                    <Input value={preview.checkInTime || ''} onChange={(e) => updatePreview({ checkInTime: e.target.value || null })} placeholder="14:00" />
                  </Field>
                  <Field label="Check-out">
                    <Input value={preview.checkOutTime || ''} onChange={(e) => updatePreview({ checkOutTime: e.target.value || null })} placeholder="11:00" />
                  </Field>
                  <Field label="Cancellation">
                    <select
                      value={preview.cancellationPolicy ?? ''}
                      onChange={(e) => updatePreview({ cancellationPolicy: e.target.value || null })}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {CANCELLATION_POLICIES.map((c) => (
                        <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Address">
                  <Input value={preview.address} onChange={(e) => updatePreview({ address: e.target.value })} placeholder="Street, area" />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="City">
                    <Input value={preview.city} onChange={(e) => updatePreview({ city: e.target.value })} />
                  </Field>
                  <Field label="Latitude">
                    <NumberField value={preview.latitude} onChange={(n) => updatePreview({ latitude: n })} allowDecimals />
                  </Field>
                  <Field label="Longitude">
                    <NumberField value={preview.longitude} onChange={(n) => updatePreview({ longitude: n })} allowDecimals />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Boat type">
                    <select
                      value={preview.boatType}
                      onChange={(e) => updatePreview({ boatType: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                    >
                      {BOAT_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Length (ft)">
                    <NumberField value={preview.lengthFt} onChange={(n) => updatePreview({ lengthFt: n })} />
                  </Field>
                  <Field label="Capacity">
                    <NumberField value={preview.capacity} onChange={(n) => updatePreview({ capacity: n })} />
                  </Field>
                  <Field label="Crew size">
                    <NumberField value={preview.crewSize} onChange={(n) => updatePreview({ crewSize: n })} />
                  </Field>
                  <Field label="Captain name">
                    <Input value={preview.captainName || ''} onChange={(e) => updatePreview({ captainName: e.target.value || null })} />
                  </Field>
                  <Field label="Captain years">
                    <NumberField value={preview.captainExperienceYears} onChange={(n) => updatePreview({ captainExperienceYears: n })} />
                  </Field>
                  <Field label="Currency">
                    <select
                      value={preview.currency}
                      onChange={(e) => updatePreview({ currency: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Cancellation">
                    <select
                      value={preview.cancellationPolicy ?? ''}
                      onChange={(e) => updatePreview({ cancellationPolicy: e.target.value || null })}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {CANCELLATION_POLICIES.map((c) => (
                        <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Departure point">
                  <Input value={preview.departurePoint || ''} onChange={(e) => updatePreview({ departurePoint: e.target.value || null })} />
                </Field>
                <Field label="Captain bio">
                  <textarea
                    value={preview.captainBio || ''}
                    onChange={(e) => updatePreview({ captainBio: e.target.value || null })}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </Field>
              </>
            )}
          </Card>

          {/* Amenities (properties only — boats use techniques/species) */}
          {listingType === 'property' && (
            <Card className="p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Amenities</h2>
              <div className="flex flex-wrap gap-1.5">
                {preview.amenities.length === 0 && (
                  <p className="text-xs text-gray-500 italic">No amenities detected yet. Add some below.</p>
                )}
                {preview.amenities.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 text-xs font-medium">
                    {a}
                    <button
                      type="button"
                      onClick={() => removeAmenity(a)}
                      className="text-teal-600 hover:text-teal-900 leading-none"
                      aria-label={`Remove ${a}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={amenityDraft}
                  onChange={(e) => setAmenityDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addAmenity(); }
                  }}
                  placeholder="Add amenity (e.g. wifi, pool, air conditioning)"
                />
                <Button variant="outline" onClick={addAmenity}>Add</Button>
              </div>
            </Card>
          )}

          {/* House rules (properties only) */}
          {listingType === 'property' && (
            <Card className="p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">House rules</h2>
              {preview.houseRules.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No house rules detected. Add any you want to publish.</p>
              ) : (
                <ul className="space-y-1.5">
                  {preview.houseRules.map((r) => (
                    <li key={r} className="flex items-center justify-between text-sm text-gray-800 bg-gray-50 rounded-md px-3 py-1.5">
                      <span>{r}</span>
                      <button
                        type="button"
                        onClick={() => removeRule(r)}
                        className="text-gray-400 hover:text-red-600 text-lg leading-none"
                        aria-label={`Remove rule ${r}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Input
                  value={ruleDraft}
                  onChange={(e) => setRuleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addRule(); }
                  }}
                  placeholder="Add rule (e.g. No smoking, No parties)"
                />
                <Button variant="outline" onClick={addRule}>Add</Button>
              </div>
            </Card>
          )}

          {/* Trips (boats only) */}
          {listingType === 'boat' && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Trip packages</h2>
                <Button variant="outline" onClick={addTrip}>+ Add trip</Button>
              </div>
              {preview.trips.length === 0 && (
                <p className="text-xs text-gray-500 italic">No trips detected. Click “Add trip” to create one.</p>
              )}
              {preview.trips.map((trip, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Input
                      value={trip.name}
                      onChange={(e) => updateTrip(i, { name: e.target.value })}
                      className="font-medium"
                      placeholder="Trip name"
                    />
                    <button
                      type="button"
                      onClick={() => removeTrip(i)}
                      className="text-gray-400 hover:text-red-600 text-lg leading-none shrink-0 mt-1.5"
                      aria-label="Remove trip"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Field label="Type" compact>
                      <select
                        value={trip.trip_type}
                        onChange={(e) => updateTrip(i, { trip_type: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        {TRIP_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                      </select>
                    </Field>
                    <Field label="Hours" compact>
                      <NumberField value={trip.duration_hours} onChange={(n) => updateTrip(i, { duration_hours: n })} allowDecimals />
                    </Field>
                    <Field label="Price total" compact>
                      <NumberField value={trip.price_total} onChange={(n) => updateTrip(i, { price_total: n })} />
                    </Field>
                    <Field label="Per person" compact>
                      <NumberField value={trip.price_per_person} onChange={(n) => updateTrip(i, { price_per_person: n })} />
                    </Field>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Boat: target species + techniques */}
          {listingType === 'boat' && (preview.targetSpecies.length > 0 || preview.fishingTechniques.length > 0) && (
            <Card className="p-5 space-y-3">
              {preview.targetSpecies.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-gray-700 mb-1.5">Target species</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.targetSpecies.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {preview.fishingTechniques.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-gray-700 mb-1.5">Techniques</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.fishingTechniques.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 sticky bottom-4 bg-white/90 backdrop-blur rounded-lg p-3 shadow-sm border border-gray-200">
            <Button variant="outline" onClick={resetAll} className="flex-1">Start over</Button>
            <Button onClick={handleSave} className="flex-1">Submit for review</Button>
          </div>
        </div>
      )}

      {/* Step 3: saving */}
      {step === 'saving' && (
        <Card className="p-12 text-center">
          <svg className="animate-spin h-10 w-10 text-teal-600 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-700 font-medium">Creating your listing…</p>
          <p className="text-sm text-gray-500 mt-1">Saving photos and details</p>
        </Card>
      )}

      {/* Step 4: done */}
      {step === 'done' && (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Import complete!</h2>
          <p className="text-gray-600 mb-6">
            Your listing has been submitted for review. You can keep editing in the meantime.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={resetAll}>Import another</Button>
            <Button
              onClick={() => {
                if (!createdId) return;
                router.push(listingType === 'property' ? `/dashboard/properties/${createdId}` : `/dashboard/boats/${createdId}`);
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

// ------------ small presentational helpers ------------

function Field({ label, children, compact = false }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div>
      <label className={`block ${compact ? 'text-[10px]' : 'text-xs'} font-medium text-gray-600 mb-1`}>{label}</label>
      {children}
    </div>
  );
}

function NumberField({
  value,
  onChange,
  placeholder,
  allowDecimals = false,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  allowDecimals?: boolean;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      step={allowDecimals ? 'any' : 1}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') return onChange(null);
        const n = allowDecimals ? parseFloat(v) : parseInt(v, 10);
        onChange(Number.isFinite(n) ? n : null);
      }}
      placeholder={placeholder}
      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
    />
  );
}

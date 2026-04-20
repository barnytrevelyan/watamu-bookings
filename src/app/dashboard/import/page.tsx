'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import toast from 'react-hot-toast';
import {
  Sparkles,
  Link as LinkIcon,
  Home,
  Anchor,
  Images,
  FileText,
  MapPin,
  Users,
  Bed,
  Bath,
  Clock,
  Wallet,
  Fish,
  Compass,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  X,
  Plus,
  Wand2,
  Check,
  RefreshCcw,
  Ship,
  Shield,
  ListChecks,
} from 'lucide-react';

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

// Hosts routinely paste bare hostnames ("unreelexperience.com") or
// "www.example.com" without a scheme. Prepend https:// so the URL parser
// and the server-side sanitiser don't reject them.
function normaliseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function detectSourceFromUrl(rawUrl: string): DetectedSource | null {
  try {
    const u = new URL(normaliseUrl(rawUrl));
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes('.')) return null;
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

// Visual metadata for each source — drives the chips in the URL step and the
// "Imported from" pill in preview. Keep the copy short; hosts scan these.
const SOURCE_META: Record<DetectedSource, { label: string; tag: string; accent: string; bg: string; ring: string }> = {
  airbnb:         { label: 'Airbnb',        tag: 'Direct scrape — no AI', accent: 'text-rose-700',   bg: 'bg-rose-50',   ring: 'ring-rose-200' },
  booking_com:    { label: 'Booking.com',   tag: 'Direct scrape — no AI', accent: 'text-blue-700',   bg: 'bg-blue-50',   ring: 'ring-blue-200' },
  fishingbooker:  { label: 'FishingBooker', tag: 'Direct scrape — no AI', accent: 'text-amber-700',  bg: 'bg-amber-50',  ring: 'ring-amber-200' },
  generic:        { label: 'AI import',     tag: 'GPT-4o extraction',     accent: 'text-violet-700', bg: 'bg-violet-50', ring: 'ring-violet-200' },
};

export default function ImportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Reading the page…');
  const [loadingStage, setLoadingStage] = useState(0);
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

  // Live source detection on every keystroke — powers the detected-source chip
  // next to the URL input so hosts know up-front whether we'll use a dedicated
  // scraper or fall back to the AI extractor. Safe to recompute on every render.
  const liveDetected = useMemo<DetectedSource | null>(() => {
    if (!url.trim()) return null;
    return detectSourceFromUrl(url);
  }, [url]);

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
    setLoadingStage(0);
    const id = setInterval(() => {
      i = Math.min(i + 1, seq.length - 1);
      setLoadingMessage(seq[i]);
      setLoadingStage(i);
    }, 2500);
    return () => clearInterval(id);
  }, [loading, detectedSource]);

  async function handleImport() {
    const cleanUrl = normaliseUrl(url);
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
      setError('That doesn’t look like a valid URL. Double-check it and try again.');
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

  const liveMeta = liveDetected ? SOURCE_META[liveDetected] : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      {/* Page header — only shown on the URL step; once we're in the flow
          the preview has its own breadcrumb and the hero would just take
          vertical space away from actual content. */}
      {step === 'url' && (
        <section className="relative overflow-hidden rounded-3xl border border-[var(--color-primary-100,#bde0f6)] bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] via-white to-[var(--color-sandy-50,#fdf6e3)] p-8 sm:p-10 animate-fade-in">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gradient-to-br from-[var(--color-primary-200,#8bc8ea)]/40 to-transparent blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 h-52 w-52 rounded-full bg-gradient-to-tr from-[var(--color-sandy-200,#f2d88f)]/40 to-transparent blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur px-3 py-1 text-xs font-semibold text-[var(--color-primary-700,#034078)] ring-1 ring-[var(--color-primary-200,#8bc8ea)]/60 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              AI Import Wizard
              <span className="ml-1 rounded-full bg-[var(--color-primary-600,#0077b6)] text-white px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase">Beta</span>
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Paste a link. <span className="bg-gradient-to-r from-[var(--color-primary-600,#0077b6)] to-[var(--color-primary-800,#023e7d)] bg-clip-text text-transparent">We draft the listing.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] text-gray-600 leading-relaxed">
              Airbnb, Booking.com, FishingBooker — or your own website. We pull photos, descriptions, pricing, amenities and location, then let you review and polish every field before it goes live.
            </p>

            {/* Source badges — set expectations about which scraper will run. */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <SourceChip label="Airbnb" meta={SOURCE_META.airbnb} />
              <SourceChip label="Booking.com" meta={SOURCE_META.booking_com} />
              <SourceChip label="FishingBooker" meta={SOURCE_META.fishingbooker} />
              <SourceChip label="Any other site" meta={SOURCE_META.generic} />
            </div>
          </div>
        </section>
      )}

      {/* Step 1: URL entry */}
      {step === 'url' && (
        <div className="animate-slide-up">
          <Card className="relative overflow-hidden p-6 sm:p-8 space-y-6 border-gray-200/80 shadow-sm">
            {/* Big URL input with embedded source detection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2.5">
                <LinkIcon className="h-4 w-4 text-[var(--color-primary-600,#0077b6)]" />
                Paste your listing URL
              </label>
              <div className="relative">
                <div className="flex items-stretch gap-0 rounded-xl border-2 border-gray-200 bg-white focus-within:border-[var(--color-primary-500,#0a93db)] focus-within:ring-4 focus-within:ring-[var(--color-primary-500,#0a93db)]/10 transition-all">
                  <div className="flex items-center pl-4 pr-3 text-gray-400 border-r border-gray-100">
                    <LinkIcon className="h-4 w-4" />
                  </div>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !loading && !authLoading && url.trim()) {
                        e.preventDefault();
                        handleImport();
                      }
                    }}
                    placeholder="https://www.airbnb.com/rooms/12345678  or  villafoofoowatamu.com"
                    className="flex-1 min-w-0 py-3.5 pr-3 text-[15px] outline-none placeholder:text-gray-400 bg-transparent"
                    autoFocus
                  />
                  {url.trim() && (
                    <button
                      type="button"
                      onClick={() => setUrl('')}
                      className="px-3 text-gray-400 hover:text-gray-600"
                      aria-label="Clear URL"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {/* Live source detection under the input */}
                {liveMeta && !loading && (
                  <div className={`mt-2.5 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${liveMeta.ring} ${liveMeta.bg} ${liveMeta.accent}`}>
                    {liveDetected === 'generic' ? <Sparkles className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    Detected: <span className="font-semibold">{liveMeta.label}</span>
                    <span className="opacity-70">·</span>
                    <span className="opacity-80">{liveMeta.tag}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Listing type hint — only matters for generic URLs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900">Property or boat?</p>
                {liveDetected && liveDetected !== 'generic' && (
                  <span className="text-[11px] text-gray-500 italic">
                    Not needed for {SOURCE_META[liveDetected].label}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <TypeHintCard
                  icon={<Wand2 className="h-5 w-5" />}
                  title="Auto-detect"
                  description="Let the AI decide"
                  selected={listingTypeHint === null}
                  onClick={() => setListingTypeHint(null)}
                />
                <TypeHintCard
                  icon={<Home className="h-5 w-5" />}
                  title="Property"
                  description="Villa, apartment, hotel"
                  selected={listingTypeHint === 'property'}
                  onClick={() => setListingTypeHint('property')}
                />
                <TypeHintCard
                  icon={<Anchor className="h-5 w-5" />}
                  title="Boat charter"
                  description="Fishing, cruising, dhow"
                  selected={listingTypeHint === 'boat'}
                  onClick={() => setListingTypeHint('boat')}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 animate-fade-in">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={authLoading || loading || !url.trim()}
              className="w-full py-3.5 text-[15px] font-semibold shadow-md hover:shadow-lg"
            >
              {authLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Signing you in…
                </span>
              ) : loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  {loadingMessage}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Draft my listing
                </span>
              )}
            </Button>

            {/* Progress strip — only visible while the import is running */}
            {loading && detectedSource && (
              <ProgressStrip source={detectedSource} stage={loadingStage} />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
              <Hint
                icon={<Shield className="h-4 w-4" />}
                title="Direct scrape"
                body="Airbnb, Booking.com, FishingBooker — structured extraction, no AI tokens."
              />
              <Hint
                icon={<Wand2 className="h-4 w-4" />}
                title="AI extraction"
                body="Any other site uses GPT-4o to understand the page, pull photos and parse details."
              />
              <Hint
                icon={<ListChecks className="h-4 w-4" />}
                title="Multi-listing"
                body="If the site lists several villas or boats, we let you pick them one by one."
              />
            </div>
          </Card>
        </div>
      )}

      {/* Step 1b: multi-listing picker (only for generic URLs when 2+ listings
          are discovered on the site). */}
      {step === 'picker' && discovered && (
        <div className="space-y-6 animate-fade-in">
          <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-pink-50 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    We spotted <span className="text-violet-700">{discovered.length} listings</span> on that site
                  </h2>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Pick one to review and edit. You can come back here afterwards to import the others.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 shrink-0 rounded-full px-3 py-1.5 hover:bg-white/60 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Try another URL
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {discovered.map((item, idx) => {
              const imported = discoveredImportedSlugs.has(idx);
              const cover = Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null;
              const isBoat = item.listing_type === 'boat';
              const typeLabel = isBoat ? 'Boat charter' : 'Property';
              const subTypeLabel = isBoat
                ? (item.boat_type ? String(item.boat_type).replace(/_/g, ' ') : 'boat')
                : (item.property_type ? String(item.property_type) : 'property');
              const price = !isBoat
                ? (typeof item.price_per_night === 'number' ? `${item.currency || 'KES'} ${item.price_per_night.toLocaleString()} / night` : null)
                : (Array.isArray(item.trips) && item.trips.length > 0 && typeof item.trips[0]?.price_total === 'number'
                    ? `from ${item.currency || 'KES'} ${item.trips[0].price_total.toLocaleString()}`
                    : null);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => pickDiscoveredListing(idx)}
                  className={`text-left group rounded-2xl border bg-white overflow-hidden transition-all duration-300 shadow-sm ${
                    imported
                      ? 'border-emerald-300 ring-1 ring-emerald-200'
                      : 'border-gray-200 hover:border-[var(--color-primary-400,#4ab1dd)] hover:shadow-xl hover:-translate-y-0.5'
                  }`}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                        No photos detected
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full backdrop-blur shadow-sm ${
                        isBoat ? 'bg-sky-600/90 text-white' : 'bg-[var(--color-primary-600,#0077b6)]/90 text-white'
                      }`}>
                        {isBoat ? <Anchor className="h-2.5 w-2.5" /> : <Home className="h-2.5 w-2.5" />}
                        {typeLabel}
                      </span>
                    </div>
                    {imported && (
                      <div className="absolute inset-0 bg-emerald-900/50 backdrop-blur-[2px] flex items-center justify-center animate-fade-in">
                        <span className="bg-white rounded-full p-2.5 shadow-lg">
                          <Check className="h-7 w-7 text-emerald-600" strokeWidth={3} />
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500 capitalize font-medium">{subTypeLabel}</span>
                      {imported && (
                        <span className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Imported
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 leading-snug line-clamp-1">{item.name || 'Untitled listing'}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                    )}
                    {price && (
                      <p className="text-sm font-bold text-gray-900">{price}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: editable preview */}
      {step === 'preview' && preview && detectedSource && listingType && (
        <div className="space-y-6 animate-fade-in">
          {/* Breadcrumb/status bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${SOURCE_META[detectedSource].ring} ${SOURCE_META[detectedSource].bg} ${SOURCE_META[detectedSource].accent}`}>
                {sourceUsesAI(detectedSource) ? <Sparkles className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                From {sourceLabel(detectedSource)}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                {listingType === 'boat' ? <Anchor className="h-3 w-3" /> : <Home className="h-3 w-3" />}
                {listingType === 'boat' ? 'Boat charter' : 'Property'}
              </span>
              <span className="hidden sm:inline text-xs text-gray-500">Review & edit before submitting</span>
            </div>
            {discovered && discovered.length > 1 ? (
              <button
                type="button"
                onClick={backToPicker}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary-700,#034078)] hover:text-[var(--color-primary-900,#002d5c)] rounded-full px-3 py-1.5 hover:bg-[var(--color-primary-50,#e8f4fb)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to {discovered.length} listings
              </button>
            ) : (
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-full px-3 py-1.5 hover:bg-gray-100"
              >
                <RefreshCcw className="h-4 w-4" />
                Try another URL
              </button>
            )}
          </div>

          {/* Image gallery — click to deselect; click again to re-select. */}
          {preview.allImages.length > 0 && (
            <SectionCard
              icon={<Images className="h-4 w-4" />}
              title="Photos"
              subtitle={`${preview.images.length} selected${unselectedCount > 0 ? ` · ${unselectedCount} hidden` : ''} · click a photo to toggle`}
              action={
                unselectedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => updatePreview({ images: preview.allImages.slice() })}
                    className="text-xs font-semibold text-[var(--color-primary-700,#034078)] hover:text-[var(--color-primary-900,#002d5c)]"
                  >
                    Restore all
                  </button>
                ) : null
              }
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {preview.allImages.map((img, i) => {
                  const selected = preview.images.includes(img);
                  const coverSelected = preview.images[0] === img;
                  return (
                    <button
                      key={img + i}
                      type="button"
                      onClick={() => toggleImage(img)}
                      className={`relative aspect-[4/3] overflow-hidden rounded-xl ring-2 transition-all ${
                        selected
                          ? 'ring-[var(--color-primary-500,#0a93db)] shadow-sm hover:shadow-md'
                          : 'ring-transparent opacity-40 hover:opacity-80'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      {coverSelected && (
                        <span className="absolute top-2 left-2 bg-white/95 px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-800 uppercase tracking-wider shadow-sm">
                          Cover
                        </span>
                      )}
                      {selected && (
                        <span className="absolute top-2 right-2 bg-[var(--color-primary-600,#0077b6)] text-white rounded-full h-6 w-6 flex items-center justify-center shadow-sm">
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      )}
                      {!selected && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-semibold bg-black/40">
                          Hidden
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Core editable fields */}
          <SectionCard
            icon={<FileText className="h-4 w-4" />}
            title="Listing details"
            subtitle="The story guests read before they book"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Name</label>
                <Input
                  value={preview.name}
                  onChange={(e) => updatePreview({ name: e.target.value })}
                  className="text-base font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={preview.description}
                  onChange={(e) => updatePreview({ description: e.target.value })}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent leading-relaxed"
                />
                <p className="text-[11px] text-gray-500 mt-1">{preview.description.length.toLocaleString()} characters</p>
              </div>
            </div>
          </SectionCard>

          {listingType === 'property' ? (
            <>
              <SectionCard
                icon={<Wallet className="h-4 w-4" />}
                title="Pricing & stay rules"
                subtitle="What guests pay and how long they can stay"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Property type">
                    <select
                      value={preview.propertyType}
                      onChange={(e) => updatePreview({ propertyType: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
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
                        className="rounded-lg border border-gray-300 px-2 py-2 text-sm w-20 focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
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
                  <Field label="Max guests" icon={<Users className="h-3.5 w-3.5" />}>
                    <NumberField value={preview.maxGuests} onChange={(n) => updatePreview({ maxGuests: n })} />
                  </Field>
                  <Field label="Bedrooms" icon={<Bed className="h-3.5 w-3.5" />}>
                    <NumberField value={preview.bedrooms} onChange={(n) => updatePreview({ bedrooms: n })} />
                  </Field>
                  <Field label="Bathrooms" icon={<Bath className="h-3.5 w-3.5" />}>
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
                  <Field label="Check-in" icon={<Clock className="h-3.5 w-3.5" />}>
                    <Input value={preview.checkInTime || ''} onChange={(e) => updatePreview({ checkInTime: e.target.value || null })} placeholder="14:00" />
                  </Field>
                  <Field label="Check-out" icon={<Clock className="h-3.5 w-3.5" />}>
                    <Input value={preview.checkOutTime || ''} onChange={(e) => updatePreview({ checkOutTime: e.target.value || null })} placeholder="11:00" />
                  </Field>
                  <Field label="Cancellation">
                    <select
                      value={preview.cancellationPolicy ?? ''}
                      onChange={(e) => updatePreview({ cancellationPolicy: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
                    >
                      <option value="">—</option>
                      {CANCELLATION_POLICIES.map((c) => (
                        <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </SectionCard>

              <SectionCard
                icon={<MapPin className="h-4 w-4" />}
                title="Location"
                subtitle="Where guests will find you"
              >
                <div className="space-y-3">
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
                </div>
              </SectionCard>

              <SectionCard
                icon={<ListChecks className="h-4 w-4" />}
                title="Amenities"
                subtitle="Tag what sets your place apart"
              >
                <div className="flex flex-wrap gap-1.5">
                  {preview.amenities.length === 0 && (
                    <p className="text-xs text-gray-500 italic">No amenities detected yet. Add some below.</p>
                  )}
                  {preview.amenities.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--color-primary-50,#e8f4fb)] text-[var(--color-primary-800,#023e7d)] text-xs font-medium ring-1 ring-[var(--color-primary-200,#8bc8ea)]/60">
                      {a}
                      <button
                        type="button"
                        onClick={() => removeAmenity(a)}
                        className="text-[var(--color-primary-600,#0077b6)] hover:text-[var(--color-primary-900,#002d5c)] leading-none ml-0.5"
                        aria-label={`Remove ${a}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Input
                    value={amenityDraft}
                    onChange={(e) => setAmenityDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addAmenity(); }
                    }}
                    placeholder="Add amenity (e.g. wifi, pool, air conditioning)"
                  />
                  <Button variant="outline" onClick={addAmenity}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </SectionCard>

              <SectionCard
                icon={<Shield className="h-4 w-4" />}
                title="House rules"
                subtitle="Keep things clear for guests"
              >
                {preview.houseRules.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No house rules detected. Add any you want to publish.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {preview.houseRules.map((r) => (
                      <li key={r} className="flex items-center justify-between text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 ring-1 ring-gray-200/50">
                        <span>{r}</span>
                        <button
                          type="button"
                          onClick={() => removeRule(r)}
                          className="text-gray-400 hover:text-red-600 leading-none ml-2 p-1 rounded hover:bg-red-50"
                          aria-label={`Remove rule ${r}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 mt-3">
                  <Input
                    value={ruleDraft}
                    onChange={(e) => setRuleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addRule(); }
                    }}
                    placeholder="Add rule (e.g. No smoking, No parties)"
                  />
                  <Button variant="outline" onClick={addRule}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </SectionCard>
            </>
          ) : (
            <>
              <SectionCard
                icon={<Ship className="h-4 w-4" />}
                title="Vessel & captain"
                subtitle="Your boat's vitals and who's at the helm"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Boat type">
                    <select
                      value={preview.boatType}
                      onChange={(e) => updatePreview({ boatType: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
                    >
                      {BOAT_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Length (ft)">
                    <NumberField value={preview.lengthFt} onChange={(n) => updatePreview({ lengthFt: n })} />
                  </Field>
                  <Field label="Capacity" icon={<Users className="h-3.5 w-3.5" />}>
                    <NumberField value={preview.capacity} onChange={(n) => updatePreview({ capacity: n })} />
                  </Field>
                  <Field label="Crew size">
                    <NumberField value={preview.crewSize} onChange={(n) => updatePreview({ crewSize: n })} />
                  </Field>
                  <Field label="Captain name">
                    <Input value={preview.captainName || ''} onChange={(e) => updatePreview({ captainName: e.target.value || null })} />
                  </Field>
                  <Field label="Years experience">
                    <NumberField value={preview.captainExperienceYears} onChange={(n) => updatePreview({ captainExperienceYears: n })} />
                  </Field>
                  <Field label="Currency">
                    <select
                      value={preview.currency}
                      onChange={(e) => updatePreview({ currency: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Cancellation">
                    <select
                      value={preview.cancellationPolicy ?? ''}
                      onChange={(e) => updatePreview({ cancellationPolicy: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
                    >
                      <option value="">—</option>
                      {CANCELLATION_POLICIES.map((c) => (
                        <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="mt-3 space-y-3">
                  <Field label="Departure point" icon={<MapPin className="h-3.5 w-3.5" />}>
                    <Input value={preview.departurePoint || ''} onChange={(e) => updatePreview({ departurePoint: e.target.value || null })} />
                  </Field>
                  <Field label="Captain bio">
                    <textarea
                      value={preview.captainBio || ''}
                      onChange={(e) => updatePreview({ captainBio: e.target.value || null })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent leading-relaxed"
                    />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard
                icon={<Compass className="h-4 w-4" />}
                title="Trip packages"
                subtitle="What guests can book"
                action={
                  <Button variant="outline" onClick={addTrip}>
                    <Plus className="h-4 w-4 mr-1" /> Add trip
                  </Button>
                }
              >
                {preview.trips.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
                    <Compass className="h-6 w-6 text-gray-400 mx-auto mb-1.5" />
                    <p className="text-sm text-gray-600 font-medium">No trips yet</p>
                    <p className="text-xs text-gray-500">Click "Add trip" to create one.</p>
                  </div>
                )}
                <div className="space-y-2.5">
                  {preview.trips.map((trip, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <Input
                          value={trip.name}
                          onChange={(e) => updateTrip(i, { name: e.target.value })}
                          className="font-semibold"
                          placeholder="Trip name"
                        />
                        <button
                          type="button"
                          onClick={() => removeTrip(i)}
                          className="text-gray-400 hover:text-red-600 shrink-0 p-1.5 rounded hover:bg-red-50 mt-1"
                          aria-label="Remove trip"
                        >
                          <X className="h-4 w-4" />
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
                </div>
              </SectionCard>

              {(preview.targetSpecies.length > 0 || preview.fishingTechniques.length > 0) && (
                <SectionCard
                  icon={<Fish className="h-4 w-4" />}
                  title="Fishing"
                  subtitle="What's biting and how"
                >
                  {preview.targetSpecies.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-700 mb-2">Target species</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.targetSpecies.map((s) => (
                          <span key={s} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium ring-1 ring-emerald-200/60">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {preview.fishingTechniques.length > 0 && (
                    <div className="mt-3">
                      <h3 className="text-xs font-semibold text-gray-700 mb-2">Techniques</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.fishingTechniques.map((t) => (
                          <span key={t} className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 text-xs font-medium ring-1 ring-sky-200/60">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 animate-fade-in">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Sticky save bar */}
          <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl p-3 shadow-lg border border-gray-200 bg-white/95 backdrop-blur-xl">
            <div className="hidden sm:flex items-center gap-2 pl-2 text-xs text-gray-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Ready to submit for review
            </div>
            <div className="flex-1" />
            <Button variant="outline" onClick={resetAll} className="">
              Start over
            </Button>
            <Button onClick={handleSave} className="shadow-md hover:shadow-lg">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Submit for review
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: saving */}
      {step === 'saving' && (
        <Card className="p-14 text-center animate-fade-in">
          <div className="relative mx-auto mb-5 h-16 w-16">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--color-primary-400,#4ab1dd)] to-[var(--color-primary-700,#034078)] animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-white animate-ping opacity-60" />
              <Sparkles className="absolute h-7 w-7 text-white" />
            </div>
          </div>
          <p className="text-gray-900 font-semibold text-lg">Creating your listing…</p>
          <p className="text-sm text-gray-500 mt-1.5">Saving photos, details and pricing</p>
        </Card>
      )}

      {/* Step 4: done */}
      {step === 'done' && (
        <Card className="p-10 text-center animate-scale-in">
          <div className="relative mx-auto mb-5 h-20 w-20">
            <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-50" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
              <Check className="h-10 w-10 text-white" strokeWidth={3} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Listing submitted!</h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Your listing is queued for review. You can keep editing in the meantime — we'll ping you once it's approved.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button variant="outline" onClick={resetAll}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              Import another
            </Button>
            <Button
              onClick={() => {
                if (!createdId) return;
                router.push(listingType === 'property' ? `/dashboard/properties/${createdId}` : `/dashboard/boats/${createdId}`);
              }}
            >
              Edit listing →
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ------------ small presentational helpers ------------

function Field({ label, children, compact = false, icon }: { label: string; children: React.ReactNode; compact?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <label className={`flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-gray-600 mb-1`}>
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
      </label>
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
      className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500,#0a93db)] focus:border-transparent"
    />
  );
}

function SourceChip({ label, meta }: { label: string; meta: (typeof SOURCE_META)[DetectedSource] }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ${meta.ring} ${meta.bg} ${meta.accent}`}>
      {meta === SOURCE_META.generic ? <Sparkles className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {label}
    </div>
  );
}

function TypeHintCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-xl border-2 px-3 py-3 transition-all ${
        selected
          ? 'border-[var(--color-primary-500,#0a93db)] bg-[var(--color-primary-50,#e8f4fb)] shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${
        selected
          ? 'bg-[var(--color-primary-600,#0077b6)] text-white'
          : 'bg-gray-100 text-gray-500'
      }`}>
        {icon}
      </div>
      <p className={`text-sm font-semibold ${selected ? 'text-[var(--color-primary-800,#023e7d)]' : 'text-gray-900'}`}>{title}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>
      {selected && (
        <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-[var(--color-primary-600,#0077b6)] text-white flex items-center justify-center">
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </span>
      )}
    </button>
  );
}

function Hint({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="h-7 w-7 rounded-lg bg-[var(--color-primary-50,#e8f4fb)] text-[var(--color-primary-700,#034078)] flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-900">{title}</p>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6 border-gray-200/80 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--color-primary-50,#e8f4fb)] to-[var(--color-primary-100,#bde0f6)] text-[var(--color-primary-700,#034078)] flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ProgressStrip({ source, stage }: { source: DetectedSource; stage: number }) {
  const stages = source === 'generic'
    ? ['Fetching', 'Scanning', 'AI parsing', 'Photos']
    : ['Fetching', 'Parsing', 'Photos'];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {stages.map((label, i) => {
          const active = i <= stage;
          const current = i === stage;
          return (
            <div key={label} className="flex-1 flex items-center gap-2">
              <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                active
                  ? 'bg-gradient-to-r from-[var(--color-primary-500,#0a93db)] to-[var(--color-primary-700,#034078)]'
                  : 'bg-gray-200'
              } ${current ? 'animate-pulse' : ''}`} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider">
        {stages.map((label, i) => (
          <span
            key={label}
            className={`${i <= stage ? 'text-[var(--color-primary-700,#034078)]' : 'text-gray-400'}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

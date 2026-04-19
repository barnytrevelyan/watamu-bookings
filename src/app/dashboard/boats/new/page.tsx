'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
// import { Select } from '@/components/ui/Select';
import { TRIP_TYPE_LABELS } from '@/lib/types';
import type { TripType } from '@/lib/types';
import { Card } from '@/components/ui/Card';

interface BoatFeature {
  id: string;
  name: string;
  category: string;
}

interface TripPackage {
  name: string;
  trip_type: string;
  duration_hours: number;
  price_total: number;
  price_per_person: number;
  currency: string;
  departure_time: string;
  max_guests: number;
  includes: string;
  target_species: string[];
  seasonal_months: number[];
}

const BOAT_TYPES = [
  'sport_fisher',
  'deep_sea',
  'dhow',
  'catamaran',
  'speedboat',
  'glass_bottom',
  'kayak',
  'sailboat',
];

const TRIP_TYPES = [
  'half_day_morning',
  'half_day_afternoon',
  'half_day',
  'full_day',
  'overnight',
  'sunset_cruise',
  'custom',
  'multi_day',
];

const TARGET_SPECIES = [
  'Marlin', 'Sailfish', 'Yellowfin Tuna', 'Wahoo', 'Dorado',
  'Giant Trevally', 'Kingfish', 'Barracuda', 'Snapper', 'Grouper',
];

const FISHING_TECHNIQUES = [
  'Trolling', 'Bottom Fishing', 'Popping', 'Jigging',
  'Fly Fishing', 'Live Bait', 'Drift Fishing', 'Reef Fishing',
];

const DEFAULT_FEATURES: Record<string, string[]> = {
  Navigation: ['GPS', 'Fish Finder', 'Depth Sounder', 'Radar'],
  Fishing: ['Fighting Chair', 'Outriggers', 'Rod Holders', 'Live Bait Well', 'Tackle Box'],
  Comfort: ['Shade/Canopy', 'Cooler Box', 'Toilet', 'Music System', 'Cabin'],
  Safety: ['Life Jackets', 'First Aid Kit', 'Fire Extinguisher', 'Radio', 'Flares', 'Safety Equipment'],
};

const TABS = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'specs', label: 'Specifications' },
  { id: 'features', label: 'Features' },
  { id: 'fishing', label: 'Fishing Details' },
  { id: 'trips', label: 'Trip Packages' },
  { id: 'photos', label: 'Photos' },
  { id: 'map', label: 'Map Pin' },
  { id: 'review', label: 'Review & Submit' },
];

// Leaflet map component for picking coordinates
function MapPicker({
  lat,
  lng,
  onLocationSelect,
}: {
  lat: number;
  lng: number;
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if ((containerRef.current as any)._leaflet_id) return;

      const map = L.map(containerRef.current).setView([lat, lng], 15);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      const tealIcon = L.divIcon({
        html: `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#0d9488"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`,
        className: '',
        iconSize: [28, 40],
        iconAnchor: [14, 40],
      });

      map.on('click', (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { icon: tealIcon }).addTo(map);
        }
        onLocationSelect(clickLat, clickLng);
      });
    };

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <div ref={containerRef} className="w-full h-[400px] rounded-lg border border-gray-200" />
    </>
  );
}

export default function NewBoatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [boatFeatures, setBoatFeatures] = useState<BoatFeature[]>([]);

  // Basic info
  const [name, setName] = useState('');
  const [boatType, setBoatType] = useState('sport_fisher');
  const [description, setDescription] = useState('');

  // Specs
  const [length, setLength] = useState('');
  const [capacity, setCapacity] = useState('6');
  const [crewSize, setCrewSize] = useState('2');
  const [captainName, setCaptainName] = useState('');
  const [captainBio, setCaptainBio] = useState('');
  const [captainExperienceYears, setCaptainExperienceYears] = useState('');
  const [instantConfirmation, setInstantConfirmation] = useState(false);
  const [currency, setCurrency] = useState('KES');
  const [cancellationPolicy, setCancellationPolicy] = useState('moderate');

  // Features
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedDefaultFeatures, setSelectedDefaultFeatures] = useState<string[]>([]);

  // Species & techniques
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);
  const [selectedTechniques, setSelectedTechniques] = useState<string[]>([]);

  // Trip packages
  const [trips, setTrips] = useState<TripPackage[]>([]);

  // Safety
  const [safetyEquipment, setSafetyEquipment] = useState('');

  // Location
  const [departurePoint, setDeparturePoint] = useState('Watamu Marine Park Jetty');
  const [latitude, setLatitude] = useState(-3.354);
  const [longitude, setLongitude] = useState(40.024);
  const [mapPinSet, setMapPinSet] = useState(false);

  // Images
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [urlInput, setUrlInput] = useState('');

  useEffect(() => {
    async function loadFeatures() {
      const supabase = createClient();
      const { data } = await supabase
        .from('wb_boat_features')
        .select('id, name, category')
        .order('category');
      if (data && data.length > 0) setBoatFeatures(data);
    }
    loadFeatures();
  }, []);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setLatitude(parseFloat(lat.toFixed(6)));
    setLongitude(parseFloat(lng.toFixed(6)));
    setMapPinSet(true);
  }, []);

  function toggleFeature(id: string) {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  }

  function toggleDefaultFeature(name: string) {
    setSelectedDefaultFeatures((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
    );
  }

  function toggleSpecies(species: string) {
    setSelectedSpecies((prev) =>
      prev.includes(species) ? prev.filter((s) => s !== species) : [...prev, species]
    );
  }

  function toggleTechnique(tech: string) {
    setSelectedTechniques((prev) =>
      prev.includes(tech) ? prev.filter((t) => t !== tech) : [...prev, tech]
    );
  }

  function addTrip() {
    setTrips((prev) => [
      ...prev,
      {
        name: '',
        trip_type: 'half_day_morning',
        duration_hours: 4,
        price_total: 0,
        price_per_person: 0,
        currency: 'KES',
        departure_time: '06:30',
        max_guests: parseInt(capacity) || 6,
        includes: '',
        target_species: [],
        seasonal_months: [],
      },
    ]);
  }

  function updateTrip(index: number, field: keyof TripPackage, value: any) {
    setTrips((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function removeTrip(index: number) {
    setTrips((prev) => prev.filter((_, i) => i !== index));
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setImageFiles((prev) => [...prev, ...files]);
    setImagePreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  }

  function removeImage(index: number) {
    if (index < imageFiles.length) {
      setImageFiles((prev) => prev.filter((_, i) => i !== index));
      setImagePreviews((prev) => {
        URL.revokeObjectURL(prev[index]);
        return prev.filter((_, i) => i !== index);
      });
    } else {
      const urlIndex = index - imageFiles.length;
      setImageUrls((prev) => prev.filter((_, i) => i !== urlIndex));
    }
    if (coverIndex === index) setCoverIndex(0);
    else if (coverIndex > index) setCoverIndex(coverIndex - 1);
  }

  function addImageUrl() {
    if (urlInput.trim() && (urlInput.startsWith('http://') || urlInput.startsWith('https://'))) {
      setImageUrls((prev) => [...prev, urlInput.trim()]);
      setUrlInput('');
    }
  }

  const totalImages = imageFiles.length + imageUrls.length;
  const hasDbFeatures = boatFeatures.length > 0;

  function validate(): string | null {
    if (!name.trim()) return 'Boat name is required';
    if (!capacity || parseInt(capacity) < 1) return 'Capacity must be at least 1';
    return null;
  }

  async function handleSubmit(action: 'draft' | 'submit') {
    if (!user) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const status = action === 'draft' ? 'draft' : 'pending_review';

      const slug = name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const { data: boat, error: boatError } = await supabase
        .from('wb_boats')
        .insert({
          owner_id: user.id,
          name: name.trim(),
          slug,
          boat_type: boatType,
          description: description.trim(),
          length_ft: length ? parseFloat(length) : null,
          capacity: parseInt(capacity),
          crew_size: parseInt(crewSize),
          captain_name: captainName.trim() || null,
          captain_bio: captainBio.trim() || null,
          captain_experience_years: captainExperienceYears ? parseInt(captainExperienceYears) : null,
          instant_confirmation: instantConfirmation,
          target_species: selectedSpecies,
          fishing_techniques: selectedTechniques,
          safety_equipment: safetyEquipment.trim() || null,
          departure_point: departurePoint.trim(),
          latitude: mapPinSet ? latitude : null,
          longitude: mapPinSet ? longitude : null,
          currency,
          cancellation_policy: cancellationPolicy,
          is_published: false,
          status,
        })
        .select('id')
        .single();

      if (boatError) throw boatError;

      // Insert feature links
      if (selectedFeatures.length > 0) {
        const links = selectedFeatures.map((feature_id) => ({
          boat_id: boat.id,
          feature_id,
        }));
        await supabase.from('wb_boat_feature_links').insert(links);
      }

      // Insert trip packages
      if (trips.length > 0) {
        const tripRows = trips
          .filter((t) => t.name.trim() && (t.price_total > 0 || t.price_per_person > 0))
          .map((t, i) => ({
            boat_id: boat.id,
            name: t.name.trim(),
            trip_type: t.trip_type,
            duration_hours: t.duration_hours,
            price_total: t.price_total || null,
            price_per_person: t.price_per_person || null,
            currency: t.currency,
            departure_time: t.departure_time,
            max_guests: t.max_guests,
            includes: t.includes ? t.includes.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
            target_species: t.target_species || [],
            seasonal_months: t.seasonal_months || [],
            sort_order: i,
          }));

        if (tripRows.length > 0) {
          await supabase.from('wb_boat_trips').insert(tripRows);
        }
      }

      // Upload images
      const imageRows: any[] = [];
      let imgPosition = 0;

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const ext = file.name.split('.').pop();
        const path = `boats/${boat.id}/${Date.now()}-${i}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('watamu-images')
          .upload(path, file);

        if (uploadErr) {
          console.error('Upload failed for image', i, uploadErr);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from('watamu-images').getPublicUrl(path);

        imageRows.push({
          boat_id: boat.id,
          listing_type: 'boat',
          url: publicUrl,
          alt_text: `${name} - Image ${imgPosition + 1}`,
          sort_order: imgPosition,
          is_cover: (i === coverIndex),
        });
        imgPosition++;
      }

      for (let i = 0; i < imageUrls.length; i++) {
        const globalIndex = imageFiles.length + i;
        imageRows.push({
          boat_id: boat.id,
          listing_type: 'boat',
          url: imageUrls[i],
          alt_text: `${name} - Image ${imgPosition + 1}`,
          sort_order: imgPosition,
          is_cover: (globalIndex === coverIndex),
        });
        imgPosition++;
      }

      if (imageRows.length > 0) {
        await supabase.from('wb_images').insert(imageRows);
      }

      if (action === 'submit') {
        setSuccessMessage('Your boat listing has been submitted for review. Our team will review it and get back to you shortly.');
      } else {
        setSuccessMessage('Draft saved successfully. You can continue editing from your dashboard.');
      }

      setTimeout(() => {
        router.push('/dashboard/boats');
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to create boat');
    } finally {
      setSaving(false);
    }
  }

  const featuresByCategory = boatFeatures.reduce(
    (acc, f) => {
      const cat = f.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(f);
      return acc;
    },
    {} as Record<string, BoatFeature[]>
  );

  if (successMessage) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Success!</h2>
          <p className="text-gray-600">{successMessage}</p>
          <p className="mt-4 text-sm text-gray-400">Redirecting to your boats...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          &larr; Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Boat</h1>
          <p className="text-sm text-gray-500">Create your boat listing step by step</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto border-b border-gray-200 -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Basic Info */}
      {activeTab === 'basic' && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Boat Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diani Explorer" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Boat Type</label>
                <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={boatType} onChange={(e) => setBoatType(e.target.value)}>
                  {BOAT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the boat, its history, and fishing capabilities..."
                rows={5}
              />
              <p className="mt-1 text-xs text-gray-500">{description.length} characters</p>
            </div>
          </div>
        </Card>
      )}

      {/* Specifications */}
      {activeTab === 'specs' && (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Specifications</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Length (ft)</label>
              <Input type="number" min="0" value={length} onChange={(e) => setLength(e.target.value)} placeholder="32" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Capacity *</label>
              <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Crew Size</label>
              <Input type="number" min="1" value={crewSize} onChange={(e) => setCrewSize(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Captain Name</label>
              <Input value={captainName} onChange={(e) => setCaptainName(e.target.value)} placeholder="Captain name" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Captain Experience (years)</label>
              <Input type="number" min="0" value={captainExperienceYears} onChange={(e) => setCaptainExperienceYears(e.target.value)} placeholder="15" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
              <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="KES">KES (Kenyan Shilling)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cancellation Policy</label>
              <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)}>
                <option value="flexible">Flexible</option>
                <option value="moderate">Moderate</option>
                <option value="strict">Strict</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Departure Point</label>
            <Input value={departurePoint} onChange={(e) => setDeparturePoint(e.target.value)} />
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Captain Bio</label>
            <Textarea
              value={captainBio}
              onChange={(e) => setCaptainBio(e.target.value)}
              placeholder="Tell guests about the captain's experience, specialties, and personality..."
              rows={3}
            />
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Safety Equipment</label>
            <Textarea
              value={safetyEquipment}
              onChange={(e) => setSafetyEquipment(e.target.value)}
              placeholder="Life jackets, first aid kit, fire extinguisher, radio, GPS, flares..."
              rows={3}
            />
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={instantConfirmation}
                onChange={(e) => setInstantConfirmation(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Instant Confirmation</span>
                <p className="text-xs text-gray-500">Bookings are confirmed automatically without manual approval</p>
              </div>
            </label>
          </div>
        </Card>
      )}

      {/* Features */}
      {activeTab === 'features' && (
        <Card className="p-6">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Boat Features</h3>
          <p className="mb-4 text-xs text-gray-500">Select all features and equipment on your boat.</p>

          {hasDbFeatures ? (
            <div className="space-y-6">
              {Object.entries(featuresByCategory).map(([category, items]) => (
                <div key={category}>
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{category}</h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map((feature) => (
                      <label
                        key={feature.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-all ${
                          selectedFeatures.includes(feature.id)
                            ? 'border-teal-500 bg-teal-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFeatures.includes(feature.id)}
                          onChange={() => toggleFeature(feature.id)}
                          className="sr-only"
                        />
                        <span>{feature.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(DEFAULT_FEATURES).map(([category, items]) => (
                <div key={category}>
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{category}</h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map((feat) => (
                      <label
                        key={feat}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-all ${
                          selectedDefaultFeatures.includes(feat)
                            ? 'border-teal-500 bg-teal-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDefaultFeatures.includes(feat)}
                          onChange={() => toggleDefaultFeature(feat)}
                          className="sr-only"
                        />
                        <span>{feat}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Fishing Details */}
      {activeTab === 'fishing' && (
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Target Species</h3>
              <p className="mb-3 text-xs text-gray-500">Select the fish species commonly caught on this boat.</p>
              <div className="flex flex-wrap gap-2">
                {TARGET_SPECIES.map((species) => (
                  <button
                    key={species}
                    type="button"
                    onClick={() => toggleSpecies(species)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                      selectedSpecies.includes(species)
                        ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {species}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Fishing Techniques</h3>
              <p className="mb-3 text-xs text-gray-500">Select the fishing techniques offered.</p>
              <div className="flex flex-wrap gap-2">
                {FISHING_TECHNIQUES.map((tech) => (
                  <button
                    key={tech}
                    type="button"
                    onClick={() => toggleTechnique(tech)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                      selectedTechniques.includes(tech)
                        ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {tech}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Trip Packages */}
      {activeTab === 'trips' && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Trip Packages</h3>
              <p className="text-xs text-gray-500">Add trip types with pricing so guests can book.</p>
            </div>
            <Button variant="outline" size="sm" onClick={addTrip}>
              + Add Trip
            </Button>
          </div>

          {trips.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-500 mb-3">No trip packages added yet.</p>
              <Button variant="outline" size="sm" onClick={addTrip}>Add Your First Trip</Button>
            </div>
          ) : (
            <div className="space-y-6">
              {trips.map((trip, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Trip #{i + 1}</h4>
                    <Button variant="ghost" size="sm" onClick={() => removeTrip(i)}>Remove</Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs text-gray-600">Trip Name *</label>
                      <Input
                        value={trip.name}
                        onChange={(e) => updateTrip(i, 'name', e.target.value)}
                        placeholder="e.g. Half Day Deep Sea Fishing"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Type</label>
                      <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={trip.trip_type} onChange={(e) => updateTrip(i, 'trip_type', e.target.value)}>
                        {TRIP_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {TRIP_TYPE_LABELS[t as TripType] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Duration (hours)</label>
                      <Input
                        type="number"
                        min="1"
                        value={trip.duration_hours}
                        onChange={(e) => updateTrip(i, 'duration_hours', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Total Price (whole boat)</label>
                      <Input
                        type="number"
                        min="0"
                        value={trip.price_total || ''}
                        onChange={(e) => updateTrip(i, 'price_total', parseFloat(e.target.value) || 0)}
                        placeholder="25000"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Price Per Person</label>
                      <Input
                        type="number"
                        min="0"
                        value={trip.price_per_person || ''}
                        onChange={(e) => updateTrip(i, 'price_per_person', parseFloat(e.target.value) || 0)}
                        placeholder="5000"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Max Guests</label>
                      <Input
                        type="number"
                        min="1"
                        value={trip.max_guests}
                        onChange={(e) => updateTrip(i, 'max_guests', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Departure Time</label>
                      <Input
                        type="time"
                        value={trip.departure_time}
                        onChange={(e) => updateTrip(i, 'departure_time', e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs text-gray-600">What&apos;s Included (comma-separated)</label>
                      <Textarea
                        value={trip.includes}
                        onChange={(e) => updateTrip(i, 'includes', e.target.value)}
                        placeholder="Fishing gear, bait, refreshments, lunch..."
                        rows={2}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs text-gray-600">Target Species for this trip</label>
                      <div className="flex flex-wrap gap-1.5">
                        {TARGET_SPECIES.map((species) => (
                          <button
                            key={species}
                            type="button"
                            onClick={() => {
                              const current = trip.target_species || [];
                              const updated = current.includes(species)
                                ? current.filter((s) => s !== species)
                                : [...current, species];
                              updateTrip(i, 'target_species', updated);
                            }}
                            className={`rounded-full border px-2 py-0.5 text-xs transition-all ${
                              (trip.target_species || []).includes(species)
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {species}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs text-gray-600">Available Months (leave empty for year-round)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((month, idx) => {
                          const monthNum = idx + 1;
                          const active = (trip.seasonal_months || []).includes(monthNum);
                          return (
                            <button
                              key={month}
                              type="button"
                              onClick={() => {
                                const current = trip.seasonal_months || [];
                                const updated = active
                                  ? current.filter((m) => m !== monthNum)
                                  : [...current, monthNum].sort((a, b) => a - b);
                                updateTrip(i, 'seasonal_months', updated);
                              }}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                                active
                                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              {month}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Photos */}
      {activeTab === 'photos' && (
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Boat Photos</h3>
              <p className="mb-4 text-xs text-gray-500">Add photos of your boat. Click the star to set the cover photo.</p>

              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 hover:border-teal-400 transition-colors">
                <label className="cursor-pointer text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-700">Click to upload boat images</p>
                  <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB each</p>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-gray-500">Or add images by URL:</p>
              <div className="flex gap-2">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addImageUrl}>Add URL</Button>
              </div>
            </div>

            {totalImages > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">{totalImages} image(s) added</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {imagePreviews.map((src, i) => (
                    <div key={`file-${i}`} className={`group relative aspect-square rounded-lg ${coverIndex === i ? 'ring-2 ring-teal-500 ring-offset-2' : ''}`}>
                      <img src={src} alt={`Preview ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                      {coverIndex === i && (
                        <span className="absolute left-1 top-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white">Cover</span>
                      )}
                      <div className="absolute inset-0 flex items-end justify-between rounded-lg bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" onClick={() => setCoverIndex(i)} className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white">Set Cover</button>
                        <button type="button" onClick={() => removeImage(i)} className="rounded-full bg-red-500 p-1 text-white hover:bg-red-600">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  {imageUrls.map((url, i) => {
                    const globalIdx = imageFiles.length + i;
                    return (
                      <div key={`url-${i}`} className={`group relative aspect-square rounded-lg ${coverIndex === globalIdx ? 'ring-2 ring-teal-500 ring-offset-2' : ''}`}>
                        <img src={url} alt={`URL Image ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                        {coverIndex === globalIdx && (
                          <span className="absolute left-1 top-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white">Cover</span>
                        )}
                        <div className="absolute inset-0 flex items-end justify-between rounded-lg bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button type="button" onClick={() => setCoverIndex(globalIdx)} className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white">Set Cover</button>
                          <button type="button" onClick={() => removeImage(globalIdx)} className="rounded-full bg-red-500 p-1 text-white hover:bg-red-600">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Map Pin */}
      {activeTab === 'map' && (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Departure Point on Map</h3>
              <p className="mb-4 text-xs text-gray-500">Click on the map to set where your boat departs from.</p>
            </div>

            <MapPicker lat={latitude} lng={longitude} onLocationSelect={handleLocationSelect} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Latitude</label>
                <Input
                  type="number"
                  step="any"
                  value={mapPinSet ? latitude : ''}
                  onChange={(e) => { setLatitude(parseFloat(e.target.value)); setMapPinSet(true); }}
                  placeholder="-3.3544"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Longitude</label>
                <Input
                  type="number"
                  step="any"
                  value={mapPinSet ? longitude : ''}
                  onChange={(e) => { setLongitude(parseFloat(e.target.value)); setMapPinSet(true); }}
                  placeholder="40.0235"
                />
              </div>
            </div>

            {mapPinSet && (
              <div className="flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-200 p-3">
                <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-teal-700">Location set: {latitude}, {longitude}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Review & Submit */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Review Your Boat Listing</h3>

            <div className="space-y-4 divide-y divide-gray-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Boat Name</p>
                  <p className="font-medium text-gray-900">{name || <span className="text-red-500 italic">Not set</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="font-medium text-gray-900 capitalize">{boatType.replace(/_/g, ' ')}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4">
                <div>
                  <p className="text-xs text-gray-500">Capacity</p>
                  <p className="font-medium text-gray-900">{capacity} guests</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Length</p>
                  <p className="font-medium text-gray-900">{length ? `${length} ft` : 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Crew</p>
                  <p className="font-medium text-gray-900">{crewSize}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <p className="text-xs text-gray-500">Departure Point</p>
                  <p className="text-sm text-gray-700">{departurePoint}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Map Pin</p>
                  <p className="text-sm text-gray-700">{mapPinSet ? `${latitude}, ${longitude}` : <span className="text-gray-400">Not set</span>}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4">
                <div>
                  <p className="text-xs text-gray-500">Trip Packages</p>
                  <p className="font-medium text-gray-900">{trips.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Photos</p>
                  <p className="font-medium text-gray-900">{totalImages}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Species</p>
                  <p className="font-medium text-gray-900">{selectedSpecies.length} selected</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-teal-200 bg-teal-50 p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-teal-100 p-2">
                <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-teal-900">Ready to submit?</h4>
                <p className="mt-1 text-sm text-teal-800">
                  Your listing will be reviewed by our team before going live. This usually takes 1-2 business days.
                  You can save as a draft and come back to finish later.
                </p>
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pb-8">
            <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={saving} loading={saving}>
              Save as Draft
            </Button>
            <Button onClick={() => handleSubmit('submit')} disabled={saving} loading={saving}>
              Submit for Review
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      {activeTab !== 'review' && (
        <div className="flex items-center justify-between pb-8">
          <Button
            variant="outline"
            onClick={() => {
              const idx = TABS.findIndex((t) => t.id === activeTab);
              if (idx > 0) setActiveTab(TABS[idx - 1].id);
            }}
            disabled={activeTab === TABS[0].id}
          >
            Previous
          </Button>
          <Button
            onClick={() => {
              const idx = TABS.findIndex((t) => t.id === activeTab);
              if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].id);
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

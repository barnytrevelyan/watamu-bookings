'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
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
  price: number;
  currency: string;
  departure_time: string;
  includes: string;
}

const BOAT_TYPES = [
  'sportfisher',
  'deep_sea',
  'catamaran',
  'dhow',
  'speedboat',
  'sailboat',
  'pontoon',
];

const TRIP_TYPES = [
  'deep_sea_fishing',
  'reef_fishing',
  'bottom_fishing',
  'trolling',
  'popping',
  'jigging',
  'snorkeling',
  'sunset_cruise',
  'island_hopping',
  'whale_watching',
];

const TARGET_SPECIES = [
  'Marlin',
  'Sailfish',
  'Yellowfin Tuna',
  'Wahoo',
  'Dorado',
  'Giant Trevally',
  'Kingfish',
  'Barracuda',
  'Snapper',
  'Grouper',
];

const FISHING_TECHNIQUES = [
  'Trolling',
  'Bottom Fishing',
  'Popping',
  'Jigging',
  'Fly Fishing',
  'Live Bait',
  'Drift Fishing',
  'Reef Fishing',
];

export default function NewBoatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boatFeatures, setBoatFeatures] = useState<BoatFeature[]>([]);

  // Basic info
  const [name, setName] = useState('');
  const [boatType, setBoatType] = useState('sportfisher');
  const [description, setDescription] = useState('');

  // Specs
  const [length, setLength] = useState('');
  const [capacity, setCapacity] = useState('6');
  const [crewSize, setCrewSize] = useState('2');
  const [captainName, setCaptainName] = useState('');

  // Features
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  // Species & techniques
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);
  const [selectedTechniques, setSelectedTechniques] = useState<string[]>([]);

  // Trip packages
  const [trips, setTrips] = useState<TripPackage[]>([]);

  // Safety
  const [safetyEquipment, setSafetyEquipment] = useState('');

  // Location
  const [departurePoint, setDeparturePoint] = useState('Watamu Marine Park Jetty');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Images
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    async function loadFeatures() {
      const supabase = createClient();
      const { data } = await supabase
        .from('wb_boat_features')
        .select('id, name, category')
        .order('category');
      if (data) setBoatFeatures(data);
    }
    loadFeatures();
  }, []);

  function toggleFeature(id: string) {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
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
        trip_type: 'deep_sea_fishing',
        duration_hours: 4,
        price: 0,
        currency: 'KES',
        departure_time: '06:00',
        includes: '',
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
    setImagePreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
  }

  function removeImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(publish: boolean) {
    if (!user) return;
    if (!name.trim()) {
      setError('Boat name is required');
      return;
    }
    if (!capacity || parseInt(capacity) < 1) {
      setError('Capacity must be at least 1');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      const slug = name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Insert boat
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
          target_species: selectedSpecies,
          fishing_techniques: selectedTechniques,
          safety_equipment: safetyEquipment.trim() || null,
          departure_point: departurePoint.trim(),
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          is_published: publish,
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
        const { error: linkError } = await supabase
          .from('wb_boat_feature_links')
          .insert(links);
        if (linkError) throw linkError;
      }

      // Insert trip packages
      if (trips.length > 0) {
        const tripRows = trips
          .filter((t) => t.name.trim() && t.price > 0)
          .map((t) => ({
            boat_id: boat.id,
            name: t.name.trim(),
            trip_type: t.trip_type,
            duration_hours: t.duration_hours,
            price: t.price,
            currency: t.currency,
            departure_time: t.departure_time,
            includes: t.includes.trim() || null,
          }));

        if (tripRows.length > 0) {
          const { error: tripError } = await supabase
            .from('wb_boat_trips')
            .insert(tripRows);
          if (tripError) throw tripError;
        }
      }

      // Upload images
      if (imageFiles.length > 0) {
        const imageRows = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const ext = file.name.split('.').pop();
          const path = `boats/${boat.id}/${Date.now()}-${i}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from('images')
            .upload(path, file);
          if (uploadErr) throw uploadErr;

          const {
            data: { publicUrl },
          } = supabase.storage.from('images').getPublicUrl(path);

          imageRows.push({
            boat_id: boat.id,
            url: publicUrl,
            alt: `${name} - Image ${i + 1}`,
            sort_order: i,
            is_cover: i === 0,
          });
        }

        const { error: imgError } = await supabase
          .from('wb_images')
          .insert(imageRows);
        if (imgError) throw imgError;
      }

      router.push('/dashboard/boats');
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          &larr; Back
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Add New Boat</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Basic Information</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Boat Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diani Explorer" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Boat Type</label>
            <Select value={boatType} onChange={(e) => setBoatType(e.target.value)}>
              {BOAT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the boat, its history, and fishing capabilities..."
              rows={4}
            />
          </div>
        </div>
      </Card>

      {/* Specs */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Specifications</h2>
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
        </div>
      </Card>

      {/* Features */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Features</h2>
        {Object.entries(featuresByCategory).length === 0 ? (
          <p className="text-sm text-gray-500">No features available.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(featuresByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">{category}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((feature) => (
                    <label
                      key={feature.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                        selectedFeatures.includes(feature.id)
                          ? 'border-teal-500 bg-teal-50'
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
        )}
      </Card>

      {/* Target Species & Techniques */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Fishing Details</h2>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Target Species</h3>
            <div className="flex flex-wrap gap-2">
              {TARGET_SPECIES.map((species) => (
                <button
                  key={species}
                  type="button"
                  onClick={() => toggleSpecies(species)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    selectedSpecies.includes(species)
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {species}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Fishing Techniques</h3>
            <div className="flex flex-wrap gap-2">
              {FISHING_TECHNIQUES.map((tech) => (
                <button
                  key={tech}
                  type="button"
                  onClick={() => toggleTechnique(tech)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    selectedTechniques.includes(tech)
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
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

      {/* Trip Packages */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Trip Packages</h2>
          <Button variant="outline" size="sm" onClick={addTrip}>
            + Add Trip
          </Button>
        </div>
        {trips.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            No trip packages added yet. Add at least one to accept bookings.
          </p>
        ) : (
          <div className="space-y-6">
            {trips.map((trip, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">Trip #{i + 1}</h4>
                  <Button variant="ghost" size="sm" onClick={() => removeTrip(i)}>
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-gray-600">Trip Name</label>
                    <Input
                      value={trip.name}
                      onChange={(e) => updateTrip(i, 'name', e.target.value)}
                      placeholder="e.g. Half Day Deep Sea Fishing"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Type</label>
                    <Select
                      value={trip.trip_type}
                      onChange={(e) => updateTrip(i, 'trip_type', e.target.value)}
                    >
                      {TRIP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Duration (hours)</label>
                    <Input
                      type="number"
                      min="1"
                      value={trip.duration_hours}
                      onChange={(e) => updateTrip(i, 'duration_hours', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Price</label>
                    <Input
                      type="number"
                      min="0"
                      value={trip.price || ''}
                      onChange={(e) => updateTrip(i, 'price', parseFloat(e.target.value) || 0)}
                      placeholder="25000"
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
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-gray-600">What&apos;s Included</label>
                    <Textarea
                      value={trip.includes}
                      onChange={(e) => updateTrip(i, 'includes', e.target.value)}
                      placeholder="Fishing gear, bait, refreshments, lunch..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Safety Equipment */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Safety Equipment</h2>
        <Textarea
          value={safetyEquipment}
          onChange={(e) => setSafetyEquipment(e.target.value)}
          placeholder="Life jackets, first aid kit, fire extinguisher, radio, GPS, flares..."
          rows={3}
        />
      </Card>

      {/* Location */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Departure Location</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Departure Point</label>
            <Input value={departurePoint} onChange={(e) => setDeparturePoint(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Latitude</label>
              <Input type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-3.3544" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Longitude</label>
              <Input type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="40.0235" />
            </div>
          </div>
        </div>
      </Card>

      {/* Images */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Images</h2>
        <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6">
          <label className="cursor-pointer text-center">
            <p className="text-sm text-gray-600">Click to upload boat images</p>
            <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB each</p>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
          </label>
        </div>
        {imagePreviews.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {imagePreviews.map((src, i) => (
              <div key={i} className="group relative aspect-square">
                <img src={src} alt={`Preview ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-teal-600 px-1.5 py-0.5 text-xs text-white">Cover</span>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button variant="outline" onClick={() => handleSubmit(false)} disabled={saving}>
          {saving ? 'Saving...' : 'Save as Draft'}
        </Button>
        <Button onClick={() => handleSubmit(true)} disabled={saving}>
          {saving ? 'Publishing...' : 'Publish Boat'}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { TRIP_TYPE_LABELS } from '@/lib/types';
import type { TripType } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';

interface BoatFeature {
  id: string;
  name: string;
  category: string;
}

interface TripPackage {
  id?: string;
  name: string;
  trip_type: string;
  duration_hours: number;
  price: number;
  currency: string;
  departure_time: string;
  includes: string;
}

const BOAT_TYPES = ['sportfisher', 'deep_sea', 'catamaran', 'dhow', 'speedboat', 'sailboat', 'pontoon'];
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
  'Marlin', 'Sailfish', 'Yellowfin Tuna', 'Wahoo', 'Dorado', 'Giant Trevally', 'Kingfish', 'Barracuda', 'Snapper', 'Grouper',
];
const FISHING_TECHNIQUES = [
  'Trolling', 'Bottom Fishing', 'Popping', 'Jigging', 'Fly Fishing', 'Live Bait', 'Drift Fishing', 'Reef Fishing',
];

export default function EditBoatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const boatId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [allFeatures, setAllFeatures] = useState<BoatFeature[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [boatType, setBoatType] = useState('sportfisher');
  const [description, setDescription] = useState('');
  const [length, setLength] = useState('');
  const [capacity, setCapacity] = useState('6');
  const [crewSize, setCrewSize] = useState('2');
  const [captainName, setCaptainName] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);
  const [selectedTechniques, setSelectedTechniques] = useState<string[]>([]);
  const [trips, setTrips] = useState<TripPackage[]>([]);
  const [safetyEquipment, setSafetyEquipment] = useState('');
  const [departurePoint, setDeparturePoint] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [existingImages, setExistingImages] = useState<{ id: string; url: string; is_cover: boolean }[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const supabase = createClient();

        const [{ data: boat, error: boatErr }, { data: features }] = await Promise.all([
          supabase
            .from('wb_boats')
            .select(`
              *,
              wb_boat_feature_links(feature_id),
              wb_boat_trips(*),
              wb_images(id, url, is_cover, sort_order)
            `)
            .eq('id', boatId)
            .eq('owner_id', user!.id)
            .single(),
          supabase.from('wb_boat_features').select('id, name, category').order('category'),
        ]);

        if (boatErr || !boat) {
          setError('Boat not found or unauthorized');
          setLoading(false);
          return;
        }

        setName(boat.name);
        setBoatType(boat.boat_type);
        setDescription(boat.description || '');
        setLength(boat.length_ft?.toString() || '');
        setCapacity(boat.capacity?.toString() || '6');
        setCrewSize(boat.crew_size?.toString() || '2');
        setCaptainName(boat.captain_name || '');
        setSelectedSpecies(boat.target_species || []);
        setSelectedTechniques(boat.fishing_techniques || []);
        setSafetyEquipment(boat.safety_equipment || '');
        setDeparturePoint(boat.departure_point || '');
        setLatitude(boat.latitude?.toString() || '');
        setLongitude(boat.longitude?.toString() || '');
        setIsPublished(boat.is_published);
        setSelectedFeatures((boat.wb_boat_feature_links || []).map((l: any) => l.feature_id));
        setTrips(
          (boat.wb_boat_trips || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            trip_type: t.trip_type,
            duration_hours: t.duration_hours,
            price: t.price,
            currency: t.currency || 'KES',
            departure_time: t.departure_time || '06:00',
            includes: t.includes || '',
          }))
        );
        setExistingImages(
          (boat.wb_images || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
        );
        if (features) setAllFeatures(features);
      } catch {
        setError('Failed to load boat');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user, boatId]);

  function toggleFeature(id: string) {
    setSelectedFeatures((p) => (p.includes(id) ? p.filter((f) => f !== id) : [...p, id]));
  }

  function toggleSpecies(s: string) {
    setSelectedSpecies((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  }

  function toggleTechnique(t: string) {
    setSelectedTechniques((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  }

  function addTrip() {
    setTrips((p) => [...p, { name: '', trip_type: 'deep_sea_fishing', duration_hours: 4, price: 0, currency: 'KES', departure_time: '06:00', includes: '' }]);
  }

  function updateTrip(index: number, field: keyof TripPackage, value: any) {
    setTrips((p) => p.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function removeTrip(index: number) {
    setTrips((p) => p.filter((_, i) => i !== index));
  }

  function handleNewImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setNewImageFiles((p) => [...p, ...files]);
    setNewImagePreviews((p) => [...p, ...files.map((f) => URL.createObjectURL(f))]);
  }

  async function removeExistingImage(imageId: string) {
    const supabase = createClient();
    await supabase.from('wb_images').delete().eq('id', imageId);
    setExistingImages((p) => p.filter((img) => img.id !== imageId));
  }

  async function handleSubmit() {
    if (!user || !name.trim()) {
      setError('Boat name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const slug = name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '');

      const { error: updateErr } = await supabase
        .from('wb_boats')
        .update({
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
          is_published: isPublished,
        })
        .eq('id', boatId)
        .eq('owner_id', user.id);

      if (updateErr) throw updateErr;

      // Sync features
      await supabase.from('wb_boat_feature_links').delete().eq('boat_id', boatId);
      if (selectedFeatures.length > 0) {
        await supabase.from('wb_boat_feature_links').insert(
          selectedFeatures.map((feature_id) => ({ boat_id: boatId, feature_id }))
        );
      }

      // Sync trips: delete existing, re-insert all
      await supabase.from('wb_boat_trips').delete().eq('boat_id', boatId);
      const validTrips = trips.filter((t) => t.name.trim() && t.price > 0);
      if (validTrips.length > 0) {
        await supabase.from('wb_boat_trips').insert(
          validTrips.map((t) => ({
            boat_id: boatId,
            name: t.name.trim(),
            trip_type: t.trip_type,
            duration_hours: t.duration_hours,
            price: t.price,
            currency: t.currency,
            departure_time: t.departure_time,
            includes: t.includes.trim() || null,
          }))
        );
      }

      // Upload new images
      if (newImageFiles.length > 0) {
        const startOrder = existingImages.length;
        const imageRows = [];
        for (let i = 0; i < newImageFiles.length; i++) {
          const file = newImageFiles[i];
          const ext = file.name.split('.').pop();
          const path = `boats/${boatId}/${Date.now()}-${i}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from('images').upload(path, file);
          if (uploadErr) throw uploadErr;
          const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path);
          imageRows.push({
            boat_id: boatId,
            url: publicUrl,
            alt: `${name} - Image ${startOrder + i + 1}`,
            sort_order: startOrder + i,
            is_cover: existingImages.length === 0 && i === 0,
          });
        }
        await supabase.from('wb_images').insert(imageRows);
      }

      router.push('/dashboard/boats');
    } catch (err: any) {
      setError(err.message || 'Failed to update boat');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-96 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (error && !name) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const featuresByCategory = allFeatures.reduce((acc, f) => {
    const cat = f.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {} as Record<string, BoatFeature[]>);

  const tabs = [
    { value: 'basic', label: 'Basic Info' },
    { value: 'specs', label: 'Specs' },
    { value: 'features', label: 'Features' },
    { value: 'fishing', label: 'Fishing' },
    { value: 'trips', label: 'Trips' },
    { value: 'safety', label: 'Safety' },
    { value: 'location', label: 'Location' },
    { value: 'images', label: 'Images' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>&larr; Back</Button>
        <h1 className="text-2xl font-bold text-gray-900">Edit Boat</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <Card className="p-6">
        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Boat Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Boat Type</label>
              <Select value={boatType} onChange={(e) => setBoatType(e.target.value)}>
                {BOAT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-teal-600" />
              <span className="text-sm text-gray-700">Published</span>
            </label>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Length (ft)</label>
              <Input type="number" value={length} onChange={(e) => setLength(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Capacity</label>
              <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Crew Size</label>
              <Input type="number" min="1" value={crewSize} onChange={(e) => setCrewSize(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Captain Name</label>
              <Input value={captainName} onChange={(e) => setCaptainName(e.target.value)} />
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-4">
            {Object.entries(featuresByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">{category}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((f) => (
                    <label key={f.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${selectedFeatures.includes(f.id) ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={selectedFeatures.includes(f.id)} onChange={() => toggleFeature(f.id)} className="sr-only" />
                      <span>{f.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'fishing' && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Target Species</h3>
              <div className="flex flex-wrap gap-2">
                {TARGET_SPECIES.map((s) => (
                  <button key={s} type="button" onClick={() => toggleSpecies(s)} className={`rounded-full border px-3 py-1 text-sm transition-colors ${selectedSpecies.includes(s) ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-300 text-gray-600'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Fishing Techniques</h3>
              <div className="flex flex-wrap gap-2">
                {FISHING_TECHNIQUES.map((t) => (
                  <button key={t} type="button" onClick={() => toggleTechnique(t)} className={`rounded-full border px-3 py-1 text-sm transition-colors ${selectedTechniques.includes(t) ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-300 text-gray-600'}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trips' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={addTrip}>+ Add Trip</Button>
            </div>
            {trips.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">No trips yet.</p>
            ) : (
              trips.map((trip, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Trip #{i + 1}</h4>
                    <Button variant="ghost" size="sm" onClick={() => removeTrip(i)}>Remove</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Input value={trip.name} onChange={(e) => updateTrip(i, 'name', e.target.value)} placeholder="Trip name" />
                    </div>
                    <Select value={trip.trip_type} onChange={(e) => updateTrip(i, 'trip_type', e.target.value)}>
                      {TRIP_TYPES.map((t) => (
                        <option key={t} value={t}>{TRIP_TYPE_LABELS[t as TripType] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                      ))}
                    </Select>
                    <Input type="number" min="1" value={trip.duration_hours} onChange={(e) => updateTrip(i, 'duration_hours', parseInt(e.target.value))} placeholder="Hours" />
                    <Input type="number" min="0" value={trip.price || ''} onChange={(e) => updateTrip(i, 'price', parseFloat(e.target.value) || 0)} placeholder="Price" />
                    <Input type="time" value={trip.departure_time} onChange={(e) => updateTrip(i, 'departure_time', e.target.value)} />
                    <div className="col-span-2">
                      <Textarea value={trip.includes} onChange={(e) => updateTrip(i, 'includes', e.target.value)} placeholder="What's included" rows={2} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'safety' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Safety Equipment</label>
            <Textarea value={safetyEquipment} onChange={(e) => setSafetyEquipment(e.target.value)} rows={4} placeholder="Life jackets, first aid kit, radio..." />
          </div>
        )}

        {activeTab === 'location' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Departure Point</label>
              <Input value={departurePoint} onChange={(e) => setDeparturePoint(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Latitude</label>
                <Input type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Longitude</label>
                <Input type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-4">
            {existingImages.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {existingImages.map((img) => (
                  <div key={img.id} className="group relative aspect-square">
                    <img src={img.url} alt="" className="h-full w-full rounded-lg object-cover" />
                    {img.is_cover && <span className="absolute left-1 top-1 rounded bg-teal-600 px-1.5 py-0.5 text-xs text-white">Cover</span>}
                    <button type="button" onClick={() => removeExistingImage(img.id)} className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6">
              <label className="cursor-pointer text-center">
                <p className="text-sm text-gray-600">Click to upload more images</p>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleNewImages} />
              </label>
            </div>
            {newImagePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {newImagePreviews.map((src, i) => (
                  <div key={i} className="aspect-square">
                    <img src={src} alt={`New ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { TRIP_TYPE_LABELS } from '@/lib/types';
import type { TripType } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import CalendarSync from '@/components/CalendarSync';
import {
  ArrowLeft,
  Anchor,
  Ship,
  Fish,
  Package,
  ShieldCheck,
  MapPin,
  ImageIcon,
  Upload,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Users,
  User,
} from 'lucide-react';

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
  price_total: number;
  currency: string;
  departure_time: string;
  includes: string;
}

const BOAT_TYPES = ['sport_fisher', 'deep_sea', 'dhow', 'catamaran', 'speedboat', 'glass_bottom', 'kayak', 'sailboat'];
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

function prettify(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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
            price_total: t.price_total,
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
    setTrips((p) => [...p, { name: '', trip_type: 'half_day_morning', duration_hours: 4, price_total: 0, currency: 'KES', departure_time: '06:00', includes: '' }]);
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

  function removeNewImage(idx: number) {
    setNewImageFiles((p) => p.filter((_, i) => i !== idx));
    setNewImagePreviews((p) => p.filter((_, i) => i !== idx));
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
      const validTrips = trips.filter((t) => t.name.trim() && t.price_total > 0);
      if (validTrips.length > 0) {
        await supabase.from('wb_boat_trips').insert(
          validTrips.map((t) => ({
            boat_id: boatId,
            name: t.name.trim(),
            trip_type: t.trip_type,
            duration_hours: t.duration_hours,
            price_total: t.price_total,
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
            alt_text: `${name} - Image ${startOrder + i + 1}`,
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
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-40 animate-pulse rounded-3xl bg-gradient-to-br from-[var(--color-primary-50)] to-[var(--color-sandy-50)]" />
        <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (error && !name) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-red-700">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Go back</Button>
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
    { value: 'basic', label: 'Basic info' },
    { value: 'specs', label: 'Specs' },
    { value: 'features', label: 'Features' },
    { value: 'fishing', label: 'Fishing' },
    { value: 'trips', label: 'Trips' },
    { value: 'safety', label: 'Safety' },
    { value: 'location', label: 'Location' },
    { value: 'images', label: 'Images' },
  ];

  const coverImage = existingImages.find((i) => i.is_cover) || existingImages[0];
  const totalTrips = trips.filter((t) => t.name.trim()).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-32">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-primary-100)] bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-sandy-50)] p-6 sm:p-8 animate-fade-in">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--color-primary-200)] opacity-30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--color-sandy-200)] opacity-30 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => router.back()}
              className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-primary-100)] bg-white/80 text-gray-600 backdrop-blur transition-colors hover:border-[var(--color-primary-200)] hover:text-[var(--color-primary-700)]"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-4">
              {coverImage ? (
                <img
                  src={coverImage.url}
                  alt=""
                  className="h-16 w-16 rounded-2xl object-cover ring-1 ring-[var(--color-primary-100)]"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary-100)] to-[var(--color-primary-200)] text-[var(--color-primary-700)]">
                  <Anchor className="h-7 w-7" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-primary-700)]">
                    Boat
                  </span>
                  <span className="text-xs text-gray-500">{prettify(boatType)}</span>
                </div>
                <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
                  {name || 'Edit boat'}
                </h1>
                <p className="mt-0.5 text-sm text-gray-600">
                  {departurePoint || 'No departure point set'}
                  {captainName && ` · Captain ${captainName}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isPublished
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isPublished ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {isPublished ? 'Published' : 'Draft'}
            </span>
            {totalTrips > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-[var(--color-primary-100)]">
                <Package className="h-3.5 w-3.5" />
                {totalTrips} trip{totalTrips > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="animate-slide-up rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="animate-fade-in">
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <Card className="p-6 sm:p-7 animate-fade-in">
        {activeTab === 'basic' && (
          <SectionHeader icon={<Anchor className="h-4 w-4" />} title="Basic info" subtitle="Name, type and description guests see first." />
        )}
        {activeTab === 'specs' && (
          <SectionHeader icon={<Ship className="h-4 w-4" />} title="Specs" subtitle="Dimensions, capacity and crew." />
        )}
        {activeTab === 'features' && (
          <SectionHeader icon={<CheckCircle2 className="h-4 w-4" />} title="Features" subtitle={`${selectedFeatures.length} selected — tap to toggle.`} />
        )}
        {activeTab === 'fishing' && (
          <SectionHeader icon={<Fish className="h-4 w-4" />} title="Fishing" subtitle="Target species and techniques." />
        )}
        {activeTab === 'trips' && (
          <SectionHeader icon={<Package className="h-4 w-4" />} title="Trip packages" subtitle={`${totalTrips} trip${totalTrips === 1 ? '' : 's'} — what guests can book.`} />
        )}
        {activeTab === 'safety' && (
          <SectionHeader icon={<ShieldCheck className="h-4 w-4" />} title="Safety" subtitle="Equipment and certifications guests should know about." />
        )}
        {activeTab === 'location' && (
          <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Location" subtitle="Departure point and map coordinates." />
        )}
        {activeTab === 'images' && (
          <SectionHeader icon={<ImageIcon className="h-4 w-4" />} title="Images" subtitle="Cover photo leads listings and search results." />
        )}

        {activeTab === 'basic' && (
          <div className="space-y-5">
            <Field label="Boat name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Boat type">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {BOAT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBoatType(t)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                      boatType === t
                        ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] shadow-sm'
                        : 'border-gray-200 text-gray-700 hover:border-[var(--color-primary-200)] hover:bg-gray-50'
                    }`}
                  >
                    {prettify(t)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Tell guests what makes this boat special..."
              />
              <p className="mt-1 text-xs text-gray-500">{description.length} characters</p>
            </Field>

            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--color-primary-600)] focus:ring-[var(--color-primary-500)]"
                />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    {isPublished ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
                    {isPublished ? 'Published' : 'Draft'}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {isPublished
                      ? 'Visible to guests and available for booking.'
                      : 'Only you can see this listing. Publish when ready.'}
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Length (ft)">
              <Input type="number" value={length} onChange={(e) => setLength(e.target.value)} />
            </Field>
            <Field label={<><Users className="inline h-3.5 w-3.5 -mt-0.5 mr-1 text-gray-400" />Capacity</> as any}>
              <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </Field>
            <Field label="Crew size">
              <Input type="number" min="1" value={crewSize} onChange={(e) => setCrewSize(e.target.value)} />
            </Field>
            <Field label={<><User className="inline h-3.5 w-3.5 -mt-0.5 mr-1 text-gray-400" />Captain name</> as any}>
              <Input value={captainName} onChange={(e) => setCaptainName(e.target.value)} />
            </Field>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-4">
            {Object.entries(featuresByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((f) => {
                    const selected = selectedFeatures.includes(f.id);
                    return (
                      <label
                        key={f.id}
                        className={`group flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-all ${
                          selected
                            ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] shadow-sm'
                            : 'border-gray-200 hover:border-[var(--color-primary-200)] hover:bg-gray-50'
                        }`}
                      >
                        <input type="checkbox" checked={selected} onChange={() => toggleFeature(f.id)} className="sr-only" />
                        <span className={selected ? 'text-[var(--color-primary-700)] font-medium' : 'text-gray-700'}>{f.name}</span>
                        {selected && <CheckCircle2 className="ml-auto h-4 w-4 text-[var(--color-primary-600)]" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'fishing' && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Target species</h3>
              <div className="flex flex-wrap gap-2">
                {TARGET_SPECIES.map((s) => {
                  const selected = selectedSpecies.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSpecies(s)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                        selected
                          ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)] shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:border-[var(--color-primary-200)]'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fishing techniques</h3>
              <div className="flex flex-wrap gap-2">
                {FISHING_TECHNIQUES.map((t) => {
                  const selected = selectedTechniques.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTechnique(t)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                        selected
                          ? 'border-[var(--color-sandy-500)] bg-[var(--color-sandy-50)] text-[var(--color-sandy-800)] shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:border-[var(--color-sandy-300)]'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trips' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Set a trip name and non-zero price to save.
              </p>
              <Button variant="outline" size="sm" onClick={addTrip}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add trip
              </Button>
            </div>
            {trips.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-8 text-center">
                <Package className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm font-medium text-gray-700">No trip packages yet</p>
                <p className="mt-0.5 text-xs text-gray-500">Add half-day, full-day or overnight packages for guests to pick from.</p>
              </div>
            ) : (
              trips.map((trip, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-[var(--color-primary-200)]">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">
                      Trip #{i + 1}{trip.name ? ` · ${trip.name}` : ''}
                    </h4>
                    <button
                      type="button"
                      onClick={() => removeTrip(i)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Input value={trip.name} onChange={(e) => updateTrip(i, 'name', e.target.value)} placeholder="Trip name (e.g. Half-day billfish)" />
                    </div>
                    <select
                      className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]/20"
                      value={trip.trip_type}
                      onChange={(e) => updateTrip(i, 'trip_type', e.target.value)}
                    >
                      {TRIP_TYPES.map((t) => (
                        <option key={t} value={t}>{TRIP_TYPE_LABELS[t as TripType] || prettify(t)}</option>
                      ))}
                    </select>
                    <Input type="number" min="1" value={trip.duration_hours} onChange={(e) => updateTrip(i, 'duration_hours', parseInt(e.target.value))} placeholder="Hours" />
                    <Input type="number" min="0" value={trip.price_total || ''} onChange={(e) => updateTrip(i, 'price_total', parseFloat(e.target.value) || 0)} placeholder={`Price (${trip.currency})`} />
                    <Input type="time" value={trip.departure_time} onChange={(e) => updateTrip(i, 'departure_time', e.target.value)} />
                    <div className="sm:col-span-2">
                      <Textarea value={trip.includes} onChange={(e) => updateTrip(i, 'includes', e.target.value)} placeholder="What's included (tackle, bait, drinks, lunch…)" rows={2} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'safety' && (
          <Field label="Safety equipment" hint="Life jackets, EPIRB, VHF radio, first aid…">
            <Textarea value={safetyEquipment} onChange={(e) => setSafetyEquipment(e.target.value)} rows={6} placeholder="Life jackets for all guests, first aid kit, marine VHF radio, flares, PFDs…" />
          </Field>
        )}

        {activeTab === 'location' && (
          <div className="space-y-5">
            <Field label="Departure point">
              <Input value={departurePoint} onChange={(e) => setDeparturePoint(e.target.value)} placeholder="e.g. Hemingways Jetty or nearest marina…" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Latitude" hint="e.g. -3.3589">
                <Input type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
              </Field>
              <Field label="Longitude" hint="e.g. 40.0216">
                <Input type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-5">
            {existingImages.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Current photos ({existingImages.length})
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {existingImages.map((img) => (
                    <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-gray-200">
                      <img src={img.url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      {img.is_cover && (
                        <span className="absolute left-2 top-2 rounded-full bg-[var(--color-primary-600)] px-2 py-0.5 text-[11px] font-medium text-white shadow">
                          Cover
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeExistingImage(img.id)}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:bg-red-50"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50/50 p-8 text-center transition-all hover:border-[var(--color-primary-400)] hover:bg-[var(--color-primary-50)]/40 cursor-pointer">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--color-primary-600)] shadow-sm ring-1 ring-gray-200 group-hover:ring-[var(--color-primary-200)]">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Drop photos here or click to upload</p>
                <p className="mt-0.5 text-xs text-gray-500">High-resolution JPG/PNG, up to 10MB each</p>
              </div>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleNewImages} />
            </label>

            {newImagePreviews.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Pending upload ({newImagePreviews.length})
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {newImagePreviews.map((src, i) => (
                    <div key={i} className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-[var(--color-primary-200)]">
                      <img src={src} alt={`New ${i + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute left-2 top-2 rounded-full bg-[var(--color-sandy-500)] px-2 py-0.5 text-[11px] font-medium text-white">
                        New
                      </span>
                      <button
                        type="button"
                        onClick={() => removeNewImage(i)}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Calendar Sync */}
      {params.id && (
        <CalendarSync
          listingType="boat"
          listingId={params.id as string}
          listingName={name}
        />
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="hidden items-center gap-2 text-xs text-gray-500 sm:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPublished ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            {isPublished ? 'Live · changes publish instantly' : 'Draft · not visible to guests'}
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b border-gray-100 pb-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary-50)] text-[var(--color-primary-700)] ring-1 ring-[var(--color-primary-100)]">
        {icon}
      </span>
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-gray-800">
        <span>
          {label}
          {required && <span className="ml-0.5 text-[var(--color-coral-500)]">*</span>}
        </span>
        {hint && <span className="text-xs font-normal text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

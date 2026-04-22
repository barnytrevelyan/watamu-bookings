'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { useBrand } from '@/lib/places/BrandProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import CalendarSync from '@/components/CalendarSync';
import {
  ArrowLeft,
  Home,
  MapPin,
  Users,
  Wallet,
  Sparkles,
  Scroll,
  ImageIcon,
  Upload,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  BarChart3,
  DoorOpen,
} from 'lucide-react';

interface Amenity {
  id: string;
  name: string;
  icon: string | null;
  category: string;
}

const PROPERTY_TYPES = [
  'villa', 'apartment', 'cottage', 'house', 'hotel', 'banda', 'bungalow', 'studio', 'penthouse', 'beach_house',
];
const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict'];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '');
}

function prettify(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EditPropertyPage() {
  const brand = useBrand();
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [allAmenities, setAllAmenities] = useState<Amenity[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [propertyType, setPropertyType] = useState('villa');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(brand.placeName);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [bedrooms, setBedrooms] = useState('1');
  const [bathrooms, setBathrooms] = useState('1');
  const [maxGuests, setMaxGuests] = useState('2');
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOutTime, setCheckOutTime] = useState('10:00');
  const [basePrice, setBasePrice] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [cancellationPolicy, setCancellationPolicy] = useState('moderate');
  const [houseRules, setHouseRules] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [existingImages, setExistingImages] = useState<
    { id: string; url: string; alt_text: string; is_cover: boolean }[]
  >([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    async function loadProperty() {
      try {
        const supabase = createClient();

        const [{ data: property, error: propError }, { data: amenities }] =
          await Promise.all([
            supabase
              .from('wb_properties')
              .select(
                `
                *,
                wb_property_amenities(amenity_id),
                wb_images(id, url, alt_text, is_cover, sort_order)
              `
              )
              .eq('id', propertyId)
              .eq('owner_id', user!.id)
              .single(),
            supabase
              .from('wb_amenities')
              .select('id, name, icon, category')
              .order('category'),
          ]);

        if (propError || !property) {
          setError('Property not found or you do not have permission to edit it.');
          setLoading(false);
          return;
        }

        // Populate form
        setName(property.name);
        setSlug(property.slug);
        setPropertyType(property.property_type);
        setDescription(property.description || '');
        setAddress(property.address || '');
        setCity(property.city || brand.placeName);
        setLatitude(property.latitude?.toString() || '');
        setLongitude(property.longitude?.toString() || '');
        setBedrooms(property.bedrooms?.toString() || '1');
        setBathrooms(property.bathrooms?.toString() || '1');
        setMaxGuests(property.max_guests?.toString() || '2');
        setCheckInTime(property.check_in_time || '14:00');
        setCheckOutTime(property.check_out_time || '10:00');
        setBasePrice(property.base_price_per_night?.toString() || '');
        setCurrency(property.currency || 'KES');
        setCancellationPolicy(property.cancellation_policy || 'moderate');
        setHouseRules(property.house_rules || '');
        setIsPublished(property.is_published);
        setSelectedAmenities(
          (property.wb_property_amenities || []).map((pa: any) => pa.amenity_id)
        );
        setExistingImages(
          (property.wb_images || []).sort(
            (a: any, b: any) => a.sort_order - b.sort_order
          )
        );
        if (amenities) setAllAmenities(amenities);
      } catch (err) {
        setError('Failed to load property');
      } finally {
        setLoading(false);
      }
    }

    loadProperty();
  }, [user, propertyId]);

  function toggleAmenity(id: string) {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function handleNewImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setNewImageFiles((prev) => [...prev, ...files]);
    setNewImagePreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
  }

  function removeNewImage(idx: number) {
    setNewImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setNewImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function removeExistingImage(imageId: string) {
    const supabase = createClient();
    await supabase.from('wb_images').delete().eq('id', imageId);
    setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
  }

  async function handleSubmit() {
    if (!user || !name.trim() || !basePrice) {
      setError('Name and price are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      // Update property
      const { error: updateError } = await supabase
        .from('wb_properties')
        .update({
          name: name.trim(),
          slug: slugify(name),
          property_type: propertyType,
          description: description.trim(),
          address: address.trim(),
          city: city.trim(),
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          bedrooms: parseInt(bedrooms),
          bathrooms: parseInt(bathrooms),
          max_guests: parseInt(maxGuests),
          check_in_time: checkInTime,
          check_out_time: checkOutTime,
          base_price_per_night: parseFloat(basePrice),
          currency,
          cancellation_policy: cancellationPolicy,
          house_rules: houseRules.trim() || null,
          is_published: isPublished,
        })
        .eq('id', propertyId)
        .eq('owner_id', user.id);

      if (updateError) throw updateError;

      // Sync amenities: delete all then re-insert
      await supabase
        .from('wb_property_amenities')
        .delete()
        .eq('property_id', propertyId);

      if (selectedAmenities.length > 0) {
        await supabase.from('wb_property_amenities').insert(
          selectedAmenities.map((amenity_id) => ({
            property_id: propertyId,
            amenity_id,
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
          const path = `properties/${propertyId}/${Date.now()}-${i}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(path, file);
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from('images').getPublicUrl(path);

          imageRows.push({
            property_id: propertyId,
            url: publicUrl,
            alt_text: `${name} - Image ${startOrder + i + 1}`,
            sort_order: startOrder + i,
            is_cover: existingImages.length === 0 && i === 0,
          });
        }

        await supabase.from('wb_images').insert(imageRows);
      }

      router.push('/dashboard/properties');
    } catch (err: any) {
      setError(err.message || 'Failed to update property');
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
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-red-700">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/dashboard/properties')}
          >
            Back to Properties
          </Button>
        </div>
      </div>
    );
  }

  const amenitiesByCategory = allAmenities.reduce(
    (acc, a) => {
      const cat = a.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(a);
      return acc;
    },
    {} as Record<string, Amenity[]>
  );

  const tabs = [
    { value: 'basic', label: 'Basic info' },
    { value: 'location', label: 'Location' },
    { value: 'details', label: 'Details' },
    { value: 'pricing', label: 'Pricing' },
    { value: 'amenities', label: 'Amenities' },
    { value: 'rules', label: 'House rules' },
    { value: 'images', label: 'Images' },
  ];

  const coverImage = existingImages.find((i) => i.is_cover) || existingImages[0];

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
                  <Home className="h-7 w-7" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-primary-700)]">
                    Property
                  </span>
                  <span className="text-xs text-gray-500">{prettify(propertyType)}</span>
                </div>
                <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
                  {name || 'Edit property'}
                </h1>
                <p className="mt-0.5 text-sm text-gray-600">
                  {city}{address ? ` · ${address}` : ''}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/dashboard/properties/${propertyId}/rooms`)}
            >
              <DoorOpen className="mr-1.5 h-4 w-4" />
              Rooms
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/dashboard/properties/${propertyId}/analytics`)}
            >
              <BarChart3 className="mr-1.5 h-4 w-4" />
              Analytics
            </Button>
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
          <SectionHeader icon={<Home className="h-4 w-4" />} title="Basic info" subtitle="Name, type, and description guests see first." />
        )}
        {activeTab === 'location' && (
          <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Location" subtitle="Where the property is and how to find it." />
        )}
        {activeTab === 'details' && (
          <SectionHeader icon={<Users className="h-4 w-4" />} title="Details" subtitle="Capacity, rooms, and check-in times." />
        )}
        {activeTab === 'pricing' && (
          <SectionHeader icon={<Wallet className="h-4 w-4" />} title="Pricing" subtitle="Rate, currency, and cancellation policy." />
        )}
        {activeTab === 'amenities' && (
          <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="Amenities" subtitle={`${selectedAmenities.length} selected — tap to toggle.`} />
        )}
        {activeTab === 'rules' && (
          <SectionHeader icon={<Scroll className="h-4 w-4" />} title="House rules" subtitle="One rule per line. Shown to guests before they book." />
        )}
        {activeTab === 'images' && (
          <SectionHeader icon={<ImageIcon className="h-4 w-4" />} title="Images" subtitle="Cover photo leads listings and search results." />
        )}

        {activeTab === 'basic' && (
          <div className="space-y-5">
            <Field label="Property name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Property type">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {PROPERTY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPropertyType(t)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                      propertyType === t
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
                rows={6}
                placeholder="Tell guests what makes this place special..."
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

        {activeTab === 'location' && (
          <div className="space-y-5">
            <Field label="Address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, landmark, neighbourhood" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="City">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="Country">
                <Input value="Kenya" disabled />
              </Field>
            </div>
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

        {activeTab === 'details' && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Bedrooms">
                <Input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
              </Field>
              <Field label="Bathrooms">
                <Input type="number" min="0" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
              </Field>
              <Field label="Max guests">
                <Input type="number" min="1" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Check-in">
                <Input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
              </Field>
              <Field label="Check-out">
                <Input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Base price per night" required>
                <Input type="number" min="0" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
              </Field>
              <Field label="Currency">
                <div className="flex gap-2">
                  {['KES', 'USD', 'EUR', 'GBP'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                        currency === c
                          ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                          : 'border-gray-200 text-gray-700 hover:border-[var(--color-primary-200)]'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Cancellation policy">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {CANCELLATION_POLICIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCancellationPolicy(p)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      cancellationPolicy === p
                        ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                        : 'border-gray-200 hover:border-[var(--color-primary-200)]'
                    }`}
                  >
                    <div className={`text-sm font-medium ${cancellationPolicy === p ? 'text-[var(--color-primary-700)]' : 'text-gray-900'}`}>
                      {prettify(p)}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {p === 'flexible' && 'Full refund 24h before'}
                      {p === 'moderate' && 'Full refund 5 days before'}
                      {p === 'strict' && '50% refund 7 days before'}
                    </div>
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {activeTab === 'amenities' && (
          <div className="space-y-6">
            {Object.entries(amenitiesByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {category}
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((amenity) => {
                    const selected = selectedAmenities.includes(amenity.id);
                    return (
                      <label
                        key={amenity.id}
                        className={`group flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-all ${
                          selected
                            ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] shadow-sm'
                            : 'border-gray-200 hover:border-[var(--color-primary-200)] hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleAmenity(amenity.id)}
                          className="sr-only"
                        />
                        {amenity.icon && <span className="text-lg">{amenity.icon}</span>}
                        <span className={selected ? 'text-[var(--color-primary-700)] font-medium' : 'text-gray-700'}>
                          {amenity.name}
                        </span>
                        {selected && <CheckCircle2 className="ml-auto h-4 w-4 text-[var(--color-primary-600)]" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'rules' && (
          <Field label="House rules" hint="Add one rule per line. Guests agree to these when booking.">
            <Textarea
              value={houseRules}
              onChange={(e) => setHouseRules(e.target.value)}
              placeholder={'No smoking indoors\nQuiet hours after 10pm\nNo pets'}
              rows={10}
            />
          </Field>
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
                      <img src={img.url} alt={img.alt_text} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
          listingType="property"
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
            <Button variant="outline" onClick={() => router.push('/dashboard/properties')}>
              Cancel
            </Button>
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
  label: string;
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

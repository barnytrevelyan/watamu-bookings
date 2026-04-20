'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
// Select replaced with plain <select> for compatibility
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import CalendarSync from '@/components/CalendarSync';
import BillingModePicker from '@/components/BillingModePicker';

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

export default function EditPropertyPage() {
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
  const [city, setCity] = useState('Watamu');
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
  const [billingMode, setBillingMode] = useState<'commission' | 'subscription'>('commission');
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
        setCity(property.city || 'Watamu');
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
        setBillingMode((property.billing_mode as 'commission' | 'subscription') || 'commission');
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
          billing_mode: billingMode,
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
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-96 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (error && !name) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
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
    { value: 'basic', label: 'Basic Info' },
    { value: 'location', label: 'Location' },
    { value: 'details', label: 'Details' },
    { value: 'pricing', label: 'Pricing' },
    { value: 'amenities', label: 'Amenities' },
    { value: 'rules', label: 'House Rules' },
    { value: 'images', label: 'Images' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            &larr; Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Edit Property</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/dashboard/properties/${propertyId}/rooms`)
            }
          >
            Manage Rooms
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/dashboard/properties/${propertyId}/analytics`)
            }
          >
            Analytics
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <Card className="p-6">
        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Property Name *
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Property Type
              </label>
              <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="published"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600"
              />
              <label htmlFor="published" className="text-sm text-gray-700">
                Published (visible to guests)
              </label>
            </div>
          </div>
        )}

        {activeTab === 'location' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Country</label>
                <Input value="Kenya" disabled />
              </div>
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

        {activeTab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bedrooms</label>
                <Input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bathrooms</label>
                <Input type="number" min="0" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Max Guests</label>
                <Input type="number" min="1" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Check-in Time</label>
                <Input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Check-out Time</label>
                <Input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-4">
            <BillingModePicker value={billingMode} onChange={setBillingMode} compact />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Base Price Per Night *</label>
                <Input type="number" min="0" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
                <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cancellation Policy</label>
              <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)}>
                {CANCELLATION_POLICIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {activeTab === 'amenities' && (
          <div className="space-y-6">
            {Object.entries(amenitiesByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">{category}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((amenity) => (
                    <label
                      key={amenity.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                        selectedAmenities.includes(amenity.id)
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAmenities.includes(amenity.id)}
                        onChange={() => toggleAmenity(amenity.id)}
                        className="sr-only"
                      />
                      {amenity.icon && <span className="text-lg">{amenity.icon}</span>}
                      <span>{amenity.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'rules' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">House Rules</label>
            <Textarea
              value={houseRules}
              onChange={(e) => setHouseRules(e.target.value)}
              placeholder="One rule per line..."
              rows={8}
            />
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-4">
            {existingImages.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Current Images</h3>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {existingImages.map((img) => (
                    <div key={img.id} className="group relative aspect-square">
                      <img src={img.url} alt={img.alt_text} className="h-full w-full rounded-lg object-cover" />
                      {img.is_cover && (
                        <span className="absolute left-1 top-1 rounded bg-teal-600 px-1.5 py-0.5 text-xs text-white">
                          Cover
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeExistingImage(img.id)}
                        className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
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

      {/* Calendar Sync */}
      {params.id && (
        <CalendarSync
          listingType="property"
          listingId={params.id as string}
          listingName={name}
        />
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push('/dashboard/properties')}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

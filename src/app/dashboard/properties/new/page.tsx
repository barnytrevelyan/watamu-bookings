'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';

interface Amenity {
  id: string;
  name: string;
  icon: string | null;
  category: string;
}

const PROPERTY_TYPES = [
  'villa',
  'apartment',
  'cottage',
  'house',
  'bungalow',
  'studio',
  'penthouse',
  'beach_house',
];

const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict'];

const STEPS = [
  'Basic Info',
  'Location',
  'Details',
  'Pricing',
  'Amenities',
  'House Rules',
  'Images',
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NewPropertyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<Amenity[]>([]);

  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [propertyType, setPropertyType] = useState('villa');
  const [description, setDescription] = useState('');

  // Step 2: Location
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Watamu');
  const [country] = useState('Kenya');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Step 3: Details
  const [bedrooms, setBedrooms] = useState('1');
  const [bathrooms, setBathrooms] = useState('1');
  const [maxGuests, setMaxGuests] = useState('2');
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOutTime, setCheckOutTime] = useState('10:00');

  // Step 4: Pricing
  const [basePrice, setBasePrice] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [cancellationPolicy, setCancellationPolicy] = useState('moderate');

  // Step 5: Amenities
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  // Step 6: House Rules
  const [houseRules, setHouseRules] = useState('');

  // Step 7: Images
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    async function fetchAmenities() {
      const supabase = createClient();
      const { data } = await supabase
        .from('wb_amenities')
        .select('id, name, icon, category')
        .order('category', { ascending: true });
      if (data) setAmenities(data);
    }
    fetchAmenities();
  }, []);

  useEffect(() => {
    setSlug(slugify(name));
  }, [name]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setImageFiles((prev) => [...prev, ...files]);
    const previews = files.map((f) => URL.createObjectURL(f));
    setImagePreviews((prev) => [...prev, ...previews]);
  }

  function removeImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }

  function toggleAmenity(id: string) {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function validateStep(): boolean {
    setError(null);
    switch (step) {
      case 0:
        if (!name.trim()) {
          setError('Property name is required');
          return false;
        }
        if (!description.trim()) {
          setError('Description is required');
          return false;
        }
        return true;
      case 1:
        if (!address.trim()) {
          setError('Address is required');
          return false;
        }
        if (!city.trim()) {
          setError('City is required');
          return false;
        }
        return true;
      case 2:
        if (
          parseInt(bedrooms) < 0 ||
          parseInt(bathrooms) < 0 ||
          parseInt(maxGuests) < 1
        ) {
          setError('Invalid details values');
          return false;
        }
        return true;
      case 3:
        if (!basePrice || parseFloat(basePrice) <= 0) {
          setError('Base price must be greater than 0');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  function nextStep() {
    if (validateStep()) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  function prevStep() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(publish: boolean) {
    if (!user) return;
    if (!validateStep()) return;

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      // Insert property
      const { data: property, error: insertError } = await supabase
        .from('wb_properties')
        .insert({
          owner_id: user.id,
          name: name.trim(),
          slug,
          property_type: propertyType,
          description: description.trim(),
          address: address.trim(),
          city: city.trim(),
          country,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          bedrooms: parseInt(bedrooms),
          bathrooms: parseInt(bathrooms),
          max_guests: parseInt(maxGuests),
          check_in_time: checkInTime,
          check_out_time: checkOutTime,
          base_price: parseFloat(basePrice),
          currency,
          cancellation_policy: cancellationPolicy,
          house_rules: houseRules.trim() || null,
          is_published: publish,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Insert amenities
      if (selectedAmenities.length > 0) {
        const amenityRows = selectedAmenities.map((amenity_id) => ({
          property_id: property.id,
          amenity_id,
        }));
        const { error: amenityError } = await supabase
          .from('wb_property_amenities')
          .insert(amenityRows);
        if (amenityError) throw amenityError;
      }

      // Upload images
      if (imageFiles.length > 0) {
        const imageRows = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const ext = file.name.split('.').pop();
          const path = `properties/${property.id}/${Date.now()}-${i}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(path, file);
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from('images').getPublicUrl(path);

          imageRows.push({
            property_id: property.id,
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

      router.push('/dashboard/properties');
    } catch (err: any) {
      setError(err.message || 'Failed to create property');
    } finally {
      setSaving(false);
    }
  }

  // Group amenities by category
  const amenitiesByCategory = amenities.reduce(
    (acc, a) => {
      const cat = a.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(a);
      return acc;
    },
    {} as Record<string, Amenity[]>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          &larr; Back
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Add New Property</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => {
                if (i < step) setStep(i);
              }}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                i === step
                  ? 'bg-teal-600 text-white'
                  : i < step
                    ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 ${
                  i < step ? 'bg-teal-400' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <p className="text-center text-sm font-medium text-gray-600">
        {STEPS[step]}
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="p-6">
        {/* Step 1: Basic Info */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Property Name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bahari Villa Watamu"
              />
              {slug && (
                <p className="mt-1 text-xs text-gray-500">
                  Slug: <span className="font-mono">{slug}</span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Property Type *
              </label>
              <Select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description *
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your property, its unique features, and what makes it special..."
                rows={5}
              />
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Address *
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Turtle Bay Road, Watamu"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  City *
                </label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Watamu"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Country
                </label>
                <Input value={country} disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Latitude
                </label>
                <Input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="-3.3544"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Longitude
                </label>
                <Input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="40.0235"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Bedrooms
                </label>
                <Input
                  type="number"
                  min="0"
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Bathrooms
                </label>
                <Input
                  type="number"
                  min="0"
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Max Guests *
                </label>
                <Input
                  type="number"
                  min="1"
                  value={maxGuests}
                  onChange={(e) => setMaxGuests(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Check-in Time
                </label>
                <Input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Check-out Time
                </label>
                <Input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Pricing */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Base Price Per Night *
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="5000"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Currency
                </label>
                <Select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="KES">KES (Kenyan Shilling)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Cancellation Policy
              </label>
              <Select
                value={cancellationPolicy}
                onChange={(e) => setCancellationPolicy(e.target.value)}
              >
                {CANCELLATION_POLICIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-gray-500">
                {cancellationPolicy === 'flexible' &&
                  'Guests can cancel up to 24 hours before check-in for a full refund.'}
                {cancellationPolicy === 'moderate' &&
                  'Guests can cancel up to 5 days before check-in for a full refund.'}
                {cancellationPolicy === 'strict' &&
                  'Guests receive a 50% refund if cancelled at least 7 days before check-in.'}
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Amenities */}
        {step === 4 && (
          <div className="space-y-6">
            {Object.entries(amenitiesByCategory).length === 0 ? (
              <p className="text-sm text-gray-500">
                No amenities found. You can add them later.
              </p>
            ) : (
              Object.entries(amenitiesByCategory).map(([category, items]) => (
                <div key={category}>
                  <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">
                    {category}
                  </h3>
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
                        {amenity.icon && (
                          <span className="text-lg">{amenity.icon}</span>
                        )}
                        <span>{amenity.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Step 6: House Rules */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                House Rules
              </label>
              <Textarea
                value={houseRules}
                onChange={(e) => setHouseRules(e.target.value)}
                placeholder={
                  'Enter each rule on a new line, e.g.:\nNo smoking indoors\nNo parties or events\nQuiet hours: 10pm - 7am\nPets allowed with prior approval'
                }
                rows={8}
              />
              <p className="mt-1 text-xs text-gray-500">
                One rule per line. These will be visible to guests before
                booking.
              </p>
            </div>
          </div>
        )}

        {/* Step 7: Images */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Property Images
              </label>
              <div className="mt-2 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6">
                <label className="cursor-pointer text-center">
                  <svg
                    className="mx-auto h-10 w-10 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">
                    Click to upload images
                  </p>
                  <p className="text-xs text-gray-500">
                    PNG, JPG, WEBP up to 10MB each
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </label>
              </div>
            </div>
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="group relative aspect-square">
                    <img
                      src={src}
                      alt={`Preview ${i + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-teal-600 px-1.5 py-0.5 text-xs text-white">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={step === 0}
        >
          Previous
        </Button>
        <div className="flex gap-3">
          {step === STEPS.length - 1 ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleSubmit(false)}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button onClick={() => handleSubmit(true)} disabled={saving}>
                {saving ? 'Publishing...' : 'Publish Property'}
              </Button>
            </>
          ) : (
            <Button onClick={nextStep}>Next</Button>
          )}
        </div>
      </div>
    </div>
  );
}

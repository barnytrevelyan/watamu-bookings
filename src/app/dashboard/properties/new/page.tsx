'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
// import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { amenityIconFor, AMENITY_CATEGORY_LABEL } from '@/lib/amenityIcons';

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
  'hotel',
  'banda',
  'bungalow',
  'studio',
  'penthouse',
  'beach_house',
];

const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict'];

const TABS = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'photos', label: 'Photos' },
  { id: 'map', label: 'Map Pin' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'review', label: 'Review & Submit' },
];

const DEFAULT_AMENITIES: Record<string, { name: string; icon: string }[]> = {
  General: [
    { name: 'WiFi', icon: '📶' },
    { name: 'Parking', icon: '🅿️' },
    { name: 'Air Conditioning', icon: '❄️' },
    { name: 'Generator', icon: '⚡' },
  ],
  Kitchen: [
    { name: 'Full Kitchen', icon: '🍳' },
    { name: 'BBQ', icon: '🔥' },
    { name: 'Fridge', icon: '🧊' },
  ],
  'Pool & Outdoor': [
    { name: 'Swimming Pool', icon: '🏊' },
    { name: 'Garden', icon: '🌿' },
    { name: 'Beach Access', icon: '🏖️' },
    { name: 'Balcony', icon: '🌅' },
  ],
  Safety: [
    { name: 'Security Guard', icon: '💂' },
    { name: 'Safe', icon: '🔒' },
    { name: 'First Aid', icon: '🩹' },
    { name: 'Fire Extinguisher', icon: '🧯' },
  ],
  Entertainment: [
    { name: 'TV', icon: '📺' },
    { name: 'Board Games', icon: '🎲' },
    { name: 'Books', icon: '📚' },
  ],
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

      // Fix default icon paths
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

      // Add initial marker if coords exist
      if (lat !== -3.354 || lng !== 40.024) {
        markerRef.current = L.marker([lat, lng], { icon: tealIcon }).addTo(map);
      }

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

export default function NewPropertyPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<Amenity[]>([]);

  // Basic Info
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [propertyType, setPropertyType] = useState('villa');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Watamu');
  const [country] = useState('Kenya');
  const [bedrooms, setBedrooms] = useState('1');
  const [bathrooms, setBathrooms] = useState('1');
  const [maxGuests, setMaxGuests] = useState('2');
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOutTime, setCheckOutTime] = useState('10:00');
  const [houseRules, setHouseRules] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  // Map
  const [latitude, setLatitude] = useState(-3.354);
  const [longitude, setLongitude] = useState(40.024);
  const [mapPinSet, setMapPinSet] = useState(false);

  // Photos
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [urlInput, setUrlInput] = useState('');

  // Amenities
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedDefaultAmenities, setSelectedDefaultAmenities] = useState<string[]>([]);

  // Pricing
  const [basePrice, setBasePrice] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [cancellationPolicy, setCancellationPolicy] = useState('moderate');
  const [lowSeasonPrice, setLowSeasonPrice] = useState('');
  const [highSeasonPrice, setHighSeasonPrice] = useState('');
  const [peakSeasonPrice, setPeakSeasonPrice] = useState('');
  const [lowSeasonMonths, setLowSeasonMonths] = useState<string[]>(['Apr', 'May', 'Jun']);
  const [highSeasonMonths, setHighSeasonMonths] = useState<string[]>(['Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Oct']);
  const [peakSeasonMonths, setPeakSeasonMonths] = useState<string[]>(['Nov', 'Dec']);

  useEffect(() => {
    async function fetchAmenities() {
      const supabase = createClient();
      const { data } = await supabase
        .from('wb_amenities')
        .select('id, name, icon, category')
        .order('category', { ascending: true });
      if (data && data.length > 0) setAmenities(data);
    }
    fetchAmenities();
  }, []);

  useEffect(() => {
    setSlug(slugify(name));
  }, [name]);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setLatitude(parseFloat(lat.toFixed(6)));
    setLongitude(parseFloat(lng.toFixed(6)));
    setMapPinSet(true);
  }, []);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setImageFiles((prev) => [...prev, ...files]);
    const previews = files.map((f) => URL.createObjectURL(f));
    setImagePreviews((prev) => [...prev, ...previews]);
  }

  function removeImage(index: number) {
    if (index < imageFiles.length) {
      // It's a file upload
      setImageFiles((prev) => prev.filter((_, i) => i !== index));
      setImagePreviews((prev) => {
        URL.revokeObjectURL(prev[index]);
        return prev.filter((_, i) => i !== index);
      });
    } else {
      // It's a URL
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

  // Drag reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    // Reorder all images (files + URLs combined)
    const totalFiles = [...imagePreviews];
    const totalUrls = [...imageUrls];

    // We track order by position in combined array
    // For simplicity, reorder previews and files together
    if (dragIndex < imageFiles.length && index < imageFiles.length) {
      const newFiles = [...imageFiles];
      const newPreviews = [...imagePreviews];
      const [movedFile] = newFiles.splice(dragIndex, 1);
      const [movedPreview] = newPreviews.splice(dragIndex, 1);
      newFiles.splice(index, 0, movedFile);
      newPreviews.splice(index, 0, movedPreview);
      setImageFiles(newFiles);
      setImagePreviews(newPreviews);
    }

    if (coverIndex === dragIndex) setCoverIndex(index);
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function toggleAmenity(id: string) {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function toggleDefaultAmenity(name: string) {
    setSelectedDefaultAmenities((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  function toggleSeasonMonth(season: 'low' | 'high' | 'peak', month: string) {
    const setters = {
      low: setLowSeasonMonths,
      high: setHighSeasonMonths,
      peak: setPeakSeasonMonths,
    };
    // Remove from other seasons first
    if (season !== 'low') setLowSeasonMonths((prev) => prev.filter((m) => m !== month));
    if (season !== 'high') setHighSeasonMonths((prev) => prev.filter((m) => m !== month));
    if (season !== 'peak') setPeakSeasonMonths((prev) => prev.filter((m) => m !== month));

    setters[season]((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    );
  }

  function getMonthSeason(month: string): 'low' | 'high' | 'peak' | null {
    if (lowSeasonMonths.includes(month)) return 'low';
    if (highSeasonMonths.includes(month)) return 'high';
    if (peakSeasonMonths.includes(month)) return 'peak';
    return null;
  }

  const totalImages = imageFiles.length + imageUrls.length;

  function validate(): string | null {
    if (!name.trim()) return 'Property name is required';
    if (!description.trim()) return 'Description is required';
    if (!address.trim()) return 'Address is required';
    if (!basePrice || parseFloat(basePrice) <= 0) return 'Base price must be greater than 0';
    if (parseInt(maxGuests) < 1) return 'Max guests must be at least 1';
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
          latitude: mapPinSet ? latitude : null,
          longitude: mapPinSet ? longitude : null,
          bedrooms: parseInt(bedrooms),
          bathrooms: parseInt(bathrooms),
          max_guests: parseInt(maxGuests),
          check_in_time: checkInTime,
          check_out_time: checkOutTime,
          base_price_per_night: parseFloat(basePrice),
          currency,
          cancellation_policy: cancellationPolicy,
          house_rules: houseRules.trim() || null,
          video_url: videoUrl.trim() || null,
          is_published: false,
          status,
          low_season_price: lowSeasonPrice ? parseFloat(lowSeasonPrice) : null,
          high_season_price: highSeasonPrice ? parseFloat(highSeasonPrice) : null,
          peak_season_price: peakSeasonPrice ? parseFloat(peakSeasonPrice) : null,
          low_season_months: lowSeasonMonths.join(','),
          high_season_months: highSeasonMonths.join(','),
          peak_season_months: peakSeasonMonths.join(','),
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Insert amenities from DB
      if (selectedAmenities.length > 0) {
        const amenityRows = selectedAmenities.map((amenity_id) => ({
          property_id: property.id,
          amenity_id,
        }));
        await supabase.from('wb_property_amenities').insert(amenityRows);
      }

      // Upload images
      const imageRows: any[] = [];
      let imgPosition = 0;

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const ext = file.name.split('.').pop();
        const path = `properties/${property.id}/${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('watamu-images')
          .upload(path, file);

        if (uploadError) {
          // Fallback: if storage fails, skip this image
          console.error('Upload failed for image', i, uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from('watamu-images').getPublicUrl(path);

        imageRows.push({
          property_id: property.id,
          listing_type: 'property',
          url: publicUrl,
          alt_text: `${name} - Image ${imgPosition + 1}`,
          sort_order: imgPosition,
          is_cover: (i === coverIndex),
        });
        imgPosition++;
      }

      // Add URL-based images
      for (let i = 0; i < imageUrls.length; i++) {
        const globalIndex = imageFiles.length + i;
        imageRows.push({
          property_id: property.id,
          listing_type: 'property',
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
        setSuccessMessage('Your listing has been submitted for review. Our team will review it and get back to you shortly.');
      } else {
        setSuccessMessage('Draft saved successfully. You can continue editing from your dashboard.');
      }

      setTimeout(() => {
        router.push('/dashboard/properties');
      }, 2500);
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

  const hasDbAmenities = amenities.length > 0;

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
          <p className="mt-4 text-sm text-gray-400">Redirecting to your properties...</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Add New Property</h1>
          <p className="text-sm text-gray-500">Create your listing step by step</p>
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Basic Info Tab */}
      {activeTab === 'basic' && (
        <Card className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Property Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bahari Villa Watamu"
                />
                {slug && (
                  <p className="mt-1 text-xs text-gray-500">
                    URL: <span className="font-mono">/properties/{slug}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Property Type *</label>
                <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description *</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your property, its unique features, the surrounding area, and what makes it special for guests visiting Watamu..."
                rows={6}
              />
              <p className="mt-1 text-xs text-gray-500">{description.length} characters</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Video tour URL <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <Input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtu.be/... or https://vimeo.com/..."
              />
              <p className="mt-1 text-xs text-gray-500">
                Paste a YouTube, Vimeo, or direct MP4 link — we'll embed it on your listing.
              </p>
            </div>

            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Location</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Address *</label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Turtle Bay Road, Watamu"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Country</label>
                    <Input value={country} disabled />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Details</h3>
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Max Guests *</label>
                  <Input type="number" min="1" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
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

            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">House Rules</h3>
              <Textarea
                value={houseRules}
                onChange={(e) => setHouseRules(e.target.value)}
                placeholder={'Enter each rule on a new line, e.g.:\nNo smoking indoors\nNo parties or events\nQuiet hours: 10pm - 7am'}
                rows={4}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Photos Tab */}
      {activeTab === 'photos' && (
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Upload Photos</h3>
              <p className="mb-4 text-xs text-gray-500">
                Add photos of your property. Drag to reorder. Click the star to set the cover photo.
              </p>

              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 hover:border-teal-400 transition-colors">
                <label className="cursor-pointer text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-700">Click to upload images</p>
                  <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB each</p>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                </label>
              </div>
            </div>

            {/* URL fallback */}
            <div>
              <p className="mb-2 text-xs text-gray-500">
                Or add images by URL (if upload fails or you have hosted images):
              </p>
              <div className="flex gap-2">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addImageUrl}>
                  Add URL
                </Button>
              </div>
            </div>

            {/* Image Previews */}
            {totalImages > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">{totalImages} image(s) added</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {/* File-based images */}
                  {imagePreviews.map((src, i) => (
                    <div
                      key={`file-${i}`}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDragEnd={handleDragEnd}
                      className={`group relative aspect-square cursor-grab rounded-lg border-2 transition-all ${
                        dragIndex === i ? 'border-teal-400 opacity-50' : 'border-transparent'
                      } ${coverIndex === i ? 'ring-2 ring-teal-500 ring-offset-2' : ''}`}
                    >
                      <img src={src} alt={`Preview ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                      {coverIndex === i && (
                        <span className="absolute left-1 top-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white">
                          Cover
                        </span>
                      )}
                      <div className="absolute inset-0 flex items-end justify-between rounded-lg bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setCoverIndex(i)}
                          className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white"
                          title="Set as cover"
                        >
                          Set Cover
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* URL-based images */}
                  {imageUrls.map((url, i) => {
                    const globalIdx = imageFiles.length + i;
                    return (
                      <div
                        key={`url-${i}`}
                        className={`group relative aspect-square rounded-lg ${
                          coverIndex === globalIdx ? 'ring-2 ring-teal-500 ring-offset-2' : ''
                        }`}
                      >
                        <img src={url} alt={`URL Image ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                        {coverIndex === globalIdx && (
                          <span className="absolute left-1 top-1 rounded bg-teal-600 px-2 py-0.5 text-xs font-medium text-white">Cover</span>
                        )}
                        <div className="absolute inset-0 flex items-end justify-between rounded-lg bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => setCoverIndex(globalIdx)}
                            className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white"
                          >
                            Set Cover
                          </button>
                          <button
                            type="button"
                            onClick={() => removeImage(globalIdx)}
                            className="rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
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

      {/* Map Pin Tab */}
      {activeTab === 'map' && (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Drop a Pin on the Map</h3>
              <p className="mb-4 text-xs text-gray-500">
                Click on the map to set your property's exact location. This helps guests find you.
              </p>
            </div>

            <MapPicker lat={latitude} lng={longitude} onLocationSelect={handleLocationSelect} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Latitude</label>
                <Input
                  type="number"
                  step="any"
                  value={mapPinSet ? latitude : ''}
                  onChange={(e) => {
                    setLatitude(parseFloat(e.target.value));
                    setMapPinSet(true);
                  }}
                  placeholder="-3.3544"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Longitude</label>
                <Input
                  type="number"
                  step="any"
                  value={mapPinSet ? longitude : ''}
                  onChange={(e) => {
                    setLongitude(parseFloat(e.target.value));
                    setMapPinSet(true);
                  }}
                  placeholder="40.0235"
                />
              </div>
            </div>

            {mapPinSet && (
              <div className="flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-200 p-3">
                <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-teal-700">
                  Location set: {latitude}, {longitude}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Amenities Tab */}
      {activeTab === 'amenities' && (
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Facilities & Amenities</h3>
              <p className="mb-4 text-xs text-gray-500">Select all amenities your property offers.</p>
            </div>

            {/* DB amenities if available */}
            {hasDbAmenities && (
              <div className="space-y-6">
                {Object.entries(amenitiesByCategory).map(([category, items]) => {
                  const categoryLabel =
                    AMENITY_CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
                  return (
                    <div key={category}>
                      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        {categoryLabel}
                      </h4>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {items.map((amenity) => {
                          const Icon = amenityIconFor(amenity.icon);
                          const checked = selectedAmenities.includes(amenity.id);
                          return (
                            <label
                              key={amenity.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-all ${
                                checked
                                  ? 'border-teal-500 bg-teal-50 shadow-sm'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAmenity(amenity.id)}
                                className="sr-only"
                              />
                              <Icon
                                className={`h-5 w-5 flex-shrink-0 ${
                                  checked ? 'text-teal-600' : 'text-gray-600'
                                }`}
                                strokeWidth={1.7}
                                aria-hidden
                              />
                              <span>{amenity.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fallback hardcoded amenities */}
            {!hasDbAmenities && (
              <div className="space-y-6">
                {Object.entries(DEFAULT_AMENITIES).map(([category, items]) => (
                  <div key={category}>
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{category}</h4>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {items.map((amenity) => (
                        <label
                          key={amenity.name}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-all ${
                            selectedDefaultAmenities.includes(amenity.name)
                              ? 'border-teal-500 bg-teal-50 shadow-sm'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDefaultAmenities.includes(amenity.name)}
                            onChange={() => toggleDefaultAmenity(amenity.name)}
                            className="sr-only"
                          />
                          <span className="text-lg">{amenity.icon}</span>
                          <span>{amenity.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(selectedAmenities.length > 0 || selectedDefaultAmenities.length > 0) && (
              <div className="border-t pt-4">
                <p className="text-sm text-gray-600">
                  {selectedAmenities.length + selectedDefaultAmenities.length} amenities selected
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Pricing Tab */}
      {activeTab === 'pricing' && (
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Pricing</h3>
              <p className="mb-4 text-xs text-gray-500">Set your base price and seasonal rates.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Base Price Per Night *</label>
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
                <select className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="KES">KES (Kenyan Shilling)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
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
              <p className="mt-1 text-xs text-gray-500">
                {cancellationPolicy === 'flexible' && 'Guests can cancel up to 24 hours before check-in for a full refund.'}
                {cancellationPolicy === 'moderate' && 'Guests can cancel up to 5 days before check-in for a full refund.'}
                {cancellationPolicy === 'strict' && 'Guests receive a 50% refund if cancelled at least 7 days before check-in.'}
              </p>
            </div>

            {/* Seasonal Pricing */}
            <div className="border-t pt-6">
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Seasonal Pricing</h3>
              <p className="mb-4 text-xs text-gray-500">
                Set different rates for each season. Click months to assign them to a season.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <h4 className="text-sm font-semibold text-blue-900">Low Season</h4>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={lowSeasonPrice}
                    onChange={(e) => setLowSeasonPrice(e.target.value)}
                    placeholder={basePrice || 'Price per night'}
                  />
                  <p className="mt-2 text-xs text-blue-700">
                    {lowSeasonMonths.length > 0 ? lowSeasonMonths.join(', ') : 'No months selected'}
                  </p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-3 w-3 rounded-full bg-amber-500" />
                    <h4 className="text-sm font-semibold text-amber-900">High Season</h4>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={highSeasonPrice}
                    onChange={(e) => setHighSeasonPrice(e.target.value)}
                    placeholder={basePrice ? String(Math.round(parseFloat(basePrice) * 1.3)) : 'Price per night'}
                  />
                  <p className="mt-2 text-xs text-amber-700">
                    {highSeasonMonths.length > 0 ? highSeasonMonths.join(', ') : 'No months selected'}
                  </p>
                </div>

                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-3 w-3 rounded-full bg-rose-500" />
                    <h4 className="text-sm font-semibold text-rose-900">Peak Season</h4>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={peakSeasonPrice}
                    onChange={(e) => setPeakSeasonPrice(e.target.value)}
                    placeholder={basePrice ? String(Math.round(parseFloat(basePrice) * 1.6)) : 'Price per night'}
                  />
                  <p className="mt-2 text-xs text-rose-700">
                    {peakSeasonMonths.length > 0 ? peakSeasonMonths.join(', ') : 'No months selected'}
                  </p>
                </div>
              </div>

              {/* Month Selector Grid */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-gray-600">Click each month to assign it to a season:</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-12">
                  {MONTHS.map((month) => {
                    const season = getMonthSeason(month);
                    const colors = {
                      low: 'bg-blue-100 text-blue-800 border-blue-300',
                      high: 'bg-amber-100 text-amber-800 border-amber-300',
                      peak: 'bg-rose-100 text-rose-800 border-rose-300',
                    };
                    return (
                      <div key={month} className="text-center">
                        <button
                          type="button"
                          onClick={() => {
                            // Cycle: low -> high -> peak -> unset -> low
                            if (season === 'low') toggleSeasonMonth('high', month);
                            else if (season === 'high') toggleSeasonMonth('peak', month);
                            else if (season === 'peak') {
                              // Remove from all
                              setPeakSeasonMonths((prev) => prev.filter((m) => m !== month));
                            } else toggleSeasonMonth('low', month);
                          }}
                          className={`w-full rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                            season ? colors[season] : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {month}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Click to cycle through: Low &rarr; High &rarr; Peak &rarr; None
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Review & Submit Tab */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Review Your Listing</h3>

            <div className="space-y-4 divide-y divide-gray-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Property Name</p>
                  <p className="font-medium text-gray-900">{name || <span className="text-red-500 italic">Not set</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="font-medium text-gray-900 capitalize">{propertyType.replace('_', ' ')}</p>
                </div>
              </div>

              <div className="pt-4">
                <p className="text-xs text-gray-500">Description</p>
                <p className="text-sm text-gray-700 line-clamp-3">{description || <span className="text-red-500 italic">Not set</span>}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="text-sm text-gray-700">{address ? `${address}, ${city}` : <span className="text-red-500 italic">Not set</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Map Pin</p>
                  <p className="text-sm text-gray-700">{mapPinSet ? `${latitude}, ${longitude}` : <span className="text-gray-400">Not set</span>}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4">
                <div>
                  <p className="text-xs text-gray-500">Bedrooms</p>
                  <p className="font-medium text-gray-900">{bedrooms}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Bathrooms</p>
                  <p className="font-medium text-gray-900">{bathrooms}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Max Guests</p>
                  <p className="font-medium text-gray-900">{maxGuests}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <p className="text-xs text-gray-500">Base Price</p>
                  <p className="font-medium text-gray-900">
                    {basePrice ? `${currency} ${parseFloat(basePrice).toLocaleString()} / night` : <span className="text-red-500 italic">Not set</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Photos</p>
                  <p className="font-medium text-gray-900">{totalImages} image(s)</p>
                </div>
              </div>

              {(lowSeasonPrice || highSeasonPrice || peakSeasonPrice) && (
                <div className="grid grid-cols-3 gap-4 pt-4">
                  {lowSeasonPrice && (
                    <div>
                      <p className="text-xs text-gray-500">Low Season</p>
                      <p className="text-sm font-medium text-blue-700">{currency} {parseFloat(lowSeasonPrice).toLocaleString()}</p>
                    </div>
                  )}
                  {highSeasonPrice && (
                    <div>
                      <p className="text-xs text-gray-500">High Season</p>
                      <p className="text-sm font-medium text-amber-700">{currency} {parseFloat(highSeasonPrice).toLocaleString()}</p>
                    </div>
                  )}
                  {peakSeasonPrice && (
                    <div>
                      <p className="text-xs text-gray-500">Peak Season</p>
                      <p className="text-sm font-medium text-rose-700">{currency} {parseFloat(peakSeasonPrice).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4">
                <p className="text-xs text-gray-500">Amenities</p>
                <p className="text-sm text-gray-700">
                  {selectedAmenities.length + selectedDefaultAmenities.length} selected
                </p>
              </div>
            </div>
          </Card>

          {/* Submit Section */}
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
                  Your listing will be reviewed by our team before going live. This usually takes 1-2 business days. You can save as a draft and come back to finish later.
                </p>
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pb-8">
            <Button
              variant="outline"
              onClick={() => handleSubmit('draft')}
              disabled={saving}
              loading={saving}
            >
              Save as Draft
            </Button>
            <Button
              onClick={() => handleSubmit('submit')}
              disabled={saving}
              loading={saving}
            >
              Submit for Review
            </Button>
          </div>
        </div>
      )}

      {/* Bottom navigation for non-review tabs */}
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

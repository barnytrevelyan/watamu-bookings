'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Calendar, Users, Home, Anchor } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PriceRangeSlider from '@/components/PriceRangeSlider';
import AmenityFilterPopover, { AmenityOption } from '@/components/AmenityFilterPopover';

type FilterTab = 'properties' | 'boats';

type FilterVariant = 'hero' | 'properties' | 'boats';

interface SearchFiltersProps {
  defaultTab?: FilterTab;
  variant?: FilterVariant;
  onSearch?: (filters: Record<string, unknown>) => void;
  /** Amenities to expose in the property filter popover (optional). */
  amenities?: AmenityOption[];
  /** Initial values for controlled filters (used when restoring from URL). */
  initial?: {
    check_in?: string;
    check_out?: string;
    guests?: string;
    property_type?: string;
    min_price?: string;
    max_price?: string;
    amenities?: string[];
  };
}

const PRICE_MIN = 3000;
const PRICE_MAX = 300000;
const PRICE_STEP = 1000;

const propertyTypes = [
  { value: '', label: 'All Types' },
  { value: 'villa', label: 'Villa' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'cottage', label: 'Cottage' },
  { value: 'house', label: 'House' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'banda', label: 'Banda' },
  { value: 'bungalow', label: 'Bungalow' },
  { value: 'studio', label: 'Studio' },
  { value: 'penthouse', label: 'Penthouse' },
  { value: 'beach_house', label: 'Beach House' },
];

const boatTypes = [
  { value: '', label: 'All Boats' },
  { value: 'deep_sea', label: 'Deep Sea' },
  { value: 'sport_fisher', label: 'Sport Fisher' },
  { value: 'dhow', label: 'Dhow' },
  { value: 'catamaran', label: 'Catamaran' },
  { value: 'speedboat', label: 'Speedboat' },
  { value: 'glass_bottom', label: 'Glass Bottom' },
  { value: 'kayak', label: 'Kayak' },
  { value: 'sailboat', label: 'Sailboat' },
];

const tripTypes = [
  { value: '', label: 'All Trips' },
  { value: 'half_day_morning', label: 'Half Day — Morning' },
  { value: 'half_day_afternoon', label: 'Half Day — Afternoon' },
  { value: 'half_day', label: 'Half Day (Any)' },
  { value: 'full_day', label: 'Full Day' },
  { value: 'overnight', label: 'Overnight' },
  { value: 'multi_day', label: 'Multi-Day' },
  { value: 'sunset_cruise', label: 'Sunset Cruise' },
];

export default function SearchFilters({
  defaultTab,
  variant,
  onSearch,
  amenities = [],
  initial,
}: SearchFiltersProps) {
  const router = useRouter();
  const resolvedDefault: FilterTab =
    defaultTab ?? (variant === 'boats' ? 'boats' : 'properties');
  const [activeTab, setActiveTab] = useState<FilterTab>(resolvedDefault);

  // Property filters (controlled, seeded from URL if provided)
  const [checkIn, setCheckIn] = useState(initial?.check_in ?? '');
  const [checkOut, setCheckOut] = useState(initial?.check_out ?? '');
  const [propertyGuests, setPropertyGuests] = useState(initial?.guests ?? '');
  const [propertyType, setPropertyType] = useState(initial?.property_type ?? '');
  const [priceRange, setPriceRange] = useState<[number, number]>([
    initial?.min_price ? Math.max(PRICE_MIN, Number(initial.min_price)) : PRICE_MIN,
    initial?.max_price ? Math.min(PRICE_MAX, Number(initial.max_price)) : PRICE_MAX,
  ]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(
    initial?.amenities ?? []
  );

  // Re-seed from URL when parent updates (useful for back/forward nav)
  useEffect(() => {
    if (!initial) return;
    setCheckIn(initial.check_in ?? '');
    setCheckOut(initial.check_out ?? '');
    setPropertyGuests(initial.guests ?? '');
    setPropertyType(initial.property_type ?? '');
    setPriceRange([
      initial.min_price ? Math.max(PRICE_MIN, Number(initial.min_price)) : PRICE_MIN,
      initial.max_price ? Math.min(PRICE_MAX, Number(initial.max_price)) : PRICE_MAX,
    ]);
    setSelectedAmenities(initial.amenities ?? []);
  }, [
    initial?.check_in,
    initial?.check_out,
    initial?.guests,
    initial?.property_type,
    initial?.min_price,
    initial?.max_price,
    initial?.amenities?.join(','),
  ]);

  // Boat filters
  const [tripDate, setTripDate] = useState('');
  const [boatGuests, setBoatGuests] = useState('');
  const [boatType, setBoatType] = useState('');
  const [tripType, setTripType] = useState('');

  const handleSearch = () => {
    if (onSearch) {
      if (activeTab === 'properties') {
        onSearch({
          type: 'property',
          checkIn,
          checkOut,
          guests: propertyGuests,
          propertyType,
          minPrice: priceRange[0],
          maxPrice: priceRange[1],
          amenities: selectedAmenities,
        });
      } else {
        onSearch({
          type: 'boat',
          tripDate,
          guests: boatGuests,
          boatType,
          tripType,
        });
      }
      return;
    }

    const params = new URLSearchParams();
    if (activeTab === 'properties') {
      if (checkIn) params.set('check_in', checkIn);
      if (checkOut) params.set('check_out', checkOut);
      if (propertyGuests) params.set('guests', propertyGuests);
      if (propertyType) params.set('property_type', propertyType);
      if (priceRange[0] > PRICE_MIN) params.set('min_price', String(priceRange[0]));
      if (priceRange[1] < PRICE_MAX) params.set('max_price', String(priceRange[1]));
      if (selectedAmenities.length > 0) params.set('amenities', selectedAmenities.join(','));
      router.push(`/properties${params.toString() ? `?${params}` : ''}`);
    } else {
      if (tripDate) params.set('trip_date', tripDate);
      if (boatGuests) params.set('capacity', boatGuests);
      if (boatType) params.set('boat_type', boatType);
      if (tripType) params.set('trip_type', tripType);
      router.push(`/boats${params.toString() ? `?${params}` : ''}`);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('properties')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-colors
            ${
              activeTab === 'properties'
                ? 'text-[var(--color-primary-600)] bg-[var(--color-primary-50)] border-b-2 border-[var(--color-primary-500)]'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }
          `}
        >
          <Home className="h-4 w-4" />
          Properties
        </button>
        <button
          onClick={() => setActiveTab('boats')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-colors
            ${
              activeTab === 'boats'
                ? 'text-[var(--color-primary-600)] bg-[var(--color-primary-50)] border-b-2 border-[var(--color-primary-500)]'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }
          `}
        >
          <Anchor className="h-4 w-4" />
          Fishing Charters
        </button>
      </div>

      {/* Filter fields */}
      <div className="p-4 sm:p-6">
        {activeTab === 'properties' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input
                label="Check-in"
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                leftIcon={<Calendar className="h-4 w-4" />}
              />
              <Input
                label="Check-out"
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                leftIcon={<Calendar className="h-4 w-4" />}
              />
              <Input
                label="Guests"
                type="number"
                min={1}
                max={20}
                placeholder="2"
                value={propertyGuests}
                onChange={(e) => setPropertyGuests(e.target.value)}
                leftIcon={<Users className="h-4 w-4" />}
              />
              <Select
                label="Property Type"
                options={propertyTypes}
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-end">
              <div className="lg:col-span-2 px-1">
                <PriceRangeSlider
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  value={priceRange}
                  onChange={setPriceRange}
                  currency="KES"
                  label="Price per night"
                />
              </div>
              {amenities.length > 0 && (
                <AmenityFilterPopover
                  amenities={amenities}
                  selected={selectedAmenities}
                  onChange={setSelectedAmenities}
                />
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Trip Date"
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              leftIcon={<Calendar className="h-4 w-4" />}
            />
            <Input
              label="Guests"
              type="number"
              min={1}
              max={30}
              placeholder="4"
              value={boatGuests}
              onChange={(e) => setBoatGuests(e.target.value)}
              leftIcon={<Users className="h-4 w-4" />}
            />
            <Select
              label="Boat Type"
              options={boatTypes}
              value={boatType}
              onChange={(e) => setBoatType(e.target.value)}
            />
            <Select
              label="Duration"
              options={tripTypes}
              value={tripType}
              onChange={(e) => setTripType(e.target.value)}
            />
          </div>
        )}

        {/* Search button */}
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSearch}
            leftIcon={<Search className="h-5 w-5" />}
            className="w-full sm:w-auto"
          >
            Search {activeTab === 'properties' ? 'Properties' : 'Charters'}
          </Button>
        </div>
      </div>
    </div>
  );
}

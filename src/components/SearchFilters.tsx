'use client';

import React, { useState } from 'react';
import { Search, Calendar, Users, Home, Anchor, SlidersHorizontal } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

type FilterTab = 'properties' | 'boats';

interface SearchFiltersProps {
  defaultTab?: FilterTab;
  onSearch?: (filters: Record<string, unknown>) => void;
}

const propertyTypes = [
  { value: '', label: 'All Types' },
  { value: 'villa', label: 'Villa' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'beach-house', label: 'Beach House' },
  { value: 'cottage', label: 'Cottage' },
  { value: 'bungalow', label: 'Bungalow' },
];

const boatTypes = [
  { value: '', label: 'All Boats' },
  { value: 'sport-fisher', label: 'Sport Fisher' },
  { value: 'dhow', label: 'Dhow' },
  { value: 'catamaran', label: 'Catamaran' },
  { value: 'speedboat', label: 'Speedboat' },
];

const tripTypes = [
  { value: '', label: 'All Trips' },
  { value: 'deep-sea', label: 'Deep Sea Fishing' },
  { value: 'reef', label: 'Reef Fishing' },
  { value: 'bottom', label: 'Bottom Fishing' },
  { value: 'trolling', label: 'Trolling' },
  { value: 'sunset-cruise', label: 'Sunset Cruise' },
];

const priceRanges = [
  { value: '', label: 'Any Price' },
  { value: '0-5000', label: 'Under KES 5,000' },
  { value: '5000-10000', label: 'KES 5,000 - 10,000' },
  { value: '10000-20000', label: 'KES 10,000 - 20,000' },
  { value: '20000-50000', label: 'KES 20,000 - 50,000' },
  { value: '50000+', label: 'KES 50,000+' },
];

export default function SearchFilters({
  defaultTab = 'properties',
  onSearch,
}: SearchFiltersProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>(defaultTab);

  // Property filters
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [propertyGuests, setPropertyGuests] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [priceRange, setPriceRange] = useState('');

  // Boat filters
  const [tripDate, setTripDate] = useState('');
  const [boatGuests, setBoatGuests] = useState('');
  const [boatType, setBoatType] = useState('');
  const [tripType, setTripType] = useState('');

  const handleSearch = () => {
    if (activeTab === 'properties') {
      onSearch?.({
        type: 'property',
        checkIn,
        checkOut,
        guests: propertyGuests,
        propertyType,
        priceRange,
      });
    } else {
      onSearch?.({
        type: 'boat',
        tripDate,
        guests: boatGuests,
        boatType,
        tripType,
      });
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            <Select
              label="Price Range"
              options={priceRanges}
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
            />
          </div>
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
              label="Trip Type"
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

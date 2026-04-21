'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Calendar, Users } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

type ShellDestination = {
  slug: string;
  name: string;
};

interface ShellSearchProps {
  destinations: ShellDestination[];
}

/**
 * Cross-place search widget on the kwetu.ke shell landing. Lets guests pick a
 * destination, dates, and guest count before funnelling into the place-scoped
 * /properties listing (which is where every existing filter already works).
 */
export default function ShellSearch({ destinations }: ShellSearchProps) {
  const router = useRouter();

  // Default to the first destination — on current inventory that's Watamu.
  const [slug, setSlug] = useState(destinations[0]?.slug ?? '');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('');

  const destinationOptions = useMemo(
    () => destinations.map((d) => ({ value: d.slug, label: d.name })),
    [destinations],
  );

  const handleSearch = () => {
    if (!slug) return;
    const params = new URLSearchParams();
    if (checkIn) params.set('check_in', checkIn);
    if (checkOut) params.set('check_out', checkOut);
    if (guests) params.set('guests', guests);
    const qs = params.toString();
    router.push(`/${slug}/properties${qs ? `?${qs}` : ''}`);
  };

  if (destinations.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select
            label="Destination"
            options={destinationOptions}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
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
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            leftIcon={<Users className="h-4 w-4" />}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSearch}
            leftIcon={<Search className="h-5 w-5" />}
            className="w-full sm:w-auto"
          >
            Search stays
          </Button>
        </div>
      </div>
    </div>
  );
}

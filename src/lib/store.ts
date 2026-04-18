import { create } from 'zustand';
import type {
  DateRange,
  SearchFilters,
  Property,
  Boat,
  BoatTrip,
  ListingType,
} from './types';

// ----- Booking flow state -----

interface BookingState {
  listingType: ListingType | null;
  selectedProperty: Property | null;
  selectedBoat: Boat | null;
  selectedTrip: BoatTrip | null;
  selectedDates: DateRange | null;
  guests: number;

  setListingType: (type: ListingType) => void;
  setSelectedProperty: (property: Property | null) => void;
  setSelectedBoat: (boat: Boat | null) => void;
  setSelectedTrip: (trip: BoatTrip | null) => void;
  setSelectedDates: (dates: DateRange | null) => void;
  setGuests: (guests: number) => void;
  resetBooking: () => void;
}

const initialBookingState = {
  listingType: null as ListingType | null,
  selectedProperty: null as Property | null,
  selectedBoat: null as Boat | null,
  selectedTrip: null as BoatTrip | null,
  selectedDates: null as DateRange | null,
  guests: 1,
};

export const useBookingStore = create<BookingState>()((set) => ({
  ...initialBookingState,

  setListingType: (listingType) => set({ listingType }),
  setSelectedProperty: (selectedProperty) =>
    set({ selectedProperty, listingType: 'property' }),
  setSelectedBoat: (selectedBoat) =>
    set({ selectedBoat, listingType: 'boat' }),
  setSelectedTrip: (selectedTrip) => set({ selectedTrip }),
  setSelectedDates: (selectedDates) => set({ selectedDates }),
  setGuests: (guests) => set({ guests: Math.max(1, guests) }),
  resetBooking: () => set(initialBookingState),
}));

// ----- Search / filter state -----

interface SearchState {
  filters: SearchFilters;
  isSearching: boolean;

  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
  setIsSearching: (v: boolean) => void;
}

const defaultFilters: SearchFilters = {
  listing_type: undefined,
  sort_by: 'newest',
  page: 1,
  per_page: 12,
};

export const useSearchStore = create<SearchState>()((set) => ({
  filters: defaultFilters,
  isSearching: false,

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial, page: partial.page ?? 1 },
    })),
  resetFilters: () => set({ filters: defaultFilters }),
  setIsSearching: (isSearching) => set({ isSearching }),
}));

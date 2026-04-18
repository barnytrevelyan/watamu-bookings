"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BookingCalendar from "@/components/BookingCalendar";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { createBrowserClient } from "@/lib/supabase/client";
import type { BoatTrip, TripType } from "@/lib/types";
import { TRIP_TYPE_LABELS } from "@/lib/types";

interface AvailabilityDay {
  date: string;
  is_available: boolean;
}

interface Props {
  boatId: string;
  boatSlug: string;
  trips: BoatTrip[];
  capacity: number;
  availability: AvailabilityDay[];
}

export default function BoatBookingSidebar({
  boatId,
  boatSlug,
  trips,
  capacity,
  availability,
}: Props) {
  const router = useRouter();

  const [selectedTripId, setSelectedTripId] = useState<string>(trips[0]?.id ?? "");
  const [tripDate, setTripDate] = useState<string>("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const guests = adults + children;
  const selectedTrip = trips.find((t) => t.id === selectedTripId);
  const tripPrice = (selectedTrip as any)?.price_total ?? (selectedTrip as any)?.price ?? 0;
  const maxGuests = selectedTrip?.max_guests ?? capacity ?? 10;

  // Blocked dates
  const blockedDates = useMemo(
    () => new Set(availability.filter((d) => !d.is_available).map((d) => d.date)),
    [availability]
  );

  const handleDateSelect = useCallback(
    (dates: { checkIn: string; checkOut: string }) => {
      // For boat trips we only need a single date
      setTripDate(dates.checkIn);
    },
    []
  );

  const handleBook = async () => {
    if (!selectedTripId) {
      toast.error("Please select a trip package.");
      return;
    }
    if (!tripDate) {
      toast.error("Please select a date.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createBrowserClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to book.");
        router.push(`/auth/login?redirect=/boats/${boatSlug}`);
        return;
      }

      const { data, error } = await supabase
        .from("wb_bookings")
        .insert({
          listing_type: "boat",
          boat_id: boatId,
          trip_id: selectedTripId,
          guest_id: user.id,
          check_in: tripDate,
          check_out: tripDate,
          trip_date: tripDate,
          guests_count: guests,
          adults_count: adults,
          children_count: children,
          total_price: tripPrice,
          status: "pending_payment",
          currency: "KES",
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Booking created! Redirecting to payment...");
      router.push(`/booking/${data.id}`);
    } catch (err: unknown) {
      console.error("Booking error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-5 shadow-lg">
      {/* Price header */}
      {trips.length > 0 && (
        <div className="flex items-baseline gap-1 mb-5">
          <span className="text-sm text-gray-500">From</span>
          <span className="text-2xl font-bold text-gray-900">
            KES {Math.min(...trips.map((t) => t.price)).toLocaleString()}
          </span>
          <span className="text-gray-500">/ trip</span>
        </div>
      )}

      {/* Trip selection */}
      {trips.length > 0 && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Trip Package
          </label>
          <Select
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
          >
            {trips.map((trip) => {
              const label = TRIP_TYPE_LABELS[trip.trip_type as TripType] || "";
              const timeInfo = trip.departure_time ? `, ${trip.departure_time}` : "";
              return (
                <option key={trip.id} value={trip.id}>
                  {trip.name} — KES {trip.price.toLocaleString()}
                  {trip.duration_hours ? ` (${trip.duration_hours}h${timeInfo})` : ""}
                </option>
              );
            })}
          </Select>
          {selectedTrip?.description && (
            <p className="text-xs text-gray-500 mt-1">{selectedTrip.description}</p>
          )}
        </div>
      )}

      {/* Calendar */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Trip Date</label>
        <BookingCalendar
          blockedDates={blockedDates}
          onSelect={handleDateSelect}
          checkIn={tripDate}
          checkOut={tripDate}
          singleDate
        />
      </div>

      {/* Date input fallback */}
      <div className="mb-4">
        <Input
          type="date"
          value={tripDate}
          onChange={(e) => setTripDate(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
        />
      </div>

      {/* Guests — Adults + Children */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Guests</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">Adults</label>
            <Select
              value={String(adults)}
              onChange={(e) => setAdults(Number(e.target.value))}
            >
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">Children</label>
            <Select
              value={String(children)}
              onChange={(e) => setChildren(Number(e.target.value))}
            >
              {Array.from({ length: Math.max(0, maxGuests - adults) + 1 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{guests} total guest{guests !== 1 ? 's' : ''} (max {maxGuests})</p>
      </div>

      {/* Price summary */}
      {selectedTrip && tripDate && (
        <div className="border-t border-gray-100 pt-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>{selectedTrip.name}</span>
            <span>KES {tripPrice.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Type</span>
            <span>{TRIP_TYPE_LABELS[selectedTrip.trip_type as TripType] || selectedTrip.trip_type}</span>
          </div>
          {selectedTrip.duration_hours && (
            <div className="flex justify-between text-gray-500">
              <span>Duration</span>
              <span>{selectedTrip.duration_hours} hours</span>
            </div>
          )}
          {selectedTrip.departure_time && (
            <div className="flex justify-between text-gray-500">
              <span>Departure</span>
              <span>{selectedTrip.departure_time}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span>KES {tripPrice.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Book button */}
      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        size="lg"
        onClick={handleBook}
        disabled={isSubmitting || !selectedTripId || !tripDate}
      >
        {isSubmitting
          ? "Booking..."
          : selectedTrip && tripDate
            ? `Book Now — KES ${tripPrice.toLocaleString()}`
            : "Select a trip and date"}
      </Button>

      <p className="text-xs text-gray-400 text-center mt-3">You won&apos;t be charged yet</p>
    </div>
  );
}

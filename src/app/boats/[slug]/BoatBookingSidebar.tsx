"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BookingCalendar from "@/components/BookingCalendar";
import { Button } from "@/components/ui/Button";
// Select replaced with plain <select> for compatibility
import { Input } from "@/components/ui/Input";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { BoatTrip, TripType } from "@/lib/types";
import { TRIP_TYPE_LABELS } from "@/lib/types";

interface AvailabilityDay {
  date: string;
  is_blocked: boolean;
}

interface Props {
  boatId: string;
  boatSlug: string;
  trips: BoatTrip[];
  capacity: number;
  availability: AvailabilityDay[];
  /** "subscription" → enquiry flow (no payment), "commission" (default) → payment flow. */
  billingMode?: 'commission' | 'subscription';
  /** Percentage of total the host expects as deposit in the enquiry flow. */
  depositPercent?: number | null;
}

export default function BoatBookingSidebar({
  boatId,
  boatSlug,
  trips,
  capacity,
  availability,
  billingMode = 'commission',
  depositPercent = 25,
}: Props) {
  const router = useRouter();
  const isEnquiryMode = billingMode === 'subscription';
  const depositPercentNumber = depositPercent == null ? 25 : Number(depositPercent) || 25;

  const [selectedTripId, setSelectedTripId] = useState<string>(trips[0]?.id ?? "");
  const [tripDate, setTripDate] = useState<string>("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guestMessage, setGuestMessage] = useState<string>("");
  const [guestPhone, setGuestPhone] = useState<string>("");

  const guests = adults + children;
  const selectedTrip = trips.find((t) => t.id === selectedTripId);
  const tripPrice = (selectedTrip as any)?.price_total ?? (selectedTrip as any)?.price ?? 0;
  const maxGuests = selectedTrip?.max_guests ?? capacity ?? 10;

  // Blocked dates
  const blockedDates = useMemo(
    () => new Set(availability.filter((d) => d.is_blocked).map((d) => d.date)),
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
        toast.error("Please sign in to continue.");
        router.push(`/auth/login?redirect=/boats/${boatSlug}`);
        return;
      }

      // POST to /api/bookings — lets the route branch on billing_mode and
      // kick off host + guest emails for subscription enquiries.
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingType: "boat",
          boatId,
          tripId: selectedTripId,
          tripDate,
          guests,
          guestMessage: guestMessage.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Couldn't create the booking — please try again.");
        return;
      }

      if (json.availabilityWarning) {
        toast(json.availabilityWarning, { icon: "⚠️", duration: 6000 });
      } else {
        toast.success(
          isEnquiryMode
            ? "Enquiry sent — your host will be in touch."
            : "Booking created! Redirecting to payment…"
        );
      }
      router.push(`/booking/${json.booking.id}`);
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
            KES {Math.min(...trips.map((t) => (t as any).price_total ?? (t as any).price ?? 0)).toLocaleString()}
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
          <select
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
          >
            {trips.map((trip) => {
              const label = TRIP_TYPE_LABELS[trip.trip_type as TripType] || "";
              const timeInfo = trip.departure_time ? `, ${trip.departure_time}` : "";
              return (
                <option key={trip.id} value={trip.id}>
                  {trip.name} — KES {((trip as any).price_total ?? (trip as any).price ?? 0).toLocaleString()}
                  {trip.duration_hours ? ` (${trip.duration_hours}h${timeInfo})` : ""}
                </option>
              );
            })}
          </select>
          {selectedTrip?.description && (
            <p className="text-xs text-gray-500 mt-1">{selectedTrip.description}</p>
          )}
        </div>
      )}

      {/* Calendar */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Trip Date</label>
        <BookingCalendar
          blockedDates={[...blockedDates]}
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
            <select
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={String(adults)}
              onChange={(e) => setAdults(Number(e.target.value))}
            >
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">Children</label>
            <select
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={String(children)}
              onChange={(e) => setChildren(Number(e.target.value))}
            >
              {Array.from({ length: Math.max(0, maxGuests - adults) + 1 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
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
          {isEnquiryMode && (
            <div className="flex justify-between text-teal-800 bg-teal-50 -mx-1 px-2 py-1 rounded">
              <span>Deposit to host ({depositPercentNumber}%)</span>
              <span className="font-semibold">
                KES {Math.round(tripPrice * (depositPercentNumber / 100)).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Enquiry-only fields: phone + message to host */}
      {isEnquiryMode && (
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Phone (optional, so your host can WhatsApp you)
            </label>
            <Input
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+254 7XX XXX XXX"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Message to host (optional)
            </label>
            <textarea
              value={guestMessage}
              onChange={(e) => setGuestMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. We&rsquo;d like an early start if possible."
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      )}

      {/* Book / Enquire button */}
      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        size="lg"
        onClick={handleBook}
        disabled={isSubmitting || !selectedTripId || !tripDate}
      >
        {isSubmitting
          ? isEnquiryMode ? "Sending enquiry…" : "Booking…"
          : selectedTrip && tripDate
            ? isEnquiryMode
              ? `Send Enquiry — KES ${tripPrice.toLocaleString()}`
              : `Book Now — KES ${tripPrice.toLocaleString()}`
            : isEnquiryMode
              ? "Select a trip and date to enquire"
              : "Select a trip and date"}
      </Button>

      <p className="text-xs text-gray-400 text-center mt-3">
        {isEnquiryMode
          ? `No payment now — your host will ask for a ${depositPercentNumber}% deposit to confirm.`
          : "You won't be charged yet"}
      </p>
    </div>
  );
}

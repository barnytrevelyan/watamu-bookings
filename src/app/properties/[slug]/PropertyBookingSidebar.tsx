"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BookingCalendar from "@/components/BookingCalendar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createBrowserClient } from "@/lib/supabase/client";
import type { Room } from "@/lib/types";

interface AvailabilityDay {
  date: string;
  is_available: boolean;
  price_override: number | null;
}

interface Props {
  propertyId: string;
  propertySlug: string;
  pricePerNight: number;
  maxGuests: number;
  rooms: Room[];
  availability: AvailabilityDay[];
  cleaningFee?: number | null;
  serviceFeePercent?: number | null;
}

export default function PropertyBookingSidebar({
  propertyId,
  propertySlug,
  pricePerNight,
  maxGuests,
  rooms,
  availability,
  cleaningFee = 0,
  serviceFeePercent = 10,
}: Props) {
  const router = useRouter();

  const [checkIn, setCheckIn] = useState<string>("");
  const [checkOut, setCheckOut] = useState<string>("");
  const [guests, setGuests] = useState(1);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Blocked dates set for quick lookup
  const blockedDates = useMemo(
    () => new Set(availability.filter((d) => !d.is_available).map((d) => d.date)),
    [availability]
  );

  // Price overrides map
  const priceOverrides = useMemo(() => {
    const map = new Map<string, number>();
    availability.forEach((d) => {
      if (d.price_override != null) map.set(d.date, d.price_override);
    });
    return map;
  }, [availability]);

  // Calculate nights and total
  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [checkIn, checkOut]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const nightlyRate = selectedRoom?.price_per_night ?? pricePerNight;

  // Calculate total respecting per-night overrides
  const { accommodationTotal, totalPrice } = useMemo(() => {
    if (nights === 0) return { accommodationTotal: 0, totalPrice: 0 };

    let total = 0;
    const start = new Date(checkIn);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      total += priceOverrides.get(dateStr) ?? nightlyRate;
    }

    const cleaning = cleaningFee ?? 0;
    const serviceFee = Math.round(total * ((serviceFeePercent ?? 10) / 100));
    return {
      accommodationTotal: total,
      totalPrice: total + cleaning + serviceFee,
    };
  }, [nights, checkIn, nightlyRate, priceOverrides, cleaningFee, serviceFeePercent]);

  const handleDateSelect = useCallback(
    (dates: { checkIn: string; checkOut: string }) => {
      setCheckIn(dates.checkIn);
      setCheckOut(dates.checkOut);
    },
    []
  );

  const handleBook = async () => {
    if (!checkIn || !checkOut) {
      toast.error("Please select check-in and check-out dates.");
      return;
    }
    if (nights < 1) {
      toast.error("Stay must be at least 1 night.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createBrowserClient();

      // Check auth
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to book.");
        router.push(`/auth/login?redirect=/properties/${propertySlug}`);
        return;
      }

      const { data, error } = await supabase
        .from("wb_bookings")
        .insert({
          property_id: propertyId,
          room_id: selectedRoomId || null,
          user_id: user.id,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          nights,
          nightly_rate: nightlyRate,
          cleaning_fee: cleaningFee ?? 0,
          service_fee: Math.round(accommodationTotal * ((serviceFeePercent ?? 10) / 100)),
          total_price: totalPrice,
          status: "pending",
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
      <div className="flex items-baseline gap-1 mb-5">
        <span className="text-2xl font-bold text-gray-900">
          KES {nightlyRate.toLocaleString()}
        </span>
        <span className="text-gray-500">/ night</span>
      </div>

      {/* Calendar */}
      <div className="mb-4">
        <BookingCalendar
          blockedDates={blockedDates}
          onSelect={handleDateSelect}
          checkIn={checkIn}
          checkOut={checkOut}
        />
      </div>

      {/* Date inputs (fallback / display) */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Check-in</label>
          <Input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Check-out</label>
          <Input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            min={checkIn || new Date().toISOString().split("T")[0]}
          />
        </div>
      </div>

      {/* Guests */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Guests</label>
        <Select
          value={String(guests)}
          onChange={(e) => setGuests(Number(e.target.value))}
        >
          {Array.from({ length: maxGuests || 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} guest{n !== 1 ? "s" : ""}
            </option>
          ))}
        </Select>
      </div>

      {/* Room selection (if multiple rooms) */}
      {rooms.length > 1 && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Room</label>
          <Select
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
          >
            <option value="">Entire property</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.price_per_night
                  ? ` — KES ${room.price_per_night.toLocaleString()}/night`
                  : ""}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Price breakdown */}
      {nights > 0 && (
        <div className="border-t border-gray-100 pt-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>
              KES {nightlyRate.toLocaleString()} x {nights} night{nights !== 1 ? "s" : ""}
            </span>
            <span>KES {accommodationTotal.toLocaleString()}</span>
          </div>
          {(cleaningFee ?? 0) > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Cleaning fee</span>
              <span>KES {(cleaningFee ?? 0).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-700">
            <span>Service fee</span>
            <span>
              KES{" "}
              {Math.round(
                accommodationTotal * ((serviceFeePercent ?? 10) / 100)
              ).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span>KES {totalPrice.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Book button */}
      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        size="lg"
        onClick={handleBook}
        disabled={isSubmitting || nights < 1}
      >
        {isSubmitting ? "Booking..." : nights > 0 ? `Book Now — KES ${totalPrice.toLocaleString()}` : "Select dates to book"}
      </Button>

      <p className="text-xs text-gray-400 text-center mt-3">You won&apos;t be charged yet</p>
    </div>
  );
}

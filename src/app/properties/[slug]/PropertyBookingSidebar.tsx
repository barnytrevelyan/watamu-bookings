"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BookingCalendar from "@/components/BookingCalendar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { useCurrency } from "@/lib/places/BrandProvider";
import { formatPrice } from "@/lib/currency";
import type { Room } from "@/lib/types";
import { computeFlexiPrice, daysUntil, type FlexiConfig } from "@/lib/flexi";
import { Sparkles } from "lucide-react";

interface AvailabilityDay {
  date: string;
  is_blocked: boolean;
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
  flexi?: FlexiConfig;
}

export default function PropertyBookingSidebar({
  propertyId,
  propertySlug,
  pricePerNight,
  maxGuests,
  rooms,
  availability,
  cleaningFee = 0,
  flexi,
}: Props) {
  // Coerce numeric values that Supabase returns as strings from numeric columns.
  const nightlyRateNumber = Number(pricePerNight) || 0;
  const cleaningFeeNumber = cleaningFee == null ? 0 : Number(cleaningFee) || 0;
  const router = useRouter();
  const currency = useCurrency();

  const [checkIn, setCheckIn] = useState<string>("");
  const [checkOut, setCheckOut] = useState<string>("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  const guests = adults + children;
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Blocked dates set for quick lookup
  const blockedDates = useMemo(
    () => new Set(availability.filter((d) => d.is_blocked).map((d) => d.date)),
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
  const nightlyRate = Number(selectedRoom?.price_per_night ?? nightlyRateNumber) || nightlyRateNumber;

  // Calculate total respecting per-night overrides and flexi (last-minute)
  // discount. No guest service fee — Kwetu takes commission from the host,
  // the guest pays only the nightly rate + cleaning.
  const { accommodationTotal, baseAccommodationTotal, totalPrice, isLastMinute } = useMemo(() => {
    if (nights === 0) {
      return {
        accommodationTotal: 0,
        baseAccommodationTotal: 0,
        totalPrice: 0,
        isLastMinute: false,
      };
    }

    let total = 0;
    let baseTotal = 0;
    let anyLastMinute = false;
    const start = new Date(checkIn);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const override = priceOverrides.get(dateStr);
      const nightly = Number(override ?? nightlyRate) || nightlyRate;
      baseTotal += nightly;
      if (flexi?.enabled) {
        const r = computeFlexiPrice(nightly, flexi, d);
        total += r.effectivePrice;
        if (r.isLastMinute) anyLastMinute = true;
      } else {
        total += nightly;
      }
    }

    return {
      accommodationTotal: total,
      baseAccommodationTotal: baseTotal,
      totalPrice: total + cleaningFeeNumber,
      isLastMinute: anyLastMinute,
    };
  }, [nights, checkIn, nightlyRate, priceOverrides, cleaningFeeNumber, flexi]);

  // Booking notice — the host only accepts bookings that start more than
  // `cutoffDays` out. Computed against the selected check-in (if any).
  const pastCutoff = useMemo(() => {
    if (!checkIn || !flexi?.enabled) return false;
    const daysOut = daysUntil(checkIn);
    return daysOut < flexi.cutoffDays;
  }, [checkIn, flexi]);

  const discountPercent =
    baseAccommodationTotal > 0 && accommodationTotal < baseAccommodationTotal
      ? Math.round(((baseAccommodationTotal - accommodationTotal) / baseAccommodationTotal) * 100)
      : 0;

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
    if (pastCutoff) {
      toast.error(
        flexi && flexi.cutoffDays === 1
          ? "The host needs at least 1 day's notice — please pick a later check-in."
          : `The host needs at least ${flexi?.cutoffDays ?? 1} days' notice — please pick a later check-in.`,
      );
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
        router.push(`/auth/login?redirect=/properties/${propertySlug}`);
        return;
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingType: "property",
          propertyId,
          checkIn,
          checkOut,
          guests,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Couldn't create the booking — please try again.");
        return;
      }

      toast.success("Booking created! Redirecting to payment…");
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
      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-gray-900">
            {formatPrice(nightlyRate, currency)}
          </span>
          <span className="text-gray-500">/ night</span>
        </div>
        {flexi?.enabled && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-coral-50)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-coral-600)] ring-1 ring-[var(--color-coral-200)]">
            <Sparkles className="h-3 w-3" />
            Last-minute deals available
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="mb-4">
        <BookingCalendar
          blockedDates={[...blockedDates]}
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
              {Array.from({ length: maxGuests || 10 }, (_, i) => i + 1).map((n) => (
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
              {Array.from({ length: Math.max(0, (maxGuests || 10) - adults) + 1 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{guests} total guest{guests !== 1 ? 's' : ''} (max {maxGuests || 10})</p>
      </div>

      {/* Room selection (if multiple rooms) */}
      {rooms.length > 1 && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Room</label>
          <select
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
          >
            <option value="">Entire property</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.price_per_night
                  ? ` — ${formatPrice(room.price_per_night, currency)}/night`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Past-cutoff warning (host requires more notice) */}
      {pastCutoff && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong className="block font-semibold">Too close to check-in</strong>
          The host needs at least {flexi?.cutoffDays ?? 1} day{flexi?.cutoffDays === 1 ? '' : 's'}{' '}
          notice. Please pick a later check-in date.
        </div>
      )}

      {/* Price breakdown */}
      {nights > 0 && (
        <div className="border-t border-gray-100 pt-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>
              {nights} night{nights !== 1 ? "s" : ""}
              {isLastMinute && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-coral-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-coral-600)]">
                  <Sparkles className="h-2.5 w-2.5" />
                  Last-minute
                </span>
              )}
            </span>
            <span className="text-right">
              {discountPercent > 0 && (
                <span className="mr-2 text-gray-400 line-through">
                  {formatPrice(baseAccommodationTotal, currency)}
                </span>
              )}
              {formatPrice(accommodationTotal, currency)}
            </span>
          </div>
          {discountPercent > 0 && (
            <div className="flex justify-between text-[var(--color-coral-600)] text-xs">
              <span>Flexi discount</span>
              <span>-{discountPercent}%</span>
            </div>
          )}
          {cleaningFeeNumber > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Cleaning fee</span>
              <span>{formatPrice(cleaningFeeNumber, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span>{formatPrice(totalPrice, currency)}</span>
          </div>
          {currency !== 'KES' && (
            <p className="text-[11px] text-gray-500 pt-1">
              Approx. in {currency}. Charged in KES — exact amount shown at checkout.
            </p>
          )}
        </div>
      )}

      {/* Book button */}
      <Button
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        size="lg"
        onClick={handleBook}
        disabled={isSubmitting || nights < 1 || pastCutoff}
      >
        {isSubmitting
          ? "Booking…"
          : pastCutoff
          ? "Too close to check-in"
          : nights > 0
          ? `Book Now — ${formatPrice(totalPrice, currency)}`
          : "Select dates to book"}
      </Button>

      <p className="text-xs text-gray-400 text-center mt-3">
        You won&rsquo;t be charged yet
      </p>
    </div>
  );
}

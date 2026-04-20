"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BookingCalendar from "@/components/BookingCalendar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
// Select replaced with plain <select> for compatibility
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { Room } from "@/lib/types";

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
  serviceFeePercent?: number | null;
  /** "subscription" → enquiry flow (no payment), "commission" (default) → payment flow. */
  billingMode?: 'commission' | 'subscription';
  /** Percentage of total the host expects as deposit in the enquiry flow. */
  depositPercent?: number | null;
}

export default function PropertyBookingSidebar({
  propertyId,
  propertySlug,
  pricePerNight,
  maxGuests,
  rooms,
  availability,
  cleaningFee = 0,
  serviceFeePercent = 8,
  billingMode = 'commission',
  depositPercent = 25,
}: Props) {
  // Coerce numeric values that Supabase returns as strings from numeric columns.
  const nightlyRateNumber = Number(pricePerNight) || 0;
  const cleaningFeeNumber = cleaningFee == null ? 0 : Number(cleaningFee) || 0;
  const serviceFeePercentNumber = serviceFeePercent == null ? 8 : Number(serviceFeePercent) || 0;
  const depositPercentNumber = depositPercent == null ? 25 : Number(depositPercent) || 25;
  const isEnquiryMode = billingMode === 'subscription';
  const router = useRouter();

  const [checkIn, setCheckIn] = useState<string>("");
  const [checkOut, setCheckOut] = useState<string>("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [guestMessage, setGuestMessage] = useState<string>("");
  const [guestPhone, setGuestPhone] = useState<string>("");

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

  // Calculate total respecting per-night overrides
  const { accommodationTotal, totalPrice } = useMemo(() => {
    if (nights === 0) return { accommodationTotal: 0, totalPrice: 0 };

    let total = 0;
    const start = new Date(checkIn);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const override = priceOverrides.get(dateStr);
      total += Number(override ?? nightlyRate) || nightlyRate;
    }

    const serviceFee = Math.round(total * (serviceFeePercentNumber / 100));
    return {
      accommodationTotal: total,
      totalPrice: total + cleaningFeeNumber + serviceFee,
    };
  }, [nights, checkIn, nightlyRate, priceOverrides, cleaningFeeNumber, serviceFeePercentNumber]);

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

      // Auth gate — booking requires a signed-in user either way so we have
      // contact details and can attribute the booking record.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to continue.");
        router.push(`/auth/login?redirect=/properties/${propertySlug}`);
        return;
      }

      // POST to /api/bookings — the route decides between the enquiry flow
      // (subscription listings) and the payment flow (commission listings)
      // based on the listing's billing_mode. We don't want to reimplement that
      // branching here.
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingType: "property",
          propertyId,
          checkIn,
          checkOut,
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
      <div className="flex items-baseline gap-1 mb-5">
        <span className="text-2xl font-bold text-gray-900">
          KES {nightlyRate.toLocaleString()}
        </span>
        <span className="text-gray-500">/ night</span>
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
                  ? ` — KES ${room.price_per_night.toLocaleString()}/night`
                  : ""}
              </option>
            ))}
          </select>
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
          {cleaningFeeNumber > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Cleaning fee</span>
              <span>KES {cleaningFeeNumber.toLocaleString()}</span>
            </div>
          )}
          {serviceFeePercentNumber > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Service fee</span>
              <span>
                KES{" "}
                {Math.round(
                  accommodationTotal * (serviceFeePercentNumber / 100)
                ).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span>KES {totalPrice.toLocaleString()}</span>
          </div>
          {isEnquiryMode && (
            <div className="flex justify-between text-teal-800 bg-teal-50 -mx-1 px-2 py-1 rounded">
              <span>Deposit to host ({depositPercentNumber}%)</span>
              <span className="font-semibold">
                KES {Math.round(totalPrice * (depositPercentNumber / 100)).toLocaleString()}
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
              placeholder="e.g. We're arriving late on the first night — is that OK?"
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
        disabled={isSubmitting || nights < 1}
      >
        {isSubmitting
          ? isEnquiryMode ? "Sending enquiry…" : "Booking…"
          : nights > 0
          ? isEnquiryMode
            ? `Send Enquiry — KES ${totalPrice.toLocaleString()}`
            : `Book Now — KES ${totalPrice.toLocaleString()}`
          : isEnquiryMode
          ? "Select dates to enquire"
          : "Select dates to book"}
      </Button>

      <p className="text-xs text-gray-400 text-center mt-3">
        {isEnquiryMode
          ? `No payment now — your host will ask for a ${depositPercentNumber}% deposit to confirm.`
          : "You won't be charged yet"}
      </p>
    </div>
  );
}

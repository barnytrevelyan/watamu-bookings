'use client';

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateRange {
  checkIn: Date | null;
  checkOut: Date | null;
}

interface PriceOverride {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface BookingCalendarProps {
  bookedDates?: string[];
  blockedDates?: string[];
  priceOverrides?: PriceOverride[];
  basePricePerNight?: number;
  currency?: string;
  onDateRangeSelect?: (range: DateRange) => void;
  // Convenience API used by booking sidebars
  onSelect?: (dates: { checkIn: string; checkOut: string }) => void;
  checkIn?: string;
  checkOut?: string;
  singleDate?: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBetween(date: Date, start: Date, end: Date): boolean {
  const d = date.getTime();
  return d > start.getTime() && d < end.getTime();
}

export default function BookingCalendar({
  bookedDates = [],
  blockedDates = [],
  priceOverrides = [],
  basePricePerNight = 0,
  currency = 'KES',
  onDateRangeSelect,
  onSelect,
  checkIn: initialCheckIn,
  checkOut: initialCheckOut,
  singleDate = false,
}: BookingCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [checkIn, setCheckIn] = useState<Date | null>(
    initialCheckIn ? new Date(initialCheckIn + 'T00:00:00') : null
  );
  const [checkOut, setCheckOut] = useState<Date | null>(
    initialCheckOut && !singleDate ? new Date(initialCheckOut + 'T00:00:00') : null
  );
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  // Helper to notify both callback styles
  const notifySelect = (ci: Date | null, co: Date | null) => {
    onDateRangeSelect?.({ checkIn: ci, checkOut: co });
    if (onSelect && ci) {
      onSelect({
        checkIn: formatDateKey(ci),
        checkOut: co ? formatDateKey(co) : formatDateKey(ci),
      });
    }
  };

  const bookedSet = useMemo(() => new Set(bookedDates), [bookedDates]);
  const blockedSet = useMemo(() => new Set(blockedDates), [blockedDates]);
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    priceOverrides.forEach((po) => map.set(po.date, po.price));
    return map;
  }, [priceOverrides]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const navigateMonth = (direction: -1 | 1) => {
    let newMonth = currentMonth + direction;
    let newYear = currentYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const handleDateClick = (day: number) => {
    const clicked = new Date(currentYear, currentMonth, day);
    clicked.setHours(0, 0, 0, 0);
    const key = formatDateKey(clicked);

    if (clicked < today || bookedSet.has(key) || blockedSet.has(key)) return;

    // Single-date mode (boat trips): just pick one date
    if (singleDate) {
      setCheckIn(clicked);
      setCheckOut(null);
      notifySelect(clicked, null);
      return;
    }

    if (!checkIn || (checkIn && checkOut)) {
      // Start new selection
      setCheckIn(clicked);
      setCheckOut(null);
      notifySelect(clicked, null);
    } else {
      // Select check-out
      if (clicked <= checkIn) {
        setCheckIn(clicked);
        setCheckOut(null);
        notifySelect(clicked, null);
      } else {
        // Check no booked/blocked dates in range
        let hasConflict = false;
        const cursor = new Date(checkIn);
        cursor.setDate(cursor.getDate() + 1);
        while (cursor < clicked) {
          const k = formatDateKey(cursor);
          if (bookedSet.has(k) || blockedSet.has(k)) {
            hasConflict = true;
            break;
          }
          cursor.setDate(cursor.getDate() + 1);
        }

        if (hasConflict) {
          setCheckIn(clicked);
          setCheckOut(null);
          notifySelect(clicked, null);
        } else {
          setCheckOut(clicked);
          notifySelect(checkIn, clicked);
        }
      }
    }
  };

  const getCellClassName = (day: number): string => {
    const date = new Date(currentYear, currentMonth, day);
    date.setHours(0, 0, 0, 0);
    const key = formatDateKey(date);
    const classes: string[] = ['calendar-cell'];

    const isPast = date < today;
    const isBooked = bookedSet.has(key);
    const isBlocked = blockedSet.has(key);
    const isToday = isSameDay(date, today);

    if (isPast) {
      classes.push('calendar-cell--disabled');
    } else if (isBooked) {
      classes.push('calendar-cell--booked');
    } else if (isBlocked) {
      classes.push('calendar-cell--blocked');
    } else {
      classes.push('calendar-cell--available');
    }

    if (isToday) classes.push('calendar-cell--today');

    if (checkIn && isSameDay(date, checkIn)) {
      classes.push(checkOut ? 'calendar-cell--range-start' : 'calendar-cell--selected');
    } else if (checkOut && isSameDay(date, checkOut)) {
      classes.push('calendar-cell--range-end');
    } else if (checkIn && !checkOut && hoverDate && date > checkIn && date <= hoverDate && !isPast && !isBooked && !isBlocked) {
      classes.push('calendar-cell--in-range');
    } else if (checkIn && checkOut && isBetween(date, checkIn, checkOut)) {
      classes.push('calendar-cell--in-range');
    }

    return classes.join(' ');
  };

  const getPrice = (day: number): string | null => {
    const date = new Date(currentYear, currentMonth, day);
    const key = formatDateKey(date);
    if (date < today || bookedSet.has(key) || blockedSet.has(key)) return null;
    const price = priceMap.get(key) ?? basePricePerNight;
    const formatted = new Intl.NumberFormat('en-KE', {
      notation: 'compact',
      maximumFractionDigits: 0,
    }).format(price);
    return formatted;
  };

  const monthLabel = new Date(currentYear, currentMonth).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric' }
  );

  const canGoPrev = !(currentYear === today.getFullYear() && currentMonth === today.getMonth());

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateMonth(-1)}
          disabled={!canGoPrev}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-base font-semibold text-gray-900">{monthLabel}</h3>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="calendar-grid mb-1">
        {DAYS.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-gray-500 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="calendar-grid">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="calendar-cell calendar-cell--disabled" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const price = getPrice(day);
          return (
            <div
              key={day}
              className={getCellClassName(day)}
              onClick={() => handleDateClick(day)}
              onMouseEnter={() => {
                const d = new Date(currentYear, currentMonth, day);
                d.setHours(0, 0, 0, 0);
                setHoverDate(d);
              }}
              onMouseLeave={() => setHoverDate(null)}
            >
              <span className="text-sm">{day}</span>
              {price && <span className="calendar-price">{price}</span>}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[var(--color-green-200)]" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[var(--color-primary-500)]" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[var(--color-primary-100)]" />
          <span>In Range</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-100" />
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-100" />
          <span>Blocked</span>
        </div>
      </div>
    </div>
  );
}

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Currency } from './types';

// ----- Class name merger (clsx + tailwind-merge) -----

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ----- Currency formatting -----

const CURRENCY_CONFIG: Record<Currency, { symbol: string; locale: string }> = {
  KES: { symbol: 'KSh', locale: 'en-KE' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '\u20AC', locale: 'en-DE' },
  GBP: { symbol: '\u00A3', locale: 'en-GB' },
};

export function formatCurrency(
  amount: number,
  currency: Currency = 'KES',
): string {
  const config = CURRENCY_CONFIG[currency];
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'KES' ? 0 : 2,
    maximumFractionDigits: currency === 'KES' ? 0 : 2,
  }).format(amount);
}

// ----- Date formatting -----

export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatDateRange(from: string | Date, to: string | Date): string {
  const start = typeof from === 'string' ? new Date(from) : from;
  const end = typeof to === 'string' ? new Date(to) : to;

  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.getDate()} \u2013 ${formatDate(end)}`;
  }

  return `${formatDate(start)} \u2013 ${formatDate(end)}`;
}

// ----- Slug generation -----

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ----- Night calculation -----

export function calculateNights(
  checkIn: string | Date,
  checkOut: string | Date,
): number {
  const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
  const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

// ----- Initials for avatars -----

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// ----- Text truncation -----

export function truncateText(text: string, maxLength: number = 120): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '\u2026';
}

// ----- Star rating display -----

/**
 * Return a string of star characters representing the rating.
 * e.g. renderStars(3.5) => "★★★☆☆"
 *
 * Uses full star (★), half star (⯨ approximated as ☆ with half semantics),
 * and empty star (☆). For simplicity we round to nearest 0.5.
 */
export function renderStars(rating: number, maxStars: number = 5): string {
  const clamped = Math.max(0, Math.min(rating, maxStars));
  const fullStars = Math.floor(clamped);
  const hasHalf = clamped - fullStars >= 0.25 && clamped - fullStars < 0.75;
  const emptyStars = maxStars - fullStars - (hasHalf ? 1 : 0);

  return (
    '\u2605'.repeat(fullStars) +
    (hasHalf ? '\u00BD' : '') +
    '\u2606'.repeat(Math.max(0, emptyStars))
  );
}

/**
 * Return an array of "full" | "half" | "empty" tokens for rendering
 * custom star components.
 */
export function getStarTokens(
  rating: number,
  maxStars: number = 5,
): Array<'full' | 'half' | 'empty'> {
  const clamped = Math.max(0, Math.min(rating, maxStars));
  const full = Math.floor(clamped);
  const hasHalf = clamped - full >= 0.25 && clamped - full < 0.75;
  const needsFull = clamped - full >= 0.75;
  const actualFull = full + (needsFull ? 1 : 0);
  const empty = maxStars - actualFull - (hasHalf ? 1 : 0);

  const tokens: Array<'full' | 'half' | 'empty'> = [];
  for (let i = 0; i < actualFull; i++) tokens.push('full');
  if (hasHalf) tokens.push('half');
  for (let i = 0; i < Math.max(0, empty); i++) tokens.push('empty');
  return tokens;
}

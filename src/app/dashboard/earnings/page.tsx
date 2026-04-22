import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import EarningsClient from './EarningsClient';

export const metadata: Metadata = {
  title: 'Earnings',
  description: 'See exactly what you net on every booking — and what you would have lost to Airbnb or Booking.com.',
};

// Commission rates (gross % removed from each booking, blended host-side)
// Kept as constants so a single change flows through the whole page.
const COMMISSION_RATES = {
  kwetu: 0.075,
  airbnb: 0.15, // host 3% + guest 12% (guest fee effectively lowers conversion / booked price)
  bookingCom: 0.17,
  fishingBooker: 0.2,
} as const;

export default async function EarningsPage() {
  const supabase = await createClient();

  // Auth gate — mirror the rest of /dashboard
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/dashboard/earnings');

  // Owner's listings
  const [{ data: props }, { data: boats }] = await Promise.all([
    supabase.from('wb_properties').select('id').eq('owner_id', user.id),
    supabase.from('wb_boats').select('id').eq('owner_id', user.id),
  ]);
  const propIds = (props || []).map((p) => p.id);
  const boatIds = (boats || []).map((b) => b.id);

  // All bookings that have earned money (confirmed or completed)
  let bookings: Array<{
    id: string;
    total_price: number;
    currency: string | null;
    status: string;
    check_in: string | null;
    created_at: string;
    listing_name: string;
    listing_type: 'property' | 'boat';
  }> = [];

  if (propIds.length > 0) {
    const { data } = await supabase
      .from('wb_bookings')
      .select('id, total_price, currency, status, check_in, created_at, wb_properties!property_id(name)')
      .in('property_id', propIds)
      .in('status', ['confirmed', 'completed']);
    if (data) {
      bookings.push(
        ...data.map((b: any) => ({
          id: b.id,
          total_price: Number(b.total_price) || 0,
          currency: b.currency,
          status: b.status,
          check_in: b.check_in,
          created_at: b.created_at,
          listing_name: b.wb_properties?.name || 'Property',
          listing_type: 'property' as const,
        })),
      );
    }
  }

  if (boatIds.length > 0) {
    const { data } = await supabase
      .from('wb_bookings')
      .select('id, total_price, currency, status, check_in, created_at, wb_boats!boat_id(name)')
      .in('boat_id', boatIds)
      .in('status', ['confirmed', 'completed']);
    if (data) {
      bookings.push(
        ...data.map((b: any) => ({
          id: b.id,
          total_price: Number(b.total_price) || 0,
          currency: b.currency,
          status: b.status,
          check_in: b.check_in,
          created_at: b.created_at,
          listing_name: b.wb_boats?.name || 'Boat',
          listing_type: 'boat' as const,
        })),
      );
    }
  }

  bookings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return <EarningsClient bookings={bookings} rates={COMMISSION_RATES} />;
}

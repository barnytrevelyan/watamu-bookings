import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BookingClient from './BookingClient';

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // UUID sanity check — short-circuit obviously bad ids
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('wb_bookings')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (!booking) {
    notFound();
  }

  return <BookingClient />;
}

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BookingClient from './BookingClient';
import EnquiryStatus from './EnquiryStatus';

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
    .select(`
      id, listing_type, status, booking_mode, total_price, deposit_amount,
      check_in, check_out, trip_date, guests_count, guest_id,
      guest_contact_name, guest_contact_email, guest_contact_phone, special_requests,
      host_decline_reason,
      property:wb_properties(id, name, slug, owner_id),
      boat:wb_boats(id, name, slug, owner_id)
    `)
    .eq('id', id)
    .maybeSingle();

  if (!booking) {
    notFound();
  }

  // Direct-mode bookings (subscription listings) never flow through Stripe/M-Pesa.
  // They have their own render path covering enquiry / confirmed / declined states.
  if (booking.booking_mode === 'direct') {
    // PostgREST may return the joined listing as an object OR a single-element array
    // depending on the query planner, so normalise before reading fields.
    type ListingRow = { id: string; name: string; slug: string; owner_id: string };
    const rawListing = (
      booking.listing_type === 'property' ? booking.property : booking.boat
    ) as ListingRow | ListingRow[] | null | undefined;
    const listing: ListingRow | undefined = Array.isArray(rawListing)
      ? rawListing[0]
      : rawListing ?? undefined;

    let hostContact: { name: string | null; email: string | null; phone: string | null } = {
      name: null, email: null, phone: null,
    };
    if (listing?.owner_id) {
      const { data: host } = await supabase
        .from('wb_profiles')
        .select('full_name, email, phone')
        .eq('id', listing.owner_id)
        .maybeSingle();
      if (host) {
        hostContact = { name: host.full_name, email: host.email, phone: host.phone };
      }
    }

    return (
      <EnquiryStatus
        booking={{
          id: booking.id,
          listingType: booking.listing_type,
          status: booking.status,
          totalPrice: Number(booking.total_price),
          depositAmount: booking.deposit_amount == null ? null : Number(booking.deposit_amount),
          checkIn: booking.check_in,
          checkOut: booking.check_out,
          tripDate: booking.trip_date,
          guests: booking.guests_count,
          specialRequests: booking.special_requests,
          hostDeclineReason: booking.host_decline_reason,
        }}
        listing={{
          name: listing?.name ?? 'Listing',
          slug: listing?.slug ?? '',
        }}
        host={hostContact}
      />
    );
  }

  return <BookingClient />;
}

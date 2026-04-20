import { createClient as createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import RespondForm from './RespondForm';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; action?: string }>;
}

/**
 * Landing page for the "Confirm deposit received" / "Decline" links in the
 * host enquiry email. Validates the token server-side, then renders a form
 * that POSTs to /api/bookings/[id]/respond.
 */
export default async function EnquiryRespondPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const token = sp.token ?? '';
  const defaultAction: 'confirm' | 'decline' = sp.action === 'decline' ? 'decline' : 'confirm';

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from('wb_bookings')
    .select(`
      id, status, booking_mode, enquiry_token, listing_type,
      check_in, check_out, trip_date, guests_count, total_price, deposit_amount,
      guest_contact_name, guest_contact_email, guest_contact_phone, special_requests,
      property:wb_properties(name, slug),
      boat:wb_boats(name, slug)
    `)
    .eq('id', id)
    .single();

  // Normalise the Supabase-returned property/boat which may come back as object
  // or array depending on the query planner.
  const listing =
    (booking?.listing_type === 'property' ? booking?.property : booking?.boat) as
      | { name: string; slug: string }
      | { name: string; slug: string }[]
      | null
      | undefined;
  const listingRow = Array.isArray(listing) ? listing[0] : listing;

  const valid = !!booking && booking.enquiry_token != null && booking.enquiry_token === token;
  const alreadyResolved = booking && booking.status !== 'enquiry';

  if (!booking) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-2">Enquiry not found</h1>
        <p className="text-gray-600 mb-6">We couldn&rsquo;t find this enquiry. It may have been removed.</p>
        <Link href="/dashboard/bookings" className="text-teal-700 underline">Go to your dashboard</Link>
      </Shell>
    );
  }

  if (alreadyResolved) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-2">Already resolved</h1>
        <p className="text-gray-600 mb-6">
          This enquiry is already <strong>{booking.status}</strong>. No further action is needed.
        </p>
        <Link href="/dashboard/bookings" className="text-teal-700 underline">Go to your dashboard</Link>
      </Shell>
    );
  }

  if (!valid) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-2">Link expired</h1>
        <p className="text-gray-600 mb-6">
          This confirmation link is no longer valid. You can still confirm or decline this enquiry from your host dashboard.
        </p>
        <Link href="/dashboard/bookings" className="inline-block bg-teal-700 text-white px-4 py-2 rounded-lg font-semibold">Go to dashboard</Link>
      </Shell>
    );
  }

  const listingName = listingRow?.name || 'Listing';

  return (
    <Shell>
      <h1 className="text-2xl font-bold mb-1">Respond to enquiry</h1>
      <p className="text-gray-600 mb-6">{listingName}</p>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 text-sm">
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4">
          {booking.listing_type === 'property' ? (
            <>
              <dt className="text-gray-500">Check-in</dt>
              <dd className="font-medium text-right">{fmtDate(booking.check_in)}</dd>
              <dt className="text-gray-500">Check-out</dt>
              <dd className="font-medium text-right">{fmtDate(booking.check_out)}</dd>
            </>
          ) : (
            <>
              <dt className="text-gray-500">Trip date</dt>
              <dd className="font-medium text-right">{fmtDate(booking.trip_date)}</dd>
            </>
          )}
          <dt className="text-gray-500">Guests</dt>
          <dd className="font-medium text-right">{booking.guests_count}</dd>
          <dt className="text-gray-500">Total</dt>
          <dd className="font-medium text-right">KES {Number(booking.total_price).toLocaleString()}</dd>
          <dt className="text-gray-500">Deposit</dt>
          <dd className="font-medium text-right text-teal-700">KES {Number(booking.deposit_amount ?? 0).toLocaleString()}</dd>
          <dt className="text-gray-500">Guest</dt>
          <dd className="font-medium text-right">{booking.guest_contact_name}</dd>
          <dt className="text-gray-500">Email</dt>
          <dd className="font-medium text-right break-all">{booking.guest_contact_email}</dd>
          {booking.guest_contact_phone && (
            <>
              <dt className="text-gray-500">Phone</dt>
              <dd className="font-medium text-right">{booking.guest_contact_phone}</dd>
            </>
          )}
        </dl>
        {booking.special_requests && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Message from guest</p>
            <p className="text-gray-700 italic">&ldquo;{booking.special_requests}&rdquo;</p>
          </div>
        )}
      </div>

      <RespondForm bookingId={booking.id} token={token} defaultAction={defaultAction} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        {children}
      </div>
    </div>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

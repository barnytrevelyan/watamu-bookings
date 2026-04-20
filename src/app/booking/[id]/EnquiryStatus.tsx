'use client';

import Link from 'next/link';

/**
 * Guest-facing status page for enquiry-mode (subscription) bookings.
 *
 * Covers three states:
 *   enquiry   → waiting on host to confirm deposit received
 *   confirmed → host accepted, dates are locked, guest has contact details
 *   declined  → host couldn't accept; guest should browse other dates/listings
 */

interface EnquiryStatusProps {
  booking: {
    id: string;
    listingType: 'property' | 'boat';
    status: string;
    totalPrice: number;
    depositAmount: number | null;
    checkIn: string | null;
    checkOut: string | null;
    tripDate: string | null;
    guests: number;
    specialRequests: string | null;
    hostDeclineReason: string | null;
  };
  listing: {
    name: string;
    slug: string;
  };
  host: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtKES(n: number): string {
  return 'KES ' + Math.round(n).toLocaleString();
}

/** Normalise a Kenyan phone number into the digits-only form wa.me wants. */
function whatsappNumber(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  // Already E.164-ish (starts with 254).
  if (digits.startsWith('254')) return digits;
  // Local "07..." → "2547..."
  if (digits.startsWith('0')) return '254' + digits.slice(1);
  // Bare "7xxxxxxxx" → prefix 254.
  if (digits.length === 9 && digits.startsWith('7')) return '254' + digits;
  return digits;
}

export default function EnquiryStatus({ booking, listing, host }: EnquiryStatusProps) {
  const isProperty = booking.listingType === 'property';
  const depositDisplay = booking.depositAmount != null ? fmtKES(booking.depositAmount) : '—';
  const balanceDue =
    booking.depositAmount != null ? Math.max(0, booking.totalPrice - booking.depositAmount) : null;

  const wa = whatsappNumber(host.phone);
  const waHref = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        `Hi ${host.name ?? ''}, I've just sent an enquiry for ${listing.name} (ref ${booking.id.slice(0, 8)}).`
      )}`
    : null;

  const listingHref = `/${isProperty ? 'properties' : 'boats'}/${listing.slug}`;

  /* ------------------------------------------------------------------ */
  /*  Shared header — booking summary                                    */
  /* ------------------------------------------------------------------ */

  const bookingSummary = (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm">
      <dl className="grid grid-cols-2 gap-y-2 gap-x-4">
        <dt className="text-gray-500">Listing</dt>
        <dd className="font-medium text-right">
          <Link href={listingHref} className="text-teal-700 hover:underline">
            {listing.name}
          </Link>
        </dd>
        {isProperty ? (
          <>
            <dt className="text-gray-500">Check-in</dt>
            <dd className="font-medium text-right">{fmtDate(booking.checkIn)}</dd>
            <dt className="text-gray-500">Check-out</dt>
            <dd className="font-medium text-right">{fmtDate(booking.checkOut)}</dd>
          </>
        ) : (
          <>
            <dt className="text-gray-500">Trip date</dt>
            <dd className="font-medium text-right">{fmtDate(booking.tripDate)}</dd>
          </>
        )}
        <dt className="text-gray-500">Guests</dt>
        <dd className="font-medium text-right">{booking.guests}</dd>
        <dt className="text-gray-500">Total</dt>
        <dd className="font-medium text-right">{fmtKES(booking.totalPrice)}</dd>
        {booking.depositAmount != null && (
          <>
            <dt className="text-gray-500">Deposit to pay host</dt>
            <dd className="font-medium text-right text-teal-700">{depositDisplay}</dd>
            {balanceDue != null && (
              <>
                <dt className="text-gray-500">Balance on arrival</dt>
                <dd className="font-medium text-right">{fmtKES(balanceDue)}</dd>
              </>
            )}
          </>
        )}
        <dt className="text-gray-500">Reference</dt>
        <dd className="font-mono text-xs text-right text-gray-600">{booking.id.slice(0, 8)}</dd>
      </dl>
      {booking.specialRequests && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Your message</p>
          <p className="text-gray-700 italic">&ldquo;{booking.specialRequests}&rdquo;</p>
        </div>
      )}
    </div>
  );

  /* ------------------------------------------------------------------ */
  /*  Host contact card                                                  */
  /* ------------------------------------------------------------------ */

  const hostCard = (host.email || host.phone) && (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Your host</p>
      <p className="font-semibold text-gray-900 mb-3">{host.name ?? 'Host'}</p>
      <div className="space-y-2 text-sm">
        {host.email && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-16 shrink-0">Email</span>
            <a href={`mailto:${host.email}`} className="text-teal-700 hover:underline break-all">
              {host.email}
            </a>
          </div>
        )}
        {host.phone && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-16 shrink-0">Phone</span>
            <a href={`tel:${host.phone}`} className="text-teal-700 hover:underline">
              {host.phone}
            </a>
          </div>
        )}
      </div>
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
          </svg>
          Message on WhatsApp
        </a>
      )}
    </div>
  );

  /* ------------------------------------------------------------------ */
  /*  State: enquiry (awaiting host)                                     */
  /* ------------------------------------------------------------------ */

  if (booking.status === 'enquiry') {
    return (
      <Shell>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl shrink-0" aria-hidden>
              &#x23F3;
            </div>
            <div>
              <h1 className="text-xl font-bold text-amber-900 mb-1">
                Enquiry sent — waiting on your host
              </h1>
              <p className="text-sm text-amber-800">
                {host.name ?? 'Your host'} has been emailed the details of your request and
                usually replies within 24 hours. They&rsquo;ll confirm the booking once they
                have received your deposit of <strong>{depositDisplay}</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {bookingSummary}

          <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
            <h2 className="font-semibold text-teal-900 mb-2">What happens next</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-teal-900">
              <li>
                Reach out to your host on email or WhatsApp to arrange the deposit of{' '}
                <strong>{depositDisplay}</strong>.
              </li>
              <li>
                Your host confirms once the deposit lands &mdash; you&rsquo;ll get a
                confirmation email and this page will update.
              </li>
              <li>
                Pay the balance of{' '}
                <strong>{balanceDue != null ? fmtKES(balanceDue) : '—'}</strong> directly to your
                host on arrival.
              </li>
            </ol>
          </div>

          {hostCard}

          <div className="text-xs text-gray-500 text-center">
            Keep this page bookmarked &mdash; it updates as soon as your host responds.
          </div>
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  State: confirmed                                                   */
  /* ------------------------------------------------------------------ */

  if (booking.status === 'confirmed') {
    return (
      <Shell>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl shrink-0" aria-hidden>
              &#x2705;
            </div>
            <div>
              <h1 className="text-xl font-bold text-emerald-900 mb-1">Booking confirmed!</h1>
              <p className="text-sm text-emerald-800">
                {host.name ?? 'Your host'} has confirmed your dates. We&rsquo;ve emailed you a
                confirmation with all the details below.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {bookingSummary}

          <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
            <h2 className="font-semibold text-teal-900 mb-2">Before you arrive</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-teal-900">
              <li>Balance of {balanceDue != null ? fmtKES(balanceDue) : 'the remaining amount'} is due to your host on arrival.</li>
              <li>Contact your host directly with any questions &mdash; details below.</li>
              <li>Save this page or the confirmation email as proof of booking.</li>
            </ul>
          </div>

          {hostCard}
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  State: declined                                                    */
  /* ------------------------------------------------------------------ */

  if (booking.status === 'declined') {
    return (
      <Shell>
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xl shrink-0" aria-hidden>
              &#x2716;&#xFE0F;
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Enquiry declined</h1>
              <p className="text-sm text-gray-700">
                Unfortunately {host.name ?? 'your host'} couldn&rsquo;t accept this booking.
                No deposit was taken and your dates are not held.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {booking.hostDeclineReason && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Message from host</p>
              <p className="text-gray-800 italic">&ldquo;{booking.hostDeclineReason}&rdquo;</p>
            </div>
          )}

          {bookingSummary}

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={listingHref}
              className="flex-1 text-center bg-teal-700 hover:bg-teal-800 text-white font-semibold px-4 py-3 rounded-xl"
            >
              Try different dates
            </Link>
            <Link
              href={isProperty ? '/properties' : '/boats'}
              className="flex-1 text-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-3 rounded-xl"
            >
              Browse more {isProperty ? 'properties' : 'boats'}
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Fallback — unexpected status                                       */
  /* ------------------------------------------------------------------ */

  return (
    <Shell>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h1 className="text-xl font-bold mb-2">Booking status: {booking.status}</h1>
        <p className="text-sm text-gray-600 mb-4">
          We don&rsquo;t have a view for this status yet. If you think this is wrong, please
          contact support.
        </p>
        <Link href="/dashboard/bookings" className="text-teal-700 underline">
          Go to my bookings
        </Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">{children}</div>
    </div>
  );
}

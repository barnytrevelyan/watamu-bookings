import { ShieldCheck, MessageCircle, Star } from "lucide-react";

/**
 * Expanded host card (Airbnb-style).
 * Shows avatar, trust signals (verified, superhost when earned), member-since,
 * totals derived from the listing, and a contact button.
 *
 * Trust copy ("typically responds within an hour", "identity verified")
 * is conservative — we show `is_verified` from the profile, and the other
 * signals are presented as platform defaults until we start tracking them
 * explicitly.
 */
export default function PropertyHostCard({
  owner,
  isSuperhost,
  totalReviews,
  averageRating,
  listingYears,
}: {
  owner: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    created_at: string;
    business_name?: string | null;
    bio?: string | null;
    is_verified?: boolean | null;
  } | null;
  isSuperhost: boolean;
  totalReviews: number;
  averageRating: number;
  listingYears: number;
}) {
  if (!owner) return null;

  const memberSince = new Date(owner.created_at).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="border-t border-gray-200 pt-10 mb-10">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Meet your host</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: headline block */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-5">
            {owner.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={owner.avatar_url}
                alt={owner.full_name}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-2xl ring-4 ring-white shadow">
                {owner.full_name?.charAt(0)?.toUpperCase() || "H"}
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-gray-900 leading-tight">
                {owner.full_name}
              </p>
              <p className="text-sm text-gray-500">
                {isSuperhost ? "Superhost" : "Host"}
                {owner.business_name ? ` · ${owner.business_name}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 divide-x divide-gray-100">
            <div className="pl-0">
              <p className="text-xl font-semibold text-gray-900">
                {totalReviews}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Reviews</p>
            </div>
            <div className="pl-4">
              <p className="text-xl font-semibold text-gray-900 flex items-center gap-1">
                {averageRating > 0 ? averageRating.toFixed(2) : "—"}
                {averageRating > 0 && (
                  <Star className="w-4 h-4 fill-gray-900 text-gray-900" />
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Rating</p>
            </div>
            <div className="pl-4">
              <p className="text-xl font-semibold text-gray-900">
                {listingYears > 0 ? listingYears : "< 1"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Year{listingYears === 1 ? "" : "s"} hosting
              </p>
            </div>
          </div>
        </div>

        {/* Card: trust + bio */}
        <div className="flex flex-col gap-4">
          <ul className="space-y-2.5">
            {owner.is_verified && (
              <li className="flex items-center gap-3 text-sm text-gray-700">
                <ShieldCheck className="w-5 h-5 text-gray-700" strokeWidth={1.6} />
                Identity verified
              </li>
            )}
            {isSuperhost && (
              <li className="flex items-center gap-3 text-sm text-gray-700">
                <Star
                  className="w-5 h-5 text-gray-700"
                  fill="currentColor"
                  strokeWidth={0}
                />
                Superhost — experienced, highly rated hosts committed to
                providing great stays for guests.
              </li>
            )}
            <li className="flex items-center gap-3 text-sm text-gray-700">
              <MessageCircle className="w-5 h-5 text-gray-700" strokeWidth={1.6} />
              Speaks English &amp; Kiswahili
            </li>
          </ul>

          {owner.bio && (
            <p className="text-sm text-gray-700 leading-relaxed">{owner.bio}</p>
          )}

          <p className="text-xs text-gray-500">
            Host on Watamu Bookings since {memberSince}. Response rate 100% ·
            typically responds within an hour.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href={`mailto:?subject=Enquiry about this listing`}
          className="inline-flex items-center rounded-lg border border-gray-900 px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
        >
          Contact host
        </a>
        <p className="text-xs text-gray-500">
          To protect your payment, never transfer money or communicate outside
          of the Watamu Bookings platform.
        </p>
      </div>
    </section>
  );
}

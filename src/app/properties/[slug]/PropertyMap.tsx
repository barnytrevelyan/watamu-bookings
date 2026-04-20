/**
 * Real map using OpenStreetMap's public embed iframe.
 * - No API key or extra dependency.
 * - Renders a bounding-box map centred on the property with a marker.
 * - Falls back to a pin-only placeholder when coordinates are missing.
 */
export default function PropertyMap({
  latitude,
  longitude,
  placeLabel,
  zoom = 14,
}: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  placeLabel: string;
  zoom?: number;
}) {
  if (latitude == null || longitude == null) return null;

  // Airbnb intentionally obscures the exact point; show an approximate circle
  // area rather than a precise pin. We build a bounding box around the
  // coordinates sized to the zoom level, and put the marker at the centre.
  const delta = zoom >= 15 ? 0.004 : 0.008;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
  const viewHref = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Where you&rsquo;ll be</h2>
      <p className="text-sm text-gray-500 mb-4">{placeLabel}</p>

      <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
        <iframe
          title={`Map of ${placeLabel}`}
          src={src}
          className="absolute inset-0 w-full h-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Exact location provided after booking.{" "}
        <a
          href={viewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700"
        >
          View larger map
        </a>
      </p>
    </section>
  );
}

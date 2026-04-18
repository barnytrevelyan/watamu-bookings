'use client';

import { useEffect, useState } from 'react';

const WATAMU_LOCATIONS = [
  {
    name: 'Watamu Beach',
    lat: -3.354,
    lng: 40.024,
    description: 'The main beach in Watamu — white sand and turquoise water.',
  },
  {
    name: 'Turtle Bay',
    lat: -3.369,
    lng: 40.026,
    description:
      'A sheltered bay famous for sea turtles and the Watamu Marine Park entrance.',
  },
  {
    name: 'Garoda Beach',
    lat: -3.344,
    lng: 40.029,
    description:
      'A quieter stretch of pristine beach north of Watamu centre.',
  },
  {
    name: 'Mida Creek',
    lat: -3.334,
    lng: 40.063,
    description:
      'A tidal inlet surrounded by mangroves — take a dhow trip or walk the boardwalk.',
  },
  {
    name: 'Ocean Sports',
    lat: -3.356,
    lng: 40.021,
    description:
      'Iconic beachfront resort, restaurant, and the main deep-sea fishing base.',
  },
  {
    name: 'Watamu Marine National Park',
    lat: -3.377,
    lng: 40.015,
    description:
      'Protected marine reserve with vibrant coral reefs and abundant sea life.',
  },
  {
    name: 'Local Ocean Conservation (Turtle Watch)',
    lat: -3.352,
    lng: 40.024,
    description:
      'Sea turtle conservation centre — visit to learn about their rescue and release programme.',
  },
  {
    name: 'Bio-Ken Snake Farm',
    lat: -3.349,
    lng: 40.017,
    description:
      'Snake research centre and one of Watamu\'s unique attractions.',
  },
];

export default function MapPage() {
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    // Dynamically load Leaflet to avoid SSR issues
    const loadMap = async () => {
      const L = (await import('leaflet')).default;

      // Fix default icon paths for webpack/next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Only init once
      const container = document.getElementById('watamu-map');
      if (!container || (container as any)._leaflet_id) return;

      const map = L.map('watamu-map').setView([-3.354, 40.024], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      // Custom teal marker icon
      const tealIcon = L.divIcon({
        html: `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#0d9488"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`,
        className: '',
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        popupAnchor: [0, -40],
      });

      WATAMU_LOCATIONS.forEach((loc) => {
        L.marker([loc.lat, loc.lng], { icon: tealIcon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:180px">
              <strong style="font-size:14px;color:#111827">${loc.name}</strong>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;line-height:1.4">${loc.description}</p>
            </div>`
          );
      });

      setMapReady(true);
    };

    loadMap();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-700 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Explore Watamu
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Discover beaches, marine parks, and key locations around Watamu.
            Click on any marker for more details.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Leaflet CSS */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />

        {/* Map Container */}
        <div className="relative rounded-2xl overflow-hidden shadow-lg border border-gray-200">
          {!mapReady && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Loading map...</p>
              </div>
            </div>
          )}
          <div id="watamu-map" className="w-full h-[500px] lg:h-[600px]" />
        </div>

        {/* Location Cards */}
        <div className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Key Locations
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {WATAMU_LOCATIONS.map((loc) => (
              <div
                key={loc.name}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0 mt-0.5">
                    <svg
                      className="w-4 h-4 text-teal-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {loc.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      {loc.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

// Correct coordinates for Watamu landmarks (verified via Google Maps)
const WATAMU_LOCATIONS = [
  {
    name: 'Watamu Beach',
    lat: -3.3540,
    lng: 40.0190,
    description: 'The main beach — white coral sand stretching south from the village.',
    category: 'beach',
  },
  {
    name: 'Turtle Bay Beach',
    lat: -3.3710,
    lng: 40.0100,
    description: 'Sheltered bay famous for sea turtles, between the headlands.',
    category: 'beach',
  },
  {
    name: 'Garoda Beach',
    lat: -3.3380,
    lng: 40.0260,
    description: 'Quiet, pristine beach north of Watamu village — great for long walks.',
    category: 'beach',
  },
  {
    name: 'Mida Creek',
    lat: -3.3330,
    lng: 40.0580,
    description: 'Tidal inlet with mangroves — dhow trips, bird watching, and the famous boardwalk.',
    category: 'nature',
  },
  {
    name: 'Ocean Sports Resort',
    lat: -3.3530,
    lng: 40.0175,
    description: 'Iconic waterfront resort, restaurant, and deep-sea fishing departure point.',
    category: 'dining',
  },
  {
    name: 'Watamu Marine National Park',
    lat: -3.3650,
    lng: 40.0050,
    description: 'Protected marine reserve — snorkelling, glass-bottom boats, and vibrant coral reefs.',
    category: 'nature',
  },
  {
    name: 'Local Ocean Conservation',
    lat: -3.3560,
    lng: 40.0210,
    description: 'Sea turtle rescue and rehabilitation centre. Visit to see turtles up close.',
    category: 'nature',
  },
  {
    name: 'Bio-Ken Snake Farm',
    lat: -3.3480,
    lng: 40.0170,
    description: 'Snake research centre with the largest collection of snakes in East Africa.',
    category: 'nature',
  },
  {
    name: 'Pilipan Restaurant',
    lat: -3.3500,
    lng: 40.0150,
    description: 'Asian fusion restaurant overlooking Prawn Lake — famous curries and sunset cocktails.',
    category: 'dining',
  },
  {
    name: "Andrea's Ice Cream",
    lat: -3.3525,
    lng: 40.0195,
    description: 'Italian ice cream, pastries, and coffee in the heart of Watamu village.',
    category: 'dining',
  },
  {
    name: 'Tribe Watersports',
    lat: -3.3520,
    lng: 40.0180,
    description: 'Kite surfing, wakeboarding, SUP, and all watersports in Watamu.',
    category: 'activity',
  },
  {
    name: 'Gede Ruins',
    lat: -3.3090,
    lng: 40.0180,
    description: 'Mysterious 12th-century Swahili town ruins in the forest — a must-visit.',
    category: 'nature',
  },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  beach: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  nature: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  dining: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  activity: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
};

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    const loadMap = async () => {
      const L = (await import('leaflet')).default;

      const container = document.getElementById('watamu-map');
      if (!container || (container as any)._leaflet_id) return;

      // Esri World Imagery in Watamu has real imagery up to z18; z19 returns
      // the "Map data not yet available" placeholder (verified 2026-04-21 by
      // probing the tile server). Cap the map itself at 18 so the zoom UI
      // cannot step past the last usable level.
      const MAX_ZOOM = 18;

      const map = L.map('watamu-map', {
        center: [-3.3500, 40.0200],
        zoom: 14,
        maxZoom: MAX_ZOOM,
        zoomControl: true,
      });

      // Esri World Imagery — a properly-licensed satellite basemap.
      // (Previously used Google tiles via an unofficial endpoint, which
      // breaches Google's terms of service.)
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: MAX_ZOOM,
          maxNativeZoom: MAX_ZOOM,
          attribution:
            'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        }
      ).addTo(map);

      // Labels overlay (place names, roads) — semi-transparent reference
      // layer on top of the imagery, also from Esri.
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: MAX_ZOOM,
          maxNativeZoom: MAX_ZOOM,
          opacity: 0.9,
        }
      ).addTo(map);

      // Marker colours per category
      const markerColors: Record<string, string> = {
        beach: '#3b82f6',
        nature: '#22c55e',
        dining: '#f97316',
        activity: '#a855f7',
      };

      WATAMU_LOCATIONS.forEach((loc) => {
        const color = markerColors[loc.category] || '#0d9488';
        const icon = L.divIcon({
          html: `<svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 0C6.716 0 0 6.716 0 15c0 11.25 15 27 15 27s15-15.75 15-27C30 6.716 23.284 0 15 0z" fill="${color}"/>
            <circle cx="15" cy="15" r="6" fill="white"/>
          </svg>`,
          className: '',
          iconSize: [30, 42],
          iconAnchor: [15, 42],
          popupAnchor: [0, -42],
        });

        L.marker([loc.lat, loc.lng], { icon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:200px;font-family:system-ui">
              <strong style="font-size:14px;color:#fff">${loc.name}</strong>
              <p style="margin:6px 0 0;font-size:12px;color:#d1d5db;line-height:1.5">${loc.description}</p>
            </div>`,
            {
              className: 'dark-popup',
            }
          );
      });

      setMapReady(true);
    };

    loadMap();
  }, []);

  const filteredLocations = activeCategory
    ? WATAMU_LOCATIONS.filter((l) => l.category === activeCategory)
    : WATAMU_LOCATIONS;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-700 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Explore Watamu
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Beaches, marine parks, restaurants, and activities — everything you
            need to know about Watamu on one map.
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

        {/* Dark popup styles for satellite view */}
        <style>{`
          .dark-popup .leaflet-popup-content-wrapper {
            background: rgba(17, 24, 39, 0.92);
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          }
          .dark-popup .leaflet-popup-tip {
            background: rgba(17, 24, 39, 0.92);
          }
        `}</style>

        {/* Map Container — the loader is rendered INSIDE the mount div so
            Leaflet wipes it on init (and so a no-JS crawler still sees a
            sensible container rather than a stuck spinner). */}
        <div className="relative rounded-2xl overflow-hidden shadow-lg border border-gray-200">
          <div
            id="watamu-map"
            ref={mapRef}
            className="relative w-full h-[500px] lg:h-[650px] bg-gray-900"
          >
            <noscript>
              <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-gray-300">
                This interactive map needs JavaScript. A full list of the
                locations is available below.
              </div>
            </noscript>
            {!mapReady && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-400 text-sm">Loading satellite map...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Category filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              !activeCategory
                ? 'bg-teal-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All ({WATAMU_LOCATIONS.length})
          </button>
          {[
            { key: 'beach', label: 'Beaches' },
            { key: 'nature', label: 'Nature & Heritage' },
            { key: 'dining', label: 'Dining' },
            { key: 'activity', label: 'Activities' },
          ].map((cat) => {
            const count = WATAMU_LOCATIONS.filter((l) => l.category === cat.key).length;
            const colors = CATEGORY_COLORS[cat.key];
            return (
              <button
                key={cat.key}
                onClick={() =>
                  setActiveCategory(activeCategory === cat.key ? null : cat.key)
                }
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat.key
                    ? `${colors.bg} ${colors.text} ring-2 ring-current`
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Location Cards */}
        <div className="mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLocations.map((loc) => {
              const colors = CATEGORY_COLORS[loc.category] || CATEGORY_COLORS.beach;
              return (
                <div
                  key={loc.name}
                  className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${colors.dot} mt-1.5 shrink-0`}
                    />
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {loc.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        {loc.description}
                      </p>
                      <span
                        className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                      >
                        {loc.category}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Place, PlaceMapPoi } from '@/lib/types';

// Coordinates from the Google Places API (text search), fetched 2026-04-21.
// These resolve the actual establishment pins rather than village-centre
// approximations, so they're accurate to within a few metres of the real door.
// Used only when the current place has no map_pois_json populated — Watamu's
// baked-in landmarks stay put so the legacy host keeps its familiar POIs.
const WATAMU_FALLBACK_LOCATIONS: PlaceMapPoi[] = [
  {
    name: 'Watamu Beach',
    lat: -3.357782,
    lng: 40.018439,
    description: 'The main beach — white coral sand stretching south from the village.',
    category: 'beach',
  },
  {
    name: 'Turtle Bay Beach',
    lat: -3.362774,
    lng: 40.004073,
    description: 'Sheltered bay famous for sea turtles, between the headlands.',
    category: 'beach',
  },
  {
    name: 'Garoda Beach',
    lat: -3.385326,
    lng: 39.980840,
    description: 'Quiet, pristine beach south of Watamu village — great for long walks.',
    category: 'beach',
  },
  {
    name: 'Mida Creek',
    lat: -3.372656,
    lng: 39.967790,
    description: 'Tidal inlet with mangroves — dhow trips, bird watching, and the famous Dabaso boardwalk.',
    category: 'nature',
  },
  {
    name: 'Ocean Sports Resort',
    lat: -3.361031,
    lng: 40.007989,
    description: 'Iconic waterfront resort, restaurant, and deep-sea fishing departure point.',
    category: 'dining',
  },
  {
    name: 'Watamu Marine National Park',
    lat: -3.385635,
    lng: 39.973519,
    description: 'Protected marine reserve — snorkelling, glass-bottom boats, and vibrant coral reefs.',
    category: 'nature',
  },
  {
    name: 'Local Ocean Conservation',
    lat: -3.375846,
    lng: 39.985273,
    description: 'Sea turtle rescue and rehabilitation centre. Visit to see turtles up close.',
    category: 'nature',
  },
  {
    name: 'Bio-Ken Snake Farm',
    lat: -3.344635,
    lng: 40.029151,
    description: 'Snake research centre with the largest collection of snakes in East Africa.',
    category: 'nature',
  },
  {
    name: 'Pilipan Restaurant',
    lat: -3.370157,
    lng: 39.994841,
    description: 'Asian fusion restaurant overlooking Prawn Lake — famous curries and sunset cocktails.',
    category: 'dining',
  },
  {
    name: "Andrea's Ice Cream",
    lat: -3.356009,
    lng: 40.020794,
    description: 'Italian ice cream, pastries, and coffee in the heart of Watamu village.',
    category: 'dining',
  },
  {
    name: 'Tribe Watersports',
    lat: -3.375182,
    lng: 39.986927,
    description: 'Kite surfing, wakeboarding, SUP, and all watersports in Watamu.',
    category: 'activity',
  },
  {
    name: 'Gede Ruins',
    lat: -3.310020,
    lng: 40.017203,
    description: 'Mysterious 12th-century Swahili town ruins in the forest — a must-visit.',
    category: 'nature',
  },
];

// Default centre if a place has no centroid on record — the Watamu peninsula,
// roughly the midpoint between Garoda Beach (south) and Watamu Beach (north).
const DEFAULT_CENTRE: [number, number] = [-3.370, 40.003];

type MapProperty = {
  id: string;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  base_price_per_night: number | null;
  currency: string | null;
  property_type: string | null;
  bedrooms: number | null;
};

// Zoom threshold — property markers are only shown at or above this level.
// At lower zooms they'd clutter the overview; the landmarks already give
// enough orientation.
const PROPERTY_ZOOM_THRESHOLD = 14;

const FMT = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  beach: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  nature: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  dining: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  activity: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  landmark: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};
const FALLBACK_CATEGORY = { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' };

interface MapClientProps {
  place: Place | null;
}

export default function MapClient({ place }: MapClientProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Prefer place-defined POIs. Otherwise fall back to the baked-in Watamu list
  // (only applies to watamu host or a place with no pois seeded yet).
  const placePois: PlaceMapPoi[] = Array.isArray(place?.map_pois_json) && place!.map_pois_json.length > 0
    ? place!.map_pois_json
    : WATAMU_FALLBACK_LOCATIONS;

  const centre: [number, number] =
    place?.centroid_lat != null && place?.centroid_lng != null
      ? [Number(place.centroid_lat), Number(place.centroid_lng)]
      : DEFAULT_CENTRE;

  const defaultZoom = place?.default_zoom && Number.isFinite(place.default_zoom)
    ? Number(place.default_zoom)
    : 13;

  const placeName = place?.name ?? 'Watamu';

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

      // Centre on the current place's centroid (or a sensible Watamu default).
      const map = L.map('watamu-map', {
        center: centre,
        zoom: defaultZoom,
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

      placePois.forEach((loc) => {
        const color = loc.colour || markerColors[loc.category] || '#0d9488';
        const icon = L.divIcon({
          // 50% opacity on the whole SVG so the satellite imagery stays
          // readable through clusters of pins.
          html: `<svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity:0.5">
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

      // ---- Property markers (only visible at higher zooms) --------------
      // Layer group we can add/remove based on zoom level. We hydrate it
      // lazily after the map is interactive so the initial view is snappy.
      const propertyLayer = L.layerGroup();

      const renderPropertyLayer = (props: MapProperty[]) => {
        propertyLayer.clearLayers();
        props.forEach((p) => {
          const lat = Number(p.latitude);
          const lng = Number(p.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          // Small teal circle — visually distinct from the pin icons used
          // for landmarks, so the two layers don't read as the same thing.
          const propIcon = L.divIcon({
            // 50% opacity to match the landmark pins — stays visible but
            // lets the satellite imagery breathe through.
            html: `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="opacity:0.5">
              <circle cx="10" cy="10" r="8" fill="#0d9488" stroke="white" stroke-width="2.5"/>
              <circle cx="10" cy="10" r="2.5" fill="white"/>
            </svg>`,
            className: '',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            popupAnchor: [0, -12],
          });

          const pricePart =
            p.base_price_per_night != null
              ? `<div style="margin-top:6px;font-size:12px;color:#d1d5db">${p.currency ?? 'KES'} ${FMT.format(Number(p.base_price_per_night))} <span style="opacity:.7">/ night</span></div>`
              : '';
          const typePart = p.property_type
            ? `<span style="display:inline-block;margin-top:8px;padding:2px 8px;font-size:10px;border-radius:999px;background:#0d9488;color:white;text-transform:capitalize">${p.property_type.replace('_', ' ')}${p.bedrooms ? ` · ${p.bedrooms}BR` : ''}</span>`
            : '';

          L.marker([lat, lng], { icon: propIcon })
            .addTo(propertyLayer)
            .bindPopup(
              `<div style="min-width:200px;font-family:system-ui">
                <strong style="font-size:13px;color:#fff">${p.name}</strong>
                ${pricePart}
                <div style="margin-top:8px">
                  <a href="/properties/${p.slug}" style="font-size:12px;color:#5eead4;text-decoration:underline">View listing →</a>
                </div>
                ${typePart}
              </div>`,
              { className: 'dark-popup' }
            );
        });
      };

      // Toggle the whole layer in/out of the map on zoom changes. Hiding
      // beats fading opacity because the markers don't intercept clicks
      // through the landmarks at overview zooms.
      const syncPropertyLayerVisibility = () => {
        const z = map.getZoom();
        const shouldShow = z >= PROPERTY_ZOOM_THRESHOLD;
        const alreadyOn = map.hasLayer(propertyLayer);
        if (shouldShow && !alreadyOn) propertyLayer.addTo(map);
        if (!shouldShow && alreadyOn) map.removeLayer(propertyLayer);
      };
      map.on('zoomend', syncPropertyLayerVisibility);

      // Fetch published property coordinates. Using the public anon key;
      // RLS restricts to is_published = true rows. Cheap query — few rows
      // today, will stay light until we hit hundreds of listings, at which
      // point we should gate this behind a server endpoint + viewport bbox.
      try {
        const supabase = createClient();
        let q = supabase
          .from('wb_properties')
          .select('id, slug, name, latitude, longitude, base_price_per_night, currency, property_type, bedrooms')
          .eq('is_published', true)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);

        // When rendering a specific place's map, only show that place's
        // properties — otherwise pins in Kilifi would surface on a Watamu map.
        if (place?.id) q = q.eq('place_id', place.id);

        const { data, error } = await q;

        if (!error && data) {
          renderPropertyLayer(data as MapProperty[]);
          syncPropertyLayerVisibility();
        }
      } catch (e) {
        // Non-fatal: landmarks still render even if properties fail to load.
        console.warn('Could not load property markers', e);
      }

      setMapReady(true);
    };

    loadMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.id]);

  const filteredLocations = activeCategory
    ? placePois.filter((l) => l.category === activeCategory)
    : placePois;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-700 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Explore {placeName}
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Beaches, marine parks, restaurants, and activities — everything you
            need to know about {placeName} on one map.
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

        {/* Hint: tell the user to zoom in to see property pins — otherwise
            the teal dots look like empty white-space. */}
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-teal-600 ring-2 ring-white shadow-sm" />
            <span>Zoom in to see bookable properties</span>
          </span>
        </div>

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
            All ({placePois.length})
          </button>
          {[
            { key: 'beach', label: 'Beaches' },
            { key: 'nature', label: 'Nature & Heritage' },
            { key: 'landmark', label: 'Landmarks' },
            { key: 'dining', label: 'Dining' },
            { key: 'activity', label: 'Activities' },
          ]
            .filter((cat) => placePois.some((l) => l.category === cat.key))
            .map((cat) => {
            const count = placePois.filter((l) => l.category === cat.key).length;
            const colors = CATEGORY_COLORS[cat.key] ?? FALLBACK_CATEGORY;
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
              const colors = CATEGORY_COLORS[loc.category] ?? FALLBACK_CATEGORY;
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

'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import type { Place } from '@/lib/types';

// ─── Harmonic Tidal Prediction for Watamu / Kilindini ───────────────
// Uses principal tidal constituents calibrated for the Kenya coast.
// Amplitudes (metres) and angular speeds (°/hour) are standard; the
// phase offsets are calibrated so the prediction closely matches
// published tide tables for Watamu in April 2026.

const MEAN_SEA_LEVEL = 1.92; // metres above chart datum

interface Constituent {
  name: string;
  amp: number;   // amplitude in metres
  speed: number; // degrees per hour
  phase: number; // phase offset in degrees (calibrated)
}

const CONSTITUENTS: Constituent[] = [
  { name: 'M2', amp: 1.22, speed: 28.9841, phase: 172 },   // principal lunar semidiurnal
  { name: 'S2', amp: 0.50, speed: 30.0000, phase: 205 },   // principal solar semidiurnal
  { name: 'N2', amp: 0.24, speed: 28.4397, phase: 148 },   // larger lunar elliptic
  { name: 'K1', amp: 0.16, speed: 15.0411, phase: 18 },    // luni-solar diurnal
  { name: 'O1', amp: 0.10, speed: 13.9430, phase: 340 },   // principal lunar diurnal
  { name: 'K2', amp: 0.14, speed: 30.0821, phase: 200 },   // luni-solar semidiurnal
  { name: 'M4', amp: 0.04, speed: 57.9682, phase: 320 },   // shallow-water quarter-diurnal
  { name: 'SA', amp: 0.08, speed: 0.0411,  phase: 120 },   // solar annual
];

// Reference epoch: 2026-01-01T00:00:00Z (UTC)
const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);

function getTideHeight(date: Date): number {
  const hoursFromEpoch = (date.getTime() - EPOCH) / 3600000;
  let h = MEAN_SEA_LEVEL;
  for (const c of CONSTITUENTS) {
    const angle = (c.speed * hoursFromEpoch + c.phase) * (Math.PI / 180);
    h += c.amp * Math.cos(angle);
  }
  return h;
}

interface TidePoint {
  time: Date;
  height: number;
}

interface TideEvent {
  time: Date;
  height: number;
  type: 'high' | 'low';
}

/** Generate tide heights at `intervalMin`-minute intervals over `days` from `start` */
function generateTideCurve(start: Date, days: number, intervalMin: number = 10): TidePoint[] {
  const points: TidePoint[] = [];
  const totalMinutes = days * 24 * 60;
  for (let m = 0; m <= totalMinutes; m += intervalMin) {
    const t = new Date(start.getTime() + m * 60000);
    points.push({ time: t, height: getTideHeight(t) });
  }
  return points;
}

/** Find high and low tide events from the curve */
function findTideEvents(points: TidePoint[]): TideEvent[] {
  const events: TideEvent[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].height;
    const curr = points[i].height;
    const next = points[i + 1].height;
    if (curr > prev && curr > next) {
      events.push({ time: points[i].time, height: curr, type: 'high' });
    } else if (curr < prev && curr < next) {
      events.push({ time: points[i].time, height: curr, type: 'low' });
    }
  }
  return events;
}

// ─── Moon Phase ─────────────────────────────────────────────────────

function getMoonPhase(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let c = year, e = month;
  if (month < 3) { c = year - 1; e = month + 12; }
  let jd = Math.floor(365.25 * (c + 4716)) + Math.floor(30.6001 * (e + 1)) + day - 1524.5;
  jd -= Math.floor(c / 100) - Math.floor(c / 400) - 2;
  let b = ((jd - 2451550.1) / 29.530588853) % 1;
  if (b < 0) b += 1;
  return b;
}

function getMoonEmoji(phase: number): string {
  if (phase < 0.0625) return '\uD83C\uDF11';
  if (phase < 0.1875) return '\uD83C\uDF12';
  if (phase < 0.3125) return '\uD83C\uDF13';
  if (phase < 0.4375) return '\uD83C\uDF14';
  if (phase < 0.5625) return '\uD83C\uDF15';
  if (phase < 0.6875) return '\uD83C\uDF16';
  if (phase < 0.8125) return '\uD83C\uDF17';
  if (phase < 0.9375) return '\uD83C\uDF18';
  return '\uD83C\uDF11';
}

function getMoonPhaseName(phase: number): string {
  if (phase < 0.0625) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  if (phase < 0.9375) return 'Waning Crescent';
  return 'New Moon';
}

function getMoonIllumination(phase: number): number {
  return Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);
}

// ─── Marine / Wave data (Open-Meteo) ───────────────────────────────

interface MarineData {
  current: { wave_height: number; wave_direction: number; wave_period: number };
  daily: { time: string[]; wave_height_max: number[]; wave_direction_dominant: number[]; wave_period_max: number[] };
}

function getDirectionLabel(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

function getWaveCondition(h: number): { label: string; color: string } {
  if (h < 0.5) return { label: 'Calm', color: 'text-emerald-600' };
  if (h < 1.0) return { label: 'Slight', color: 'text-teal-600' };
  if (h < 1.5) return { label: 'Moderate', color: 'text-yellow-600' };
  if (h < 2.5) return { label: 'Rough', color: 'text-orange-600' };
  return { label: 'Very Rough', color: 'text-red-600' };
}

// ─── Weather data (Open-Meteo) ─────────────────────────────────────

interface WeatherData {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    uv_index?: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_direction_10m_dominant: number[];
    uv_index_max: number[];
  };
}

// WMO weather interpretation codes — https://open-meteo.com/en/docs
function describeWeatherCode(code: number, isDay: boolean = true): { label: string; icon: string } {
  // Emoji chosen to stay legible on both light and dark backgrounds.
  switch (code) {
    case 0:  return { label: 'Clear sky',          icon: isDay ? '\u2600\uFE0F' : '\uD83C\uDF19' };
    case 1:  return { label: 'Mainly clear',       icon: isDay ? '\uD83C\uDF24\uFE0F' : '\uD83C\uDF19' };
    case 2:  return { label: 'Partly cloudy',      icon: isDay ? '\u26C5' : '\u2601\uFE0F' };
    case 3:  return { label: 'Overcast',           icon: '\u2601\uFE0F' };
    case 45:
    case 48: return { label: 'Fog',                icon: '\uD83C\uDF2B\uFE0F' };
    case 51:
    case 53:
    case 55: return { label: 'Drizzle',            icon: '\uD83C\uDF26\uFE0F' };
    case 56:
    case 57: return { label: 'Freezing drizzle',   icon: '\uD83C\uDF27\uFE0F' };
    case 61: return { label: 'Light rain',         icon: '\uD83C\uDF26\uFE0F' };
    case 63: return { label: 'Rain',               icon: '\uD83C\uDF27\uFE0F' };
    case 65: return { label: 'Heavy rain',         icon: '\uD83C\uDF27\uFE0F' };
    case 66:
    case 67: return { label: 'Freezing rain',      icon: '\uD83C\uDF27\uFE0F' };
    case 71:
    case 73:
    case 75: return { label: 'Snow',               icon: '\u2744\uFE0F' };
    case 77: return { label: 'Snow grains',        icon: '\u2744\uFE0F' };
    case 80: return { label: 'Light showers',      icon: '\uD83C\uDF26\uFE0F' };
    case 81: return { label: 'Showers',            icon: '\uD83C\uDF27\uFE0F' };
    case 82: return { label: 'Heavy showers',      icon: '\u26C8\uFE0F' };
    case 85:
    case 86: return { label: 'Snow showers',       icon: '\uD83C\uDF28\uFE0F' };
    case 95: return { label: 'Thunderstorm',       icon: '\u26C8\uFE0F' };
    case 96:
    case 99: return { label: 'Severe thunderstorm',icon: '\u26C8\uFE0F' };
    default: return { label: 'Unknown',            icon: isDay ? '\u26C5' : '\u2601\uFE0F' };
  }
}

function getUvLabel(uv: number): { label: string; color: string } {
  if (uv < 3)  return { label: 'Low',       color: 'text-emerald-600' };
  if (uv < 6)  return { label: 'Moderate',  color: 'text-yellow-600' };
  if (uv < 8)  return { label: 'High',      color: 'text-orange-600' };
  if (uv < 11) return { label: 'Very High', color: 'text-red-600' };
  return { label: 'Extreme', color: 'text-fuchsia-700' };
}

function getWindDescription(kmh: number): string {
  if (kmh < 6)  return 'Calm';
  if (kmh < 12) return 'Light breeze';
  if (kmh < 20) return 'Gentle breeze';
  if (kmh < 29) return 'Moderate breeze';
  if (kmh < 39) return 'Fresh breeze';
  if (kmh < 50) return 'Strong breeze';
  return 'Gale';
}

// ─── Helpers ────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' });
}

function fmtDayLabel(d: Date, today: Date): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const td = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = (dt - td) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
}

function dayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
}

function getShortWeekday(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Africa/Nairobi' });
}

// ─── Tide Chart (Windfinder-style) ─────────────────────────────────

function TideChart({ points, events, days }: { points: TidePoint[]; events: TideEvent[]; days: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; time: Date; height: number } | null>(null);

  // Plot spans edge-to-edge so the 7 day columns line up vertically with
  // the 7-column weather grid in the card above (same parent width, no
  // horizontal pad on either side).
  const chartW = 1100;
  const chartH = 320;
  const padTop = 30;
  const padBottom = 45;
  const padLeft = 0;
  const padRight = 0;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  // Y range: 0 to next integer above max
  const maxH = Math.max(...points.map(p => p.height));
  const yMax = Math.ceil(maxH);

  const startMs = points[0].time.getTime();
  const endMs = points[points.length - 1].time.getTime();
  const totalMs = endMs - startMs;

  function xOf(t: Date): number {
    return padLeft + ((t.getTime() - startMs) / totalMs) * plotW;
  }
  function yOf(h: number): number {
    return padTop + plotH - (h / yMax) * plotH;
  }

  // Build smooth SVG path
  const pathPoints = points.map(p => ({ x: xOf(p.time), y: yOf(p.height) }));
  let pathD = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
  for (let i = 1; i < pathPoints.length; i++) {
    const prev = pathPoints[i - 1];
    const curr = pathPoints[i];
    const cpx = (prev.x + curr.x) / 2;
    pathD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  const areaD = pathD + ` L ${pathPoints[pathPoints.length - 1].x} ${padTop + plotH} L ${pathPoints[0].x} ${padTop + plotH} Z`;

  // Y gridlines
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += 1) yTicks.push(v);

  // Day separators and noon markers
  const daySeps: { x: number; label: string }[] = [];
  const noonMarkers: { x: number }[] = [];
  const startDate = new Date(points[0].time);
  for (let d = 0; d < days; d++) {
    const dayStart = new Date(startDate);
    dayStart.setDate(dayStart.getDate() + d);
    dayStart.setHours(0, 0, 0, 0);
    if (dayStart.getTime() >= startMs && dayStart.getTime() <= endMs) {
      daySeps.push({ x: xOf(dayStart), label: getShortWeekday(dayStart) });
    }
    // Noon marker (12:00)
    const noon = new Date(dayStart);
    noon.setHours(12, 0, 0, 0);
    if (noon.getTime() >= startMs && noon.getTime() <= endMs) {
      noonMarkers.push({ x: xOf(noon) });
    }
  }

  // "Now" marker
  const now = new Date();
  const nowX = xOf(now);
  const nowH = getTideHeight(now);
  const nowY = yOf(nowH);
  const nowInRange = now.getTime() >= startMs && now.getTime() <= endMs;

  // Hover
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (chartW / rect.width);
    const frac = (mouseX - padLeft) / plotW;
    if (frac < 0 || frac > 1) { setTooltip(null); return; }
    const t = new Date(startMs + frac * totalMs);
    const h = getTideHeight(t);
    setTooltip({ x: xOf(t), y: yOf(h), time: t, height: h });
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="w-full h-auto min-w-[700px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Y gridlines — tick labels float inside the plot so the chart
            edge itself remains at x=0 and aligns with the weather grid. */}
        {yTicks.map(v => {
          const y = yOf(v);
          return (
            <g key={v}>
              <line x1={padLeft} y1={y} x2={chartW - padRight} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray={v === 0 ? '' : '4,4'} />
              <text x={6} y={y - 3} textAnchor="start" fontSize="11" fill="#9ca3af">{v}m</text>
            </g>
          );
        })}

        {/* Day separators */}
        {daySeps.map((sep, i) => (
          <g key={i}>
            <line x1={sep.x} y1={padTop} x2={sep.x} y2={padTop + plotH} stroke="#d1d5db" strokeWidth="1" />
            <text x={sep.x + (plotW / days) / 2} y={chartH - 8} textAnchor="middle" fontSize="12" fontWeight="500" fill="#6b7280">{sep.label}</text>
          </g>
        ))}

        {/* Noon markers */}
        {noonMarkers.map((nm, i) => (
          <g key={`noon-${i}`}>
            <line x1={nm.x} y1={padTop} x2={nm.x} y2={padTop + plotH} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="2,4" />
            <text x={nm.x} y={padTop - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">12:00</text>
          </g>
        ))}

        {/* Tide area fill */}
        <path d={areaD} fill="url(#tideFill)" />

        {/* Tide line */}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />

        {/* High/low markers on chart */}
        {events.map((ev, i) => {
          const ex = xOf(ev.time);
          const ey = yOf(ev.height);
          if (ex < padLeft || ex > chartW - padRight) return null;
          return (
            <g key={i}>
              <circle cx={ex} cy={ey} r="3" fill={ev.type === 'high' ? '#16a34a' : '#dc2626'} />
            </g>
          );
        })}

        {/* "Now" marker */}
        {nowInRange && (
          <g>
            <line x1={nowX} y1={padTop} x2={nowX} y2={padTop + plotH} stroke="#0d9488" strokeWidth="1.5" strokeDasharray="4,3" />
            <circle cx={nowX} cy={nowY} r="5" fill="#0d9488" stroke="white" strokeWidth="2" />
            <text x={nowX} y={padTop - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#0d9488">NOW</text>
          </g>
        )}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={padTop} x2={tooltip.x} y2={padTop + plotH} stroke="#374151" strokeWidth="1" opacity="0.2" />
            <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#3b82f6" stroke="white" strokeWidth="2" />
            <rect x={Math.min(Math.max(tooltip.x - 65, 5), chartW - 135)} y={Math.max(tooltip.y - 52, 2)} width="130" height="40" rx="6" fill="#1f2937" opacity="0.92" />
            <text x={Math.min(Math.max(tooltip.x, 70), chartW - 70)} y={Math.max(tooltip.y - 36, 18)} textAnchor="middle" fontSize="10" fill="#d1d5db">
              {tooltip.time.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' })}{' '}
              {fmtTime(tooltip.time)}
            </text>
            <text x={Math.min(Math.max(tooltip.x, 70), chartW - 70)} y={Math.max(tooltip.y - 20, 34)} textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
              {tooltip.height.toFixed(2)} m
            </text>
          </g>
        )}

      </svg>

      <div className="flex items-center justify-center gap-6 py-3 text-xs text-gray-400 border-t border-gray-100">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Tide height (m)</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" /> High tide</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> Low tide</span>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

interface TidesClientProps {
  place?: Place | null;
}

export default function TidesClient({ place }: TidesClientProps = {}) {
  const [marine, setMarine] = useState<MarineData | null>(null);
  const [marineLoading, setMarineLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const moonPhase = getMoonPhase(now);
  const moonIllum = getMoonIllumination(moonPhase);
  const lat = place?.centroid_lat != null ? Number(place.centroid_lat) : -3.354;
  const lng = place?.centroid_lng != null ? Number(place.centroid_lng) : 40.024;
  const placeName = place?.name ?? 'Watamu';

  // Generate 7-day tide prediction — matches the 7-day weather forecast
  // so the columns in both cards cover the same days and line up visually.
  const FORECAST_DAYS = 7;
  const tideStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const tideCurve = useMemo(() => generateTideCurve(tideStart, FORECAST_DAYS, 10), [tideStart]);
  const tideEvents = useMemo(() => findTideEvents(tideCurve), [tideCurve]);

  // Group events by day
  const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const eventsByDay = useMemo(() => {
    const map: Record<string, { label: string; events: TideEvent[]; date: Date }> = {};
    tideEvents.forEach(ev => {
      const dk = dayKey(ev.time);
      if (!map[dk]) {
        const d = new Date(ev.time);
        d.setHours(0, 0, 0, 0);
        map[dk] = { label: fmtDayLabel(d, today), events: [], date: d };
      }
      map[dk].events.push(ev);
    });
    return Object.values(map).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [tideEvents, today]);

  // Current tide state
  const currentHeight = getTideHeight(now);
  const isRising = useMemo(() => {
    const later = new Date(now.getTime() + 600000); // 10 min ahead
    return getTideHeight(later) > currentHeight;
  }, [now, currentHeight]);

  // Next high/low
  const nextEvent = useMemo(() => {
    return tideEvents.find(ev => ev.time.getTime() > now.getTime()) || null;
  }, [tideEvents, now]);

  // Fetch wave data
  useEffect(() => {
    fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&daily=wave_height_max,wave_direction_dominant,wave_period_max&current=wave_height,wave_direction,wave_period&timezone=Africa/Nairobi&forecast_days=7`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setMarine(d); setMarineLoading(false); })
      .catch(() => setMarineLoading(false));
  }, [lat, lng]);

  // Fetch weather data
  useEffect(() => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max&timezone=Africa/Nairobi&forecast_days=7`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setWeather(d); setWeatherLoading(false); })
      .catch(() => setWeatherLoading(false));
  }, [lat, lng]);

  // Sunrise / sunset for the Kenya coast (roughly constant near equator)
  const sunrise = '06:18';
  const sunset = '18:19';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-teal-700 via-cyan-700 to-blue-800 py-16 sm:py-20 px-4">
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Tides &amp; Weather for {placeName === 'Kwetu' ? 'the Kenyan coast' : placeName}
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Live weather, {FORECAST_DAYS}-day tide forecast, 7-day outlook, and sea conditions
            for the {placeName === 'Kwetu' ? 'Kenyan coast' : `${placeName} coast`}.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-10">

        {/* ── Current Weather ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Current Weather</h2>
            <span className="text-xs text-gray-400">{placeName} &middot; updated live</span>
          </div>

          {weatherLoading ? (
            <div className="p-6 animate-pulse grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : weather ? (() => {
            const w = weather.current;
            const cond = describeWeatherCode(w.weather_code, w.is_day === 1);
            const uvInfo = getUvLabel(w.uv_index ?? 0);
            const windKmh = w.wind_speed_10m;
            return (
              <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Hero condition */}
                <div className="md:col-span-5 flex items-center gap-5">
                  <div className="text-7xl leading-none" aria-hidden>{cond.icon}</div>
                  <div>
                    <p className="text-5xl font-bold text-gray-900">
                      {Math.round(w.temperature_2m)}<span className="text-2xl align-top ml-0.5 text-gray-500">&deg;C</span>
                    </p>
                    <p className="text-base font-medium text-gray-700 mt-1">{cond.label}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Feels like {Math.round(w.apparent_temperature)}&deg;C
                    </p>
                  </div>
                </div>

                {/* Details grid */}
                <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Wind</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {Math.round(windKmh)} <span className="text-sm font-normal text-gray-500">km/h</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {getDirectionLabel(w.wind_direction_10m)} &middot; {getWindDescription(windKmh)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Gusts</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {Math.round(w.wind_gusts_10m)} <span className="text-sm font-normal text-gray-500">km/h</span>
                    </p>
                    <p className="text-xs text-gray-500">Peak gust</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Humidity</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{Math.round(w.relative_humidity_2m)}%</p>
                    <p className="text-xs text-gray-500">Relative</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Cloud cover</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{Math.round(w.cloud_cover)}%</p>
                    <p className="text-xs text-gray-500">
                      {w.cloud_cover < 25 ? 'Mostly clear' : w.cloud_cover < 60 ? 'Partly cloudy' : 'Overcast'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Rain (now)</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{w.precipitation.toFixed(1)} <span className="text-sm font-normal text-gray-500">mm</span></p>
                    <p className="text-xs text-gray-500">Past hour</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">UV index</p>
                    <p className={`text-lg font-semibold mt-1 ${uvInfo.color}`}>
                      {(w.uv_index ?? 0).toFixed(1)} <span className="text-xs font-medium">{uvInfo.label}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {(w.uv_index ?? 0) >= 6 ? 'Wear sunscreen' : 'Low risk'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="p-6 text-sm text-gray-500">
              Weather data is temporarily unavailable. Please refresh the page in a moment.
            </div>
          )}
        </section>

        {/* ── Current Snapshot Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Current Tide */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Current Tide</p>
            <p className="text-4xl font-bold text-gray-900">{currentHeight.toFixed(2)}<span className="text-lg ml-1 font-normal text-gray-400">m</span></p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-sm font-semibold ${isRising ? 'text-green-600' : 'text-red-500'}`}>
                {isRising ? '▲ Rising' : '▼ Falling'}
              </span>
              {nextEvent && (
                <span className="text-sm text-gray-500">
                  — next {nextEvent.type === 'high' ? 'high' : 'low'} at {fmtTime(nextEvent.time)} ({nextEvent.height.toFixed(2)}m)
                </span>
              )}
            </div>
          </div>

          {/* Moon Phase */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-6 text-white text-center flex flex-col justify-center">
            <div className="text-5xl mb-2">{getMoonEmoji(moonPhase)}</div>
            <p className="text-lg font-bold">{getMoonPhaseName(moonPhase)}</p>
            <p className="text-xs text-indigo-300 mt-1">Illumination: {moonIllum}%</p>
            <p className="text-xs text-indigo-300 mt-1">
              {moonPhase < 0.15 || moonPhase > 0.85 || (moonPhase > 0.4 && moonPhase < 0.6)
                ? 'Spring tides — larger tidal range'
                : 'Neap tides — smaller tidal range'}
            </p>
          </div>

          {/* Sun & Wave */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Daylight</p>
              <p className="text-sm text-gray-700">Sunrise <span className="font-semibold">{sunrise}</span> &nbsp;·&nbsp; Sunset <span className="font-semibold">{sunset}</span></p>
            </div>
            {marine && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Wave Height</p>
                <p className="text-sm text-gray-700">
                  <span className="text-2xl font-bold text-gray-900">{marine.current.wave_height.toFixed(1)}m</span>{' '}
                  <span className={`font-medium ${getWaveCondition(marine.current.wave_height).color}`}>
                    {getWaveCondition(marine.current.wave_height).label}
                  </span>
                  {' · '}
                  {getDirectionLabel(marine.current.wave_direction)} {Math.round(marine.current.wave_direction)}°
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── 7-Day Weather Forecast ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">7-Day Forecast</h2>
            <span className="text-xs text-gray-400">High/low, rain &amp; wind</span>
          </div>

          {weatherLoading ? (
            <div className="p-6 grid grid-cols-2 md:grid-cols-7 gap-3 animate-pulse">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : weather ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 divide-x divide-y sm:divide-y-0 divide-gray-100">
              {weather.daily.time.map((iso, i) => {
                const d = new Date(iso + 'T00:00:00');
                const dayMoon = getMoonPhase(d);
                const cond = describeWeatherCode(weather.daily.weather_code[i], true);
                const tmax = Math.round(weather.daily.temperature_2m_max[i]);
                const tmin = Math.round(weather.daily.temperature_2m_min[i]);
                const pop = Math.round(weather.daily.precipitation_probability_max[i] ?? 0);
                const rain = weather.daily.precipitation_sum[i] ?? 0;
                const wind = Math.round(weather.daily.wind_speed_10m_max[i]);
                const windDir = weather.daily.wind_direction_10m_dominant[i];
                const label = i === 0
                  ? 'Today'
                  : i === 1
                  ? 'Tomorrow'
                  : d.toLocaleDateString('en-US', { weekday: 'short' });
                return (
                  <div key={iso} className="p-4 flex flex-col items-center text-center">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </p>
                    <div className="text-3xl my-2" aria-hidden>{cond.icon}</div>
                    <p className="text-[11px] text-gray-500 leading-tight h-8 flex items-center">{cond.label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {tmax}&deg; <span className="text-gray-400 font-normal">/ {tmin}&deg;</span>
                    </p>
                    <div className="flex items-center gap-1 text-xs text-blue-600 mt-1.5">
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3c-3 4-5 7-5 10a5 5 0 0 0 10 0c0-3-2-6-5-10z" /></svg>
                      {pop}%
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{rain.toFixed(1)} mm</p>
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-1.5">
                      <span>{'\u2248'} {wind} km/h</span>
                      <span>&middot;</span>
                      <span>{getDirectionLabel(windDir)}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2" aria-label="moon phase">
                      {getMoonEmoji(dayMoon)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500">7-day forecast is temporarily unavailable.</div>
          )}
        </section>

        {/* ── Tide Chart ──
            Structured to mirror the 7-Day Forecast card above so the day
            columns in both line up edge-to-edge inside max-w-7xl. */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Tide Times Chart for {placeName}</h2>
            <span className="text-xs text-gray-400">Hover for exact height &middot; metres above chart datum</span>
          </div>
          <TideChart points={tideCurve} events={tideEvents} days={FORECAST_DAYS} />
        </section>

        {/* ── Tide Table (day-by-day) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900">Tide Table</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {eventsByDay.slice(0, 7).map(day => {
              const dayMoon = getMoonPhase(day.date);
              return (
                <div key={day.label} className="px-6 py-5 flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Day label + moon */}
                  <div className="sm:w-52 shrink-0">
                    <p className="font-semibold text-gray-900">{day.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                      {getMoonEmoji(dayMoon)} {getMoonPhaseName(dayMoon)}
                    </p>
                  </div>
                  {/* Events */}
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    {day.events.map((ev, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-sm font-mono font-semibold text-gray-800 w-12">{fmtTime(ev.time)}</span>
                        {ev.type === 'high' ? (
                          <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3l7 14H3z"/></svg>
                            High tide
                          </span>
                        ) : (
                          <span className="text-blue-500 text-xs font-bold flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 17l-7-14h14z"/></svg>
                            Low tide
                          </span>
                        )}
                        <span className="text-sm font-semibold text-gray-900">{ev.height.toFixed(2)} m</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {eventsByDay.length > 7 && (
            <div className="px-6 py-3 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">Full {FORECAST_DAYS}-day forecast shown in the chart above</p>
            </div>
          )}
        </div>

        {/* ── Reef Crossing Advisory ── */}
        {marine && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Reef Crossing Advisory</h2>
            <div className="flex items-start gap-3">
              {marine.current.wave_height < 1.0 ? (
                <>
                  <div className="w-3 h-3 mt-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <p className="text-gray-700 text-sm">
                    Conditions are <span className="font-semibold text-emerald-600">favourable</span> for boats
                    crossing the reef. Expect a smooth departure from Watamu Creek.
                  </p>
                </>
              ) : marine.current.wave_height < 1.5 ? (
                <>
                  <div className="w-3 h-3 mt-1.5 rounded-full bg-yellow-400 shrink-0" />
                  <p className="text-gray-700 text-sm">
                    <span className="font-semibold text-yellow-600">Moderate</span> conditions at the reef
                    crossing. Some spray may be expected. Follow your captain&apos;s guidance.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 mt-1.5 rounded-full bg-red-400 shrink-0" />
                  <p className="text-gray-700 text-sm">
                    Conditions are <span className="font-semibold text-red-600">challenging</span> for reef
                    crossings. Your charter captain will advise on safe departure.
                  </p>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Fishing boats must cross the fringing reef through a narrow channel. Wave height and tide level
              determine comfort. Departures are usually timed with the rising tide.
            </p>
          </div>
        )}

        {/* ── KWS Marine Park Fees ── */}
        <div className="bg-gradient-to-r from-blue-600 to-teal-600 rounded-2xl p-6 sm:p-8 text-white">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-bold mb-1">KWS Marine Park Entry Fees</h3>
              <p className="text-white/85 text-sm leading-relaxed">
                Visiting Watamu Marine National Park? Pay online in advance to skip the queue.
                Non-resident adults KES 1,770 (~$13), resident adults KES 300.
              </p>
            </div>
            <a
              href="https://kwspay.ecitizen.go.ke/single-park-entry/watamu-marine-park/guests"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
            >
              Pay KWS Fees Online
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </div>

        {/* ── Understanding Tides ── */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Understanding Tides {placeName === 'Kwetu' ? 'on the Kenyan Coast' : `in ${placeName}`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Tidal Patterns</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                The Kenya coast experiences semi-diurnal tides — two high tides and two low tides each day.
                The tidal range varies from about 1.5 m during neap tides to over 3.5 m during spring
                tides (around new and full moons). Low tide exposes coral reef platforms and creates
                natural rock pools perfect for exploring.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Impact on Fishing</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Deep-sea boats depart from Watamu Creek and navigate through a channel in the fringing
                reef. Departures are timed with the rising tide for a safe crossing. Your charter
                captain will confirm the departure time based on the tide tables.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Best Time for Snorkelling</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Snorkelling in the Marine National Park is best at high tide when the water is deepest
                over the reefs. Visibility is excellent between October and March. Glass-bottom boat
                trips also operate best at high tide.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Spring vs Neap Tides</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Spring tides (larger range) occur around full and new moons. Neap tides (smaller range)
                occur around quarter moons. The moon phase above helps you anticipate tidal conditions
                during your stay.
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-6">
            Tide predictions are based on harmonic analysis of principal tidal constituents for the
            Kenya coast (Kilindini reference port). Times are in East Africa Time (UTC+3). Actual
            conditions may vary due to weather, atmospheric pressure, and wind.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center py-6">
          <p className="text-gray-600 mb-4">Planning a fishing trip or marine park visit?</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/boats" className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors">
              View Fishing Charters
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
            </Link>
            <Link href="/activities" className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-3 rounded-lg border border-gray-200 transition-colors">
              All Activities
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

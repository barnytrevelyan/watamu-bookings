'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

interface MarineData {
  current: {
    wave_height: number;
    wave_direction: number;
    wave_period: number;
  };
  daily: {
    time: string[];
    wave_height_max: number[];
    wave_direction_dominant: number[];
    wave_period_max: number[];
  };
  hourly: {
    time: string[];
    wave_height: number[];
    wave_direction: number[];
    wave_period: number[];
  };
}

// Calculate moon phase (0 = new moon, 0.5 = full moon)
function getMoonPhase(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let c = 0;
  let e = 0;
  let jd = 0;

  if (month < 3) {
    c = year - 1;
    e = month + 12;
  } else {
    c = year;
    e = month;
  }

  jd =
    Math.floor(365.25 * (c + 4716)) +
    Math.floor(30.6001 * (e + 1)) +
    day -
    1524.5;
  jd -= Math.floor(c / 100) - Math.floor(c / 400) - 2;

  let b = jd - 2451550.1;
  b = (b / 29.530588853) % 1;
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

function getDirectionLabel(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return dirs[index];
}

function getWaveCondition(height: number): { label: string; color: string; bg: string } {
  if (height < 0.5) return { label: 'Calm', color: 'text-emerald-600', bg: 'bg-emerald-50' };
  if (height < 1.0) return { label: 'Slight', color: 'text-teal-600', bg: 'bg-teal-50' };
  if (height < 1.5) return { label: 'Moderate', color: 'text-yellow-600', bg: 'bg-yellow-50' };
  if (height < 2.5) return { label: 'Rough', color: 'text-orange-600', bg: 'bg-orange-50' };
  return { label: 'Very Rough', color: 'text-red-600', bg: 'bg-red-50' };
}

function getDayName(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getShortDay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// SVG wave chart component
function WaveChart({ hourly, daily }: { hourly: MarineData['hourly']; daily: MarineData['daily'] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; time: string; height: number } | null>(null);

  const chartW = 900;
  const chartH = 280;
  const padTop = 30;
  const padBottom = 50;
  const padLeft = 50;
  const padRight = 20;

  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const heights = hourly.wave_height;
  const maxH = Math.max(...heights, 2.0);
  const yMax = Math.ceil(maxH * 2) / 2; // round up to nearest 0.5

  // Build the path
  const points = heights.map((h, i) => {
    const x = padLeft + (i / (heights.length - 1)) * plotW;
    const y = padTop + plotH - (h / yMax) * plotH;
    return { x, y, h, time: hourly.time[i] };
  });

  // Smooth line path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    pathD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  // Area fill path
  const areaD = pathD + ` L ${points[points.length - 1].x} ${padTop + plotH} L ${points[0].x} ${padTop + plotH} Z`;

  // Y-axis gridlines
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += 0.5) {
    yTicks.push(v);
  }

  // Day separator lines (every 24 points)
  const daySeparators: { x: number; label: string }[] = [];
  const hoursPerDay = 24;
  for (let d = 0; d < daily.time.length; d++) {
    const i = d * hoursPerDay;
    if (i < heights.length) {
      const x = padLeft + (i / (heights.length - 1)) * plotW;
      daySeparators.push({ x, label: getShortDay(daily.time[d]) });
    }
  }

  // Now marker
  const nowHour = new Date().getHours();
  const nowIdx = Math.min(nowHour, heights.length - 1);
  const nowPoint = points[nowIdx];

  // Color zones
  const zoneColors = [
    { max: 0.5, color: '#10b981' },
    { max: 1.0, color: '#14b8a6' },
    { max: 1.5, color: '#eab308' },
    { max: 2.5, color: '#f97316' },
    { max: Infinity, color: '#ef4444' },
  ];

  function getColor(h: number): string {
    for (const z of zoneColors) {
      if (h < z.max) return z.color;
    }
    return '#ef4444';
  }

  // Gradient stops based on actual data
  const gradientStops = points.filter((_, i) => i % 6 === 0 || i === points.length - 1).map((p, _i) => ({
    offset: `${((p.x - padLeft) / plotW) * 100}%`,
    color: getColor(p.h),
  }));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = chartW / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;

    // Find closest point
    let closest = points[0];
    let minDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    }

    if (minDist < 20) {
      const timeStr = new Date(closest.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dateStr = new Date(closest.time).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      setTooltip({ x: closest.x, y: closest.y, time: `${dateStr} ${timeStr}`, height: closest.h });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="w-full h-auto min-w-[600px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {gradientStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity="0.25" />
            ))}
          </linearGradient>
          <linearGradient id="waveLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {gradientStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>

        {/* Y-axis gridlines */}
        {yTicks.map((v) => {
          const y = padTop + plotH - (v / yMax) * plotH;
          return (
            <g key={v}>
              <line x1={padLeft} y1={y} x2={chartW - padRight} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray={v === 0 ? '' : '4,4'} />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className="text-[11px]" fill="#9ca3af">{v.toFixed(1)}m</text>
            </g>
          );
        })}

        {/* Day separators */}
        {daySeparators.map((sep, i) => (
          <g key={i}>
            <line x1={sep.x} y1={padTop} x2={sep.x} y2={padTop + plotH} stroke="#d1d5db" strokeWidth="1" strokeDasharray="2,4" />
            <text x={sep.x + (plotW / daily.time.length) / 2} y={chartH - 10} textAnchor="middle" className="text-[12px] font-medium" fill="#6b7280">{sep.label}</text>
          </g>
        ))}

        {/* Wave area fill */}
        <path d={areaD} fill="url(#waveGrad)" />

        {/* Wave line */}
        <path d={pathD} fill="none" stroke="url(#waveLineGrad)" strokeWidth="2.5" strokeLinecap="round" />

        {/* "Now" indicator */}
        {nowPoint && (
          <g>
            <line x1={nowPoint.x} y1={padTop} x2={nowPoint.x} y2={padTop + plotH} stroke="#0d9488" strokeWidth="1.5" strokeDasharray="4,3" />
            <circle cx={nowPoint.x} cy={nowPoint.y} r="5" fill="#0d9488" stroke="white" strokeWidth="2" />
            <text x={nowPoint.x} y={padTop - 8} textAnchor="middle" className="text-[10px] font-bold" fill="#0d9488">NOW</text>
          </g>
        )}

        {/* Tooltip hover */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={padTop} x2={tooltip.x} y2={padTop + plotH} stroke="#374151" strokeWidth="1" opacity="0.3" />
            <circle cx={tooltip.x} cy={tooltip.y} r="4" fill={getColor(tooltip.height)} stroke="white" strokeWidth="2" />
            <rect
              x={tooltip.x - 70}
              y={Math.max(tooltip.y - 50, 5)}
              width="140"
              height="38"
              rx="6"
              fill="#1f2937"
              opacity="0.92"
            />
            <text x={tooltip.x} y={Math.max(tooltip.y - 35, 20)} textAnchor="middle" className="text-[10px]" fill="#d1d5db">{tooltip.time}</text>
            <text x={tooltip.x} y={Math.max(tooltip.y - 20, 35)} textAnchor="middle" className="text-[13px] font-bold" fill="white">{tooltip.height.toFixed(2)}m</text>
          </g>
        )}

        {/* Y-axis label */}
        <text x={14} y={padTop + plotH / 2} textAnchor="middle" transform={`rotate(-90, 14, ${padTop + plotH / 2})`} className="text-[11px]" fill="#9ca3af">Wave height (m)</text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Calm &lt;0.5m</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-teal-500 inline-block" /> Slight &lt;1.0m</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Moderate &lt;1.5m</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Rough &lt;2.5m</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Very Rough 2.5m+</span>
      </div>
    </div>
  );
}

export default function TidesPage() {
  const [marine, setMarine] = useState<MarineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const moonPhase = getMoonPhase(new Date());

  useEffect(() => {
    const url =
      'https://marine-api.open-meteo.com/v1/marine?latitude=-3.354&longitude=40.024&daily=wave_height_max,wave_direction_dominant,wave_period_max&hourly=wave_height,wave_direction,wave_period&current=wave_height,wave_direction,wave_period&timezone=Africa/Nairobi&forecast_days=7';

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Marine fetch failed');
        return res.json();
      })
      .then((data) => {
        setMarine(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-teal-700 via-cyan-700 to-blue-800 py-20 px-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTQ0MCIgaGVpZ2h0PSIxMjAiIHZpZXdCb3g9IjAgMCAxNDQwIDEyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMCA2MEw0OCA1NEM5NiA0OCAxOTIgMzYgMjg4IDM2QzM4NCAzNiA0ODAgNDggNTc2IDU0QzY3MiA2MCA3NjggNjAgODY0IDU0Qzk2MCA0OCAxMDU2IDM2IDExNTIgMzBDMTI0OCAyNCAxMzQ0IDI0IDEzOTIgMjRMMTQ0MCAyNFYxMjBIMTM5MkMxMzQ0IDEyMCAxMjQ4IDEyMCAxMTUyIDEyMEMxMDU2IDEyMCA5NjAgMTIwIDg2NCAxMjBDNzY4IDEyMCA2NzIgMTIwIDU3NiAxMjBDNDgwIDEyMCAzODQgMTIwIDI4OCAxMjBDMTkyIDEyMCA5NiAxMjAgNDggMTIwSDBWNjBaIiBmaWxsPSJ3aGl0ZSIgZmlsbC1vcGFjaXR5PSIwLjA1Ii8+PC9zdmc+')] bg-bottom bg-repeat-x opacity-30" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Tides & Marine Conditions
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Live wave and marine forecast for Watamu, Kenya. Essential information
            for fishing charters, snorkelling trips, and water activities.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-12 space-y-10">
        {/* Moon Phase + Current Conditions Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Moon Phase */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-8 text-white text-center flex flex-col justify-center">
            <p className="text-sm font-medium text-indigo-300 mb-3 uppercase tracking-wide">
              Moon Phase
            </p>
            <div className="text-7xl mb-3">{getMoonEmoji(moonPhase)}</div>
            <p className="text-xl font-bold">{getMoonPhaseName(moonPhase)}</p>
            <p className="text-sm text-indigo-300 mt-2">
              {moonPhase < 0.25 || moonPhase > 0.75
                ? 'Spring tides likely — larger tidal range'
                : 'Neap tides likely — smaller tidal range'}
            </p>
          </div>

          {/* Current Conditions */}
          {loading ? (
            <>
              <div className="bg-white rounded-2xl p-8 animate-pulse h-52" />
              <div className="bg-white rounded-2xl p-8 animate-pulse h-52" />
            </>
          ) : error ? (
            <div className="col-span-2 bg-white rounded-2xl p-8 text-center">
              <p className="text-gray-500">
                Unable to load marine data. Please try again later.
              </p>
            </div>
          ) : marine ? (
            <>
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <p className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">
                  Current Conditions
                </p>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm text-gray-500">Wave Height</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {marine.current.wave_height.toFixed(1)}m
                    </p>
                    <p
                      className={`text-sm font-medium ${
                        getWaveCondition(marine.current.wave_height).color
                      }`}
                    >
                      {getWaveCondition(marine.current.wave_height).label}
                    </p>
                  </div>
                  <div className="flex gap-8">
                    <div>
                      <p className="text-sm text-gray-500">Direction</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {getDirectionLabel(marine.current.wave_direction)}{' '}
                        ({Math.round(marine.current.wave_direction)}&deg;)
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Period</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {marine.current.wave_period.toFixed(1)}s
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <p className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">
                  Reef Crossing Advisory
                </p>
                <div className="space-y-3">
                  {marine.current.wave_height < 1.0 ? (
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 mt-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <p className="text-gray-700">
                        Conditions are <span className="font-semibold text-emerald-600">favourable</span> for
                        boats crossing the reef. Expect a smooth departure from Watamu creek.
                      </p>
                    </div>
                  ) : marine.current.wave_height < 1.5 ? (
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 mt-1.5 rounded-full bg-yellow-400 shrink-0" />
                      <p className="text-gray-700">
                        <span className="font-semibold text-yellow-600">Moderate</span> conditions
                        at the reef crossing. Some spray may be expected. Follow your captain&apos;s guidance.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 mt-1.5 rounded-full bg-red-400 shrink-0" />
                      <p className="text-gray-700">
                        Conditions are <span className="font-semibold text-red-600">challenging</span> for
                        reef crossings. Your charter captain will advise on safe departure.
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-gray-500 mt-2">
                    Fishing boats in Watamu must cross the fringing reef through a narrow channel
                    when departing for deep-sea excursions. Wave height and tide level
                    determine how comfortable the crossing will be.
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Wave Height Chart */}
        {marine?.hourly && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              7-Day Wave Height Forecast
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Hourly wave height for the Watamu coast. Hover over the chart for details.
            </p>
            <WaveChart hourly={marine.hourly} daily={marine.daily} />
          </div>
        )}

        {/* 7-Day Daily Summary */}
        {marine && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Daily Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {marine.daily.time.map((day, i) => {
                const cond = getWaveCondition(marine.daily.wave_height_max[i]);
                const dayMoon = getMoonPhase(new Date(day + 'T12:00:00'));
                return (
                  <div
                    key={day}
                    className={`rounded-2xl p-5 shadow-sm border border-gray-100 text-center ${i === 0 ? 'bg-teal-50 border-teal-200' : 'bg-white'}`}
                  >
                    <p className={`text-sm font-medium mb-3 ${i === 0 ? 'text-teal-700' : 'text-gray-500'}`}>
                      {getDayName(day, i)}
                    </p>
                    <div className="text-2xl mb-1">{getMoonEmoji(dayMoon)}</div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {marine.daily.wave_height_max[i].toFixed(1)}m
                    </p>
                    <p className={`text-sm font-medium ${cond.color} mt-1`}>
                      {cond.label}
                    </p>
                    <div className="mt-3 text-xs text-gray-500 space-y-1">
                      <p>
                        Dir: {getDirectionLabel(marine.daily.wave_direction_dominant[i])}
                      </p>
                      <p>
                        Period: {marine.daily.wave_period_max[i].toFixed(1)}s
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* KWS Marine Park Fees */}
        <div className="bg-gradient-to-r from-blue-600 to-teal-600 rounded-2xl p-8 text-white">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              </div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-bold mb-2">KWS Marine Park Entry Fees</h3>
              <p className="text-white/85 text-sm leading-relaxed">
                Visiting Watamu Marine National Park? Entry fees are required by Kenya Wildlife Service (KWS).
                You can pay online in advance to skip the queue at the gate. Non-resident adults KES 1,770 (~$13),
                resident adults KES 300. Children pay reduced rates. Fees also apply for snorkelling and glass-bottom
                boat trips within the marine park.
              </p>
            </div>
            <div className="flex-shrink-0">
              <a
                href="https://kws.go.ke/parks/watamu-marine-national-park"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Pay KWS Fees Online
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Informational Section */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Understanding Tides in Watamu
          </h2>
          <div className="prose prose-gray max-w-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Tidal Patterns
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Watamu experiences semi-diurnal tides — two high tides and two
                  low tides each day. The tidal range varies from about 1.5m
                  during neap tides to over 3.5m during spring tides (around new
                  and full moons). Low tide exposes the coral reef platforms and
                  creates natural rock pools that are perfect for exploring.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Impact on Fishing Charters
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Deep-sea fishing boats depart from Watamu Creek and must navigate
                  through a channel in the fringing reef. Departures are timed with
                  the rising tide (usually early morning) for a safe crossing. Your
                  charter captain will confirm the departure time based on the
                  tide tables. During very low spring tides, departure times may
                  shift.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Best Time for Snorkelling
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Snorkelling in the Watamu Marine National Park is best at high
                  tide when the water is deepest over the reefs. Visibility is
                  generally excellent between October and March. Glass-bottom boat
                  trips to the marine park also operate best at high tide.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Moon & Tidal Range
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Spring tides (larger range) occur around full and new moons. Neap
                  tides (smaller range) occur around quarter moons. The moon phase
                  indicator above helps you anticipate the tidal conditions during
                  your stay. Spring tides can affect beach swimming as more of the
                  reef is exposed at low tide.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">
            Planning a fishing trip? Check the conditions and book your charter.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/boats"
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              View Fishing Charters
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/activities"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-3 rounded-lg border border-gray-200 transition-colors"
            >
              All Activities
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
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
}

// Calculate moon phase (0 = new moon, 0.5 = full moon)
function getMoonPhase(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let c = 0;
  let e = 0;
  let jd = 0;
  let b = 0;

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

  b = jd - 2451550.1;
  b = (b / 29.530588853) % 1;
  if (b < 0) b += 1;
  return b;
}

function getMoonEmoji(phase: number): string {
  if (phase < 0.0625) return '\uD83C\uDF11'; // New
  if (phase < 0.1875) return '\uD83C\uDF12'; // Waxing Crescent
  if (phase < 0.3125) return '\uD83C\uDF13'; // First Quarter
  if (phase < 0.4375) return '\uD83C\uDF14'; // Waxing Gibbous
  if (phase < 0.5625) return '\uD83C\uDF15'; // Full
  if (phase < 0.6875) return '\uD83C\uDF16'; // Waning Gibbous
  if (phase < 0.8125) return '\uD83C\uDF17'; // Last Quarter
  if (phase < 0.9375) return '\uD83C\uDF18'; // Waning Crescent
  return '\uD83C\uDF11'; // New
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

function getWaveCondition(height: number): { label: string; color: string } {
  if (height < 0.5) return { label: 'Calm', color: 'text-emerald-400' };
  if (height < 1.0) return { label: 'Slight', color: 'text-teal-300' };
  if (height < 1.5) return { label: 'Moderate', color: 'text-yellow-300' };
  if (height < 2.5) return { label: 'Rough', color: 'text-orange-400' };
  return { label: 'Very Rough', color: 'text-red-400' };
}

function getDayName(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function TidesPage() {
  const [marine, setMarine] = useState<MarineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const moonPhase = getMoonPhase(new Date());

  useEffect(() => {
    const url =
      'https://marine-api.open-meteo.com/v1/marine?latitude=-3.354&longitude=40.024&daily=wave_height_max,wave_direction_dominant,wave_period_max&current=wave_height,wave_direction,wave_period&timezone=Africa/Nairobi&forecast_days=7';

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
                        at the reef crossing. Some spray may be expected. Follow your captain's guidance.
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

        {/* 7-Day Forecast */}
        {marine && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              7-Day Marine Forecast
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
              {marine.daily.time.map((day, i) => {
                const cond = getWaveCondition(marine.daily.wave_height_max[i]);
                const dayMoon = getMoonPhase(
                  new Date(day + 'T12:00:00')
                );
                return (
                  <div
                    key={day}
                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center"
                  >
                    <p className="text-sm font-medium text-gray-500 mb-3">
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
          <Link
            href="/boats"
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            View Fishing Charters
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

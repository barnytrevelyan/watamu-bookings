'use client';

import { useEffect, useState } from 'react';

interface WeatherData {
  current_weather: {
    temperature: number;
    weathercode: number;
    windspeed: number;
    winddirection: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weathercode: number[];
  };
}

// Monthly average sea temperatures for Watamu / Indian Ocean (Celsius)
const SEA_TEMPS: Record<number, number> = {
  1: 28, 2: 29, 3: 29, 4: 29, 5: 28, 6: 27,
  7: 25, 8: 25, 9: 25, 10: 26, 11: 27, 12: 28,
};

function getWeatherEmoji(code: number): string {
  if (code === 0) return '\u2600\uFE0F';        // Clear sky
  if (code <= 3) return '\u26C5';                // Partly cloudy
  if (code <= 48) return '\u2601\uFE0F';         // Foggy / overcast
  if (code <= 57) return '\uD83C\uDF27\uFE0F';   // Drizzle
  if (code <= 67) return '\uD83C\uDF27\uFE0F';   // Rain
  if (code <= 77) return '\u2744\uFE0F';          // Snow (unlikely)
  if (code <= 82) return '\uD83C\uDF26\uFE0F';   // Rain showers
  if (code <= 86) return '\u2744\uFE0F';          // Snow showers
  if (code <= 99) return '\u26C8\uFE0F';          // Thunderstorm
  return '\u2600\uFE0F';
}

function getWeatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Overcast';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow Showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Clear';
}

function getDayName(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const seaTemp = SEA_TEMPS[new Date().getMonth() + 1] || 27;

  useEffect(() => {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=-3.354&longitude=40.024&daily=temperature_2m_max,temperature_2m_min,weathercode&current_weather=true&timezone=Africa/Nairobi&forecast_days=5';

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Weather fetch failed');
        return res.json();
      })
      .then((data) => {
        setWeather(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (error) {
    return null; // Silently fail — weather is supplementary
  }

  return (
    <section className="py-16 lg:py-24 px-4 bg-gradient-to-br from-teal-600 to-cyan-700">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white">Watamu Weather</h2>
          <p className="mt-2 text-white/80 max-w-xl mx-auto">
            Plan your trip with live weather conditions on the Kenyan coast
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 animate-pulse h-40"
              />
            ))}
          </div>
        ) : weather ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Current weather card */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1 bg-white/20 backdrop-blur-sm rounded-2xl p-6 text-white text-center flex flex-col justify-center">
              <p className="text-sm font-medium text-white/80 mb-1">Right Now</p>
              <div className="text-5xl mb-2">
                {getWeatherEmoji(weather.current_weather.weathercode)}
              </div>
              <p className="text-4xl font-bold">
                {Math.round(weather.current_weather.temperature)}&deg;C
              </p>
              <p className="text-sm text-white/80 mt-1">
                {getWeatherLabel(weather.current_weather.weathercode)}
              </p>
              <p className="text-xs text-white/60 mt-1">
                Wind {Math.round(weather.current_weather.windspeed)} km/h
              </p>
            </div>

            {/* 5-day forecast */}
            {weather.daily.time.map((day, i) => (
              <div
                key={day}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-white text-center flex flex-col items-center justify-center"
              >
                <p className="text-sm font-medium text-white/80 mb-2">
                  {getDayName(day, i)}
                </p>
                <div className="text-3xl mb-2">
                  {getWeatherEmoji(weather.daily.weathercode[i])}
                </div>
                <p className="text-lg font-bold">
                  {Math.round(weather.daily.temperature_2m_max[i])}&deg;
                </p>
                <p className="text-sm text-white/60">
                  {Math.round(weather.daily.temperature_2m_min[i])}&deg;
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Sea temperature bar */}
        <div className="mt-6 bg-white/10 backdrop-blur-sm rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-center gap-4 text-white">
          <div className="flex items-center gap-3">
            <svg
              className="w-8 h-8 text-cyan-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 13.5h16.5m-16.5 0a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 3.75 4.5h16.5a2.25 2.25 0 0 1 2.25 2.25v4.5a2.25 2.25 0 0 1-2.25 2.25m-16.5 0v3.75A2.25 2.25 0 0 0 6 19.5h12a2.25 2.25 0 0 0 2.25-2.25V13.5"
              />
            </svg>
            <div>
              <p className="text-sm text-white/70">Indian Ocean Sea Temperature</p>
              <p className="text-2xl font-bold">{seaTemp}&deg;C</p>
            </div>
          </div>
          <div className="hidden sm:block w-px h-10 bg-white/20" />
          <p className="text-sm text-white/70 max-w-sm text-center sm:text-left">
            Warm tropical waters year-round — perfect for snorkelling, diving, and swimming.
            Water visibility is best from October to March.
          </p>
        </div>
      </div>
    </section>
  );
}

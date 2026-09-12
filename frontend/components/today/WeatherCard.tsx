import type { Weather } from "@/lib/types";
import { CloudRainIcon, DropIcon, SunIcon } from "@/components/ui/Icons";

/** "Mon", "Tue" — from an ISO date, without pulling in a date library. */
function weekday(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
}

export function WeatherCard({ weather }: { weather: Weather }) {
  const wet = /rain|drizzle|shower|thunder|snow/i.test(weather.conditions);
  const cloudy = /cloud|overcast|fog/i.test(weather.conditions);
  const showCloud = wet || cloudy || weather.rain_probability_pct >= 50;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#EAF2F6] to-[#F3F6EC] p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {weather.location}
          </p>
          <p className="mt-2 font-display text-5xl leading-none text-forest">
            {weather.temperature_f}°
          </p>
          <p className="mt-2 text-sm font-medium text-forest">{weather.conditions}</p>
        </div>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 text-forest shadow-card">
          {showCloud ? (
            <CloudRainIcon className="h-7 w-7" />
          ) : (
            <SunIcon className="h-7 w-7" />
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <DropIcon className="h-4 w-4 text-moss" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-faint">Rain chance</p>
            <p className="text-sm font-semibold text-forest">{weather.rain_probability_pct}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-moss" fill="none" aria-hidden="true">
            <path
              d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-faint">
              Wind · humidity
            </p>
            <p className="text-sm font-semibold text-forest">
              {weather.wind_mph} mph · {weather.humidity_pct}%
            </p>
          </div>
        </div>
      </div>

      <p className="border-t border-line bg-sage-tint px-4 py-3 text-xs text-forest">
        {weather.forecast_note}
      </p>

      {weather.days.length > 0 ? (
        <ul className="grid grid-cols-7 gap-px border-t border-line bg-line">
          {weather.days.map((day, index) => (
            <li key={day.date} className="bg-white px-1 py-2.5 text-center">
              <p className="text-[10px] font-medium uppercase text-ink-faint">
                {index === 0 ? "Now" : weekday(day.date)}
              </p>
              <p className="mt-1 font-display text-sm leading-none text-forest">{day.high_f}°</p>
              <p className="text-[10px] text-ink-faint">{day.low_f}°</p>
              <p
                className={
                  day.precip_chance_pct >= 50
                    ? "mt-1 text-[10px] font-semibold text-moss-dark"
                    : "mt-1 text-[10px] text-ink-faint"
                }
              >
                {day.precip_chance_pct}%
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="border-t border-line px-4 pb-3 pt-2 text-[10px] uppercase tracking-wide text-ink-faint">
        {weather.source === "fallback"
          ? "Placeholder forecast — couldn't reach the weather service"
          : "Live forecast · Open-Meteo"}
      </p>
    </section>
  );
}

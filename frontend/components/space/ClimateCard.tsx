"use client";

import type { Climate, ResolvedLocation } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { AlertIcon, DropIcon, SunIcon } from "@/components/ui/Icons";

/** Turn "04-16" into "Apr 16". */
function monthDay(value: string | null): string {
  if (!value) return "—";
  const [month, day] = value.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(month) - 1] ?? month} ${Number(day)}`;
}

/**
 * What we found out about the user's location.
 *
 * Real data from Open-Meteo, so it's worth showing plainly — the frost dates
 * are what actually decide which crops make the list.
 */
export function ClimateCard({
  location,
  climate,
  loading,
}: {
  location: ResolvedLocation | null;
  climate: Climate | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sage-deep border-t-forest" />
          Looking up your growing conditions…
        </div>
      </div>
    );
  }

  if (!location || !climate) {
    return (
      <div className="card-quiet p-5 text-sm text-ink-muted">
        <p className="font-medium text-forest">Growing conditions</p>
        <p className="mt-1 text-xs">
          Enter a city or ZIP and we&apos;ll pull the real frost dates and season length for that
          spot.
        </p>
      </div>
    );
  }

  if (!location.resolved) {
    return (
      <div className="flex items-start gap-3 rounded-card border border-[#F0DDBB] bg-[#FDF7EC] px-4 py-3 text-sm text-[#7A5418]">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">Couldn&apos;t find that place.</span> We&apos;re using
          generic temperate-climate assumptions instead. Try a nearby city or a postal code.
        </p>
      </div>
    );
  }

  const frostFree = climate.frost_free_days;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line/70 bg-sage-tint px-5 py-4">
        <div>
          <p className="eyebrow">Your growing conditions</p>
          <h3 className="mt-1 font-display text-lg text-forest">{location.label}</h3>
          <p className="text-[11px] text-ink-faint">
            {location.latitude.toFixed(2)}, {location.longitude.toFixed(2)} ·{" "}
            {Math.round(location.elevation_ft)} ft · {location.timezone}
          </p>
        </div>
        <Badge tone="green">Zone {climate.hardiness_zone}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-line">
        <Cell label="Last spring frost" value={monthDay(climate.last_spring_frost)} />
        <Cell label="First fall frost" value={monthDay(climate.first_fall_frost)} />
        <Cell label="Frost-free days" value={`${frostFree}`} />
        <Cell label="Growing degree days" value={climate.growing_degree_days.toLocaleString()} />
        <Cell
          label="Typical summer"
          value={`${Math.round(climate.avg_summer_high_f)}° / ${Math.round(climate.avg_summer_low_f)}°`}
          icon={<SunIcon className="h-3.5 w-3.5" />}
        />
        <Cell
          label="Annual rain"
          value={`${climate.annual_precip_in.toFixed(0)}″`}
          icon={<DropIcon className="h-3.5 w-3.5" />}
        />
      </dl>

      <p className="px-5 py-3.5 text-xs leading-relaxed text-ink-muted">{climate.summary}</p>
      <p className="border-t border-line px-5 py-2.5 text-[10px] uppercase tracking-wide text-ink-faint">
        {climate.source === "fallback"
          ? "Placeholder climate — couldn't reach the weather service"
          : "Derived from last year's daily weather · Open-Meteo"}
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-lg text-forest">{value}</dd>
    </div>
  );
}

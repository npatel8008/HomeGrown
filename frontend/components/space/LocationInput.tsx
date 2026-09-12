"use client";

/**
 * Where the garden is.
 *
 * ZIP-first by design: a postal code is unambiguous and resolves to real
 * coordinates, while a free-text city is easy to typo and was previously
 * ignored whenever a ZIP was also present — a field that silently did nothing.
 * The city is now *derived* from the lookup and shown read-only, so what you
 * see is always what the scoring engine actually used.
 *
 * A city-name mode remains for places without US-style ZIPs, since the
 * geocoder is global.
 */

import { cx } from "@/lib/format";
import type { ResolvedLocation } from "@/lib/types";
import { AlertIcon, CheckIcon } from "@/components/ui/Icons";

export type LocationMode = "zip" | "city";

export function LocationInput({
  mode,
  onModeChange,
  zipCode,
  cityQuery,
  onZipChange,
  onCityChange,
  resolved,
  locating,
}: {
  mode: LocationMode;
  onModeChange: (mode: LocationMode) => void;
  zipCode: string;
  cityQuery: string;
  onZipChange: (value: string) => void;
  onCityChange: (value: string) => void;
  resolved: ResolvedLocation | null;
  locating: boolean;
}) {
  const zipLooksComplete = /^\d{5}$/.test(zipCode.trim());
  const found = resolved?.resolved ? resolved : null;

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className="label !mb-0" htmlFor={mode === "zip" ? "zip" : "city-search"}>
          {mode === "zip" ? "ZIP code" : "City or town"}
        </label>
        <button
          type="button"
          className="text-xs font-medium text-moss-dark underline-offset-4 hover:underline"
          onClick={() => onModeChange(mode === "zip" ? "city" : "zip")}
        >
          {mode === "zip" ? "Outside the US? Search by city" : "Use a ZIP code instead"}
        </button>
      </div>

      {mode === "zip" ? (
        <input
          id="zip"
          className="input !py-3.5 text-lg tracking-[0.12em]"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          placeholder="78704"
          value={zipCode}
          onChange={(event) => onZipChange(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
        />
      ) : (
        <input
          id="city-search"
          className="input !py-3.5 text-lg"
          placeholder="Lisbon, Portugal"
          value={cityQuery}
          onChange={(event) => onCityChange(event.target.value)}
        />
      )}

      <p className="mt-1.5 text-xs text-ink-faint">
        We use this to pull your real frost dates, season length and forecast.
      </p>

      {/* The resolved place — read-only, because it comes from the geocoder. */}
      <div
        className={cx(
          "mt-3 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
          found
            ? "border-sage-deep bg-sage-tint text-forest"
            : "border-line bg-cream-deep/60 text-ink-faint",
        )}
      >
        {locating ? (
          <>
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sage-deep border-t-forest" />
            <span>Looking up that location…</span>
          </>
        ) : found ? (
          <>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-moss text-white">
              <CheckIcon className="h-2.5 w-2.5" />
            </span>
            <span className="font-medium">{found.label}</span>
            <span className="ml-auto text-[11px] text-ink-faint">
              {found.latitude.toFixed(2)}, {found.longitude.toFixed(2)}
            </span>
          </>
        ) : mode === "zip" && zipCode && !zipLooksComplete ? (
          <span>Enter all five digits…</span>
        ) : (zipCode || cityQuery) && resolved && !resolved.resolved ? (
          <>
            <AlertIcon className="h-4 w-4 shrink-0 text-[#A0522A]" />
            <span className="text-[#7A5418]">
              No match — using generic temperate assumptions. Try a nearby {mode === "zip" ? "ZIP" : "city"}.
            </span>
          </>
        ) : (
          <span>{mode === "zip" ? "City will fill in automatically" : "Start typing a place name"}</span>
        )}
      </div>
    </section>
  );
}

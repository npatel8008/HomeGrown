"use client";

/**
 * Turns a plan into a dated garden.
 *
 * Everything before this point is hypothetical. Pressing start stamps a
 * season start date, writes a planting record for every placed plant, and
 * from then on progress is measured against the real calendar.
 *
 * Requires a signed-in account with storage configured — there is nowhere to
 * keep a start date otherwise, and this component says so plainly rather than
 * offering a button that would silently do nothing.
 */

import Link from "next/link";
import { useState } from "react";

import { useSchedule } from "@/lib/use-schedule";
import { AlertIcon, ArrowRightIcon, CheckIcon, SparkIcon } from "@/components/ui/Icons";

/** yyyy-mm-dd for <input type="date">, in the viewer's own timezone. */
function isoDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function StartGardenCard({ plantCount }: { plantCount: number }) {
  const { schedule, state, loading, starting, start, started } = useSchedule();
  const today = isoDay(new Date());
  const [when, setWhen] = useState(today);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sage-deep border-t-forest" />
          Checking your garden record…
        </div>
      </div>
    );
  }

  // Already tracking — show where the season is, and link on.
  if (started && schedule) {
    return (
      <div className="card overflow-hidden">
        <div className="flex items-start gap-3 bg-sage-tint px-5 py-4">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-moss text-white">
            <CheckIcon className="h-3 w-3" />
          </span>
          <div>
            <p className="font-display text-base text-forest">Season under way</p>
            <p className="text-xs text-ink-muted">
              Day {schedule.day_of_season} · started{" "}
              {schedule.season_start
                ? new Date(schedule.season_start).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })
                : "—"}{" "}
              · {schedule.crops.length} crops tracked
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <p className="text-xs text-ink-muted">
            Progress, watering dates and harvest windows are on the Today page.
          </p>
          <Link href="/today" className="btn-primary !py-2 !text-xs shrink-0">
            Today
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Signed out or storage off — be specific about which.
  if (state !== "ok") {
    const signedOut = state === "signed-out";
    return (
      <div className="flex items-start gap-3 rounded-card border border-[#F0DDBB] bg-[#FDF7EC] px-4 py-3.5 text-sm text-[#7A5418]">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">
            {signedOut ? "Sign in to start tracking" : "Per-account storage is off"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed">
            {signedOut
              ? "A start date has to belong to an account, so your progress is still here tomorrow."
              : "The server has no database configured, so there's nowhere to keep a start date. Your plan still works — it just won't track days."}
          </p>
          {signedOut ? (
            <a href="/auth/login" className="btn-secondary mt-3 !py-2 !text-xs">
              Sign in
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="font-display text-base text-forest">Start growing</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Plant this garden and we&apos;ll track all {plantCount} plants from that date — watering
        intervals, harvest windows, and what to do each day.
      </p>

      <label className="label mt-4" htmlFor="season-start">
        Planting date
      </label>
      <input
        id="season-start"
        type="date"
        className="input"
        max={today}
        value={when}
        onChange={(event) => setWhen(event.target.value)}
      />
      <p className="mt-1.5 text-[11px] text-ink-faint">
        Backdate it if the garden is already in the ground.
      </p>

      {error ? <p className="mt-3 text-xs text-[#A0522A]">{error}</p> : null}

      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={starting}
        onClick={async () => {
          setError(null);
          // Noon local, so a date-only choice can't slip a day across timezones.
          const chosen = new Date(`${when}T12:00:00`);
          const result = await start(chosen);
          if (!result.data) {
            setError(result.error || "Couldn't start the season. Try again.");
          }
        }}
      >
        {starting ? "Planting…" : "Start growing"}
        {!starting ? <SparkIcon className="h-4 w-4" /> : null}
      </button>
    </div>
  );
}

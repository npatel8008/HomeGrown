"use client";

/**
 * Set or move the season's start date.
 *
 * Everything on this page is measured from that one date, so being able to
 * backdate it is the difference between a plan and a garden you can watch:
 * pick a date six weeks ago and every crop jumps to where it would actually
 * be today.
 */

import { useState } from "react";

import type { ScheduleResponse } from "@/lib/types";
import type { StorageState } from "@/lib/api-me";
import { CheckIcon, SparkIcon } from "@/components/ui/Icons";

/** yyyy-mm-dd for <input type="date">, in the viewer's own timezone. */
function isoDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Quick jumps, because typing a date to see growth is tedious. */
const PRESETS = [
  { label: "Today", days: 0 },
  { label: "2 weeks ago", days: 14 },
  { label: "1 month ago", days: 30 },
  { label: "2 months ago", days: 60 },
];

export function SeasonStartControl({
  schedule,
  state,
  starting,
  onApply,
}: {
  schedule: ScheduleResponse | null;
  state: StorageState;
  starting: boolean;
  /** Resolves with an error message when the date could not be applied. */
  onApply: (date: Date) => Promise<string | null>;
}) {
  const today = isoDay(new Date());
  const current = schedule?.season_start ? isoDay(new Date(schedule.season_start)) : today;
  const [when, setWhen] = useState(current);
  const [error, setError] = useState<string | null>(null);

  if (state === "signed-out") {
    return (
      <div className="card-quiet p-5">
        <p className="text-sm font-medium text-forest">Track real growth</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Sign in to set a planting date. Progress is measured from it, so you can backdate a
          garden that is already in the ground.
        </p>
        <a href="/auth/login" className="btn-secondary mt-3 !py-2 !text-xs">
          Sign in
        </a>
      </div>
    );
  }

  const apply = async (date: Date) => {
    setWhen(isoDay(date));
    setError(null);
    // A failure here is usually "no saved garden yet", which is fixable — but
    // only if we say so rather than appearing to do nothing.
    setError(await onApply(date));
  };

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-forest">Planting date</h2>
        {schedule?.started ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-moss-dark">
            <CheckIcon className="h-3 w-3" />
            Day {schedule.day_of_season}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Everything below is measured from this date. Set it in the past to see where your crops
        would be today.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          type="date"
          className="input"
          max={today}
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          aria-label="Season start date"
        />
        <button
          type="button"
          className="btn-primary shrink-0 !px-4 !text-xs"
          disabled={starting || !when}
          onClick={() => void apply(new Date(`${when}T12:00:00`))}
        >
          {starting ? "Applying…" : "Apply"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const date = new Date();
          date.setDate(date.getDate() - preset.days);
          const active = isoDay(date) === when;
          return (
            <button
              key={preset.label}
              type="button"
              disabled={starting}
              onClick={() => void apply(date)}
              className={
                active
                  ? "rounded-pill border border-forest bg-forest px-2.5 py-1 text-[11px] font-medium text-cream"
                  : "rounded-pill border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-moss/50 hover:bg-sage-tint hover:text-forest"
              }
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-[#FBEDE3] px-3 py-2 text-[11px] leading-relaxed text-[#A0522A]">
          {error}
        </p>
      ) : null}

      {state === "unavailable" ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[#7A5418]">
          Per-account storage is off on the server, so a date can&apos;t be saved.
        </p>
      ) : !schedule?.started ? (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
          <SparkIcon className="mt-0.5 h-3 w-3 shrink-0" />
          Applying a date plants your saved garden and starts tracking it.
        </p>
      ) : null}
    </section>
  );
}

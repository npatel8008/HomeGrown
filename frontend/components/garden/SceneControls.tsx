"use client";

/**
 * Season and time-of-day controls for the 3D garden.
 *
 * These write straight into the scene's `clockRef`, so dragging the scrubber
 * never re-renders the ~80 plants. React state here only drives the labels,
 * and is throttled to ~12Hz during playback.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { usePrefersReducedMotion } from "@/lib/motion";
import { cx } from "@/lib/format";
import type { GenerateLayoutResponse } from "@/lib/types";
import type { SceneClock } from "./Garden3D";
import { growthFactor } from "./Garden3D";

/** Days of season simulated per real second during playback. */
const PLAY_SPEED = 26;

export function SceneControls({
  layout,
  clockRef,
  seasonLength,
  initialDay,
}: {
  layout: GenerateLayoutResponse;
  clockRef: MutableRefObject<SceneClock>;
  seasonLength: number;
  initialDay: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [day, setDay] = useState(initialDay);
  const [timeOfDay, setTimeOfDay] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<number>();
  const lastLabel = useRef(0);

  const setClockDay = useCallback(
    (value: number) => {
      clockRef.current.day = value;
      setDay(value);
    },
    [clockRef],
  );

  // Playback advances the ref every frame; the label only ~12x a second.
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;
      const next = clockRef.current.day + delta * PLAY_SPEED;

      if (next >= seasonLength) {
        clockRef.current.day = seasonLength;
        setDay(seasonLength);
        setPlaying(false);
        return;
      }
      clockRef.current.day = next;
      if (now - lastLabel.current > 80) {
        lastLabel.current = now;
        setDay(next);
      }
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [playing, seasonLength, clockRef]);

  const wholeDay = Math.round(day);

  // What the garden is actually doing on this day, from the same data the
  // recommendation cards use.
  const crops = Array.from(
    new Map(layout.plants.map((plant) => [plant.crop_id, plant])).values(),
  ).sort((a, b) => a.days_to_harvest - b.days_to_harvest);

  const ready = crops.filter((crop) => wholeDay >= crop.days_to_harvest);
  const next = crops.find((crop) => wholeDay < crop.days_to_harvest);

  return (
    <div className="card space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base text-forest">Season time-lapse</h3>
          <p className="text-xs text-ink-faint">
            Day {wholeDay} of {seasonLength} — plants grow to their own harvest dates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary !px-4 !py-2 !text-xs"
            onClick={() => {
              setPlaying(false);
              setClockDay(initialDay);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="btn-primary !px-4 !py-2 !text-xs"
            onClick={() => {
              if (!playing && clockRef.current.day >= seasonLength) setClockDay(0);
              setPlaying((value) => !value);
            }}
          >
            {playing ? "Pause" : "Play season"}
          </button>
        </div>
      </div>

      <div>
        <input
          type="range"
          min={0}
          max={seasonLength}
          step={1}
          value={wholeDay}
          aria-label="Day of the growing season"
          className="w-full"
          onChange={(event) => {
            setPlaying(false);
            setClockDay(Number(event.target.value));
          }}
        />
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-ink-faint">
          <span>Planted</span>
          <span>Day {wholeDay}</span>
          <span>End of season</span>
        </div>
      </div>

      {/* Per-crop progress toward its own harvest date. */}
      <ul className="space-y-2">
        {crops.map((crop) => {
          const progress = Math.min(1, growthFactor(crop.days_to_harvest, wholeDay));
          const done = wholeDay >= crop.days_to_harvest;
          return (
            <li key={crop.crop_id} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 truncate text-forest">{crop.crop}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-sage-deep/50">
                <span
                  className="block h-full rounded-pill"
                  style={{
                    width: `${Math.max(2, progress * 100)}%`,
                    backgroundColor: crop.color,
                  }}
                />
              </span>
              <span
                className={cx(
                  "w-20 shrink-0 text-right",
                  done ? "font-semibold text-moss-dark" : "text-ink-faint",
                )}
              >
                {done ? "ready" : `${crop.days_to_harvest - wholeDay}d`}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="rounded-xl bg-sage-tint px-3.5 py-2.5 text-xs text-forest">
        {ready.length > 0 ? (
          <>
            <span className="font-semibold">{ready.length} ready to harvest</span>
            {next ? ` · ${next.crop} in ${days(next.days_to_harvest - wholeDay)}` : " · full harvest"}
          </>
        ) : next ? (
          <>
            First harvest: <span className="font-semibold">{next.crop}</span> in{" "}
            {days(next.days_to_harvest - wholeDay)}
          </>
        ) : (
          "Nothing planted"
        )}
      </p>

      <div className="border-t border-line pt-4">
        <label className="mb-2 flex items-center justify-between text-xs" htmlFor="time-of-day">
          <span className="font-medium text-forest">Time of day</span>
          <span className="text-ink-faint">{describeTime(timeOfDay)}</span>
        </label>
        <input
          id="time-of-day"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={timeOfDay}
          className="w-full"
          onChange={(event) => {
            const value = Number(event.target.value);
            clockRef.current.timeOfDay = value;
            setTimeOfDay(value);
          }}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Moves the sun across the sky so you can see where shadows fall through the day.
        </p>
      </div>

      {reducedMotion ? (
        <p className="text-[11px] text-ink-faint">
          Reduced motion is on, so the plants don&apos;t sway and the camera doesn&apos;t glide. The
          scrubber still works.
        </p>
      ) : null}
    </div>
  );
}

/** "1 day", "12 days" — the plural matters when the demo sits on day 1. */
function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

function describeTime(t: number): string {
  if (t < 0.12) return "Sunrise";
  if (t < 0.35) return "Morning";
  if (t < 0.65) return "Midday";
  if (t < 0.88) return "Afternoon";
  return "Sunset";
}

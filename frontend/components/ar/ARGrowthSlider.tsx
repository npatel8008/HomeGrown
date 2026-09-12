"use client";

/**
 * Season scrubber for the AR view.
 *
 * Writes the day straight into the scene's `clockRef`, the same channel the
 * 3D view's scrubber uses, so dragging never re-renders the ~80 plants — in
 * an AR session, dropping frames costs tracking quality, not just smoothness.
 * React state here only drives the label, and only a few times a second.
 */

import { useRef, useState, type MutableRefObject } from "react";

import type { SceneClock } from "@/components/garden/Garden3D";
import { growthFactor } from "@/components/garden/Garden3D";
import type { GenerateLayoutResponse } from "@/lib/types";

export function ARGrowthSlider({
  layout,
  clockRef,
  initialDay,
}: {
  layout: GenerateLayoutResponse;
  clockRef: MutableRefObject<SceneClock>;
  initialDay: number;
}) {
  const [day, setDay] = useState(initialDay);
  const lastLabel = useRef(0);

  // One entry per crop, soonest harvest first.
  const crops = Array.from(
    new Map(layout.plants.map((plant) => [plant.crop_id, plant])).values(),
  ).sort((a, b) => a.days_to_harvest - b.days_to_harvest);

  // Far enough past the slowest crop to see it finish, not so far the slider
  // is mostly dead travel.
  const maxDay = Math.max(60, Math.round((crops.at(-1)?.days_to_harvest ?? 90) * 1.4));

  const ready = crops.filter((crop) => day >= crop.days_to_harvest).length;
  const next = crops.find((crop) => day < crop.days_to_harvest);

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-2xl bg-black/65 px-4 py-3 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3 text-white">
        <span className="text-[11px] font-semibold uppercase tracking-wide">Day {day}</span>
        <span className="text-[11px] text-white/70">
          {ready > 0
            ? `${ready} ready${next ? ` · ${next.crop} in ${next.days_to_harvest - day}d` : ""}`
            : next
              ? `${next.crop} in ${next.days_to_harvest - day}d`
              : "—"}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={maxDay}
        step={1}
        value={day}
        aria-label="Day of the growing season"
        className="mt-2 w-full"
        onChange={(event) => {
          const next = Number(event.target.value);
          // The scene reads this every frame; state is only for the label.
          clockRef.current.day = next;
          const now = performance.now();
          if (now - lastLabel.current > 60) {
            lastLabel.current = now;
            setDay(next);
          }
        }}
        // Make sure the final value lands even if the throttle swallowed it.
        onPointerUp={() => setDay(clockRef.current.day)}
      />

      {/* Per-crop progress, thin enough not to crowd the camera view. */}
      <ul className="mt-1.5 space-y-1">
        {crops.slice(0, 4).map((crop) => {
          const progress = Math.min(1, growthFactor(crop.days_to_harvest, day));
          return (
            <li key={crop.crop_id} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-[10px] text-white/80">{crop.crop}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-pill bg-white/25">
                <span
                  className="block h-full rounded-pill"
                  style={{
                    width: `${Math.max(3, progress * 100)}%`,
                    backgroundColor: crop.color,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import type { PlacedPlant } from "@/lib/types";

/**
 * A single plant inside the 2D <svg> planner. Rendered in plot coordinates
 * (feet), so the parent just sets a matching viewBox.
 */
export function PlantMarker({
  plant,
  selected,
  onSelect,
  showSpacing,
}: {
  plant: PlacedPlant;
  selected: boolean;
  onSelect: (plant: PlacedPlant) => void;
  showSpacing: boolean;
}) {
  const radius = Math.max(0.18, plant.spacing_ft / 2 - 0.08);
  const dot = Math.min(0.42, Math.max(0.16, plant.spacing_ft / 3.2));

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${plant.crop} at ${plant.x} by ${plant.z} feet`}
      className="cursor-pointer outline-none"
      onClick={() => onSelect(plant)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(plant);
        }
      }}
    >
      {showSpacing ? (
        <circle
          cx={plant.x}
          cy={plant.z}
          r={radius}
          fill={plant.color}
          fillOpacity={0.12}
          stroke={plant.color}
          strokeOpacity={0.35}
          strokeWidth={0.03}
          strokeDasharray="0.12 0.1"
        />
      ) : null}
      <circle
        cx={plant.x}
        cy={plant.z}
        r={dot}
        fill={plant.color}
        stroke={selected ? "#1B3B2A" : "#ffffff"}
        strokeWidth={selected ? 0.09 : 0.05}
        className="transition-all duration-150"
      />
      {selected ? (
        <circle
          cx={plant.x}
          cy={plant.z}
          r={dot + 0.14}
          fill="none"
          stroke="#1B3B2A"
          strokeWidth={0.04}
          strokeOpacity={0.5}
        />
      ) : null}
    </g>
  );
}

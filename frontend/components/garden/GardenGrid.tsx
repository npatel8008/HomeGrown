"use client";

import { useState } from "react";

import { cx } from "@/lib/format";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { PlantMarker } from "./PlantMarker";

/** Top-down 2D garden planner, drawn straight from the layout JSON. */
export function GardenGrid({
  layout,
  selectedId,
  onSelect,
}: {
  layout: GenerateLayoutResponse;
  selectedId?: string | null;
  onSelect: (plant: PlacedPlant) => void;
}) {
  const [showSpacing, setShowSpacing] = useState(true);
  const [showLabels, setShowLabels] = useState(false);

  const { width_ft: width, length_ft: length } = layout.plot;
  const pad = 0.6;

  const gridLines = [];
  for (let x = 1; x < width; x += 1) gridLines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={length} />);
  for (let z = 1; z < length; z += 1) gridLines.push(<line key={`h${z}`} x1={0} y1={z} x2={width} y2={z} />);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
        <div>
          <h2 className="font-display text-lg text-forest">
            {width} ft × {length} ft garden
          </h2>
          <p className="text-xs text-ink-faint">
            {layout.plants.length} plants · {layout.beds.length} beds · tall crops placed at the back
          </p>
        </div>
        <div className="flex gap-2">
          <Toggle active={showSpacing} onClick={() => setShowSpacing((v) => !v)}>
            Spacing
          </Toggle>
          <Toggle active={showLabels} onClick={() => setShowLabels((v) => !v)}>
            Labels
          </Toggle>
        </div>
      </div>

      <div className="bg-cream-deep/40 p-4 sm:p-6">
        <svg
          viewBox={`${-pad} ${-pad} ${width + pad * 2} ${length + pad * 2}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Garden layout, ${width} by ${length} feet`}
        >
          {/* soil */}
          <rect
            x={0}
            y={0}
            width={width}
            height={length}
            rx={0.3}
            fill="#F2EFE4"
            stroke="#C9B79A"
            strokeWidth={0.08}
          />

          {/* one-foot grid */}
          <g stroke="#1B3B2A" strokeOpacity={0.07} strokeWidth={0.02}>
            {gridLines}
          </g>

          {/* beds */}
          {layout.beds.map((bed) => (
            <g key={bed.id}>
              <rect
                x={bed.x}
                y={bed.z}
                width={bed.width}
                height={bed.length}
                rx={0.2}
                fill="#E3D8C3"
                fillOpacity={0.75}
                stroke="#B4703C"
                strokeOpacity={0.45}
                strokeWidth={0.06}
              />
              <text
                x={bed.x + 0.16}
                y={bed.z + 0.42}
                fontSize={0.28}
                fill="#8A6A45"
                className="font-sans"
              >
                {bed.label}
              </text>
            </g>
          ))}

          {/* paths */}
          {layout.paths.map((path, index) => (
            <rect
              key={`path-${index}`}
              x={path.x}
              y={path.z}
              width={path.width}
              height={path.length}
              fill="#D8D2C2"
              fillOpacity={0.9}
              stroke="none"
            />
          ))}

          {/* plants */}
          {layout.plants.map((plant) => (
            <PlantMarker
              key={plant.id}
              plant={plant}
              selected={plant.id === selectedId}
              onSelect={onSelect}
              showSpacing={showSpacing}
            />
          ))}

          {/* labels */}
          {showLabels
            ? layout.plants.map((plant) => (
                <text
                  key={`label-${plant.id}`}
                  x={plant.x}
                  y={plant.z - Math.max(0.24, plant.spacing_ft / 3.2) - 0.1}
                  fontSize={0.24}
                  textAnchor="middle"
                  fill="#1B3B2A"
                  className="font-sans"
                >
                  {plant.crop}
                </text>
              ))
            : null}

          {/* dimension labels */}
          <text x={width / 2} y={-0.18} fontSize={0.32} textAnchor="middle" fill="#5F6F64">
            {width} ft
          </text>
          <text
            x={-0.18}
            y={length / 2}
            fontSize={0.32}
            textAnchor="middle"
            fill="#5F6F64"
            transform={`rotate(-90 ${-0.18} ${length / 2})`}
          >
            {length} ft
          </text>
        </svg>
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-forest bg-forest text-cream"
          : "border-line bg-white text-ink-muted hover:bg-sage-tint",
      )}
    >
      {children}
    </button>
  );
}

/** Crop legend shared by the 2D and 3D views. */
export function PlantLegend({ layout }: { layout: GenerateLayoutResponse }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 font-display text-base text-forest">Plant legend</h3>
      <ul className="space-y-2">
        {layout.legend.map((entry) => (
          <li key={entry.crop_id} className="flex items-center gap-3 text-sm">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="flex-1 text-forest">{entry.crop}</span>
            <span className="font-display text-sm text-ink-muted">{entry.count}</span>
          </li>
        ))}
      </ul>

      {layout.unplaced.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[#F0DDBB] bg-[#FDF7EC] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#93611F]">
            Didn&apos;t fit the plot
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#7A5418]">
            {layout.unplaced.map((entry) => `${entry.count} ${entry.crop.toLowerCase()}`).join(", ")} —
            grow these in containers or trim the plan.
          </p>
        </div>
      ) : null}

      <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-[11px] text-ink-faint">
        <p className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#E3D8C3]" /> Planting bed
        </p>
        <p className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#D8D2C2]" /> Walking path
        </p>
        <p className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-dashed border-moss" /> Mature spacing
        </p>
      </div>
    </div>
  );
}

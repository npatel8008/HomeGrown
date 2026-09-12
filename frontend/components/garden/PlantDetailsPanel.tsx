"use client";

import { usd, waterLabel } from "@/lib/format";
import type { PlacedPlant } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

/** Details for the plant selected in either the 2D planner or the 3D scene. */
export function PlantDetailsPanel({
  plant,
  onClose,
  index,
}: {
  plant: PlacedPlant | null;
  onClose: () => void;
  index?: number;
}) {
  if (!plant) {
    return (
      <div className="card flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage text-forest">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path
              d="M12 21c0-6 3-9 8-10-1 6-4 9-8 10Zm0 0c0-5-2.5-7.5-7-8.5.9 5 3.5 7.5 7 8.5Zm0-9c1.5-2 1.5-5 0-9-1.5 4-1.5 7 0 9Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="text-sm font-medium text-forest">Select a plant</p>
        <p className="max-w-[24ch] text-xs text-ink-faint">
          Click any plant in the garden to see its harvest timeline and value.
        </p>
      </div>
    );
  }

  const label = `${plant.crop} #${index ?? plant.id.split("-").pop()}`;

  return (
    <div className="card h-full animate-fade-up p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="h-10 w-10 rounded-xl"
            style={{ backgroundColor: plant.color }}
            aria-hidden="true"
          />
          <div>
            <h3 className="font-display text-lg leading-tight text-forest">{label}</h3>
            <p className="text-xs text-ink-faint">
              Position {plant.x} ft × {plant.z} ft
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close plant details"
          className="rounded-lg p-1.5 text-ink-faint hover:bg-cream-deep hover:text-forest"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <dl className="mt-5 space-y-3">
        <Row label="Expected first harvest" value={`${plant.days_to_harvest} days`} />
        <Row label="Expected yield" value={`${plant.expected_yield_lbs} lbs`} />
        <Row label="Water" value={waterLabel(plant.water_requirement)} />
        <Row label="Estimated value" value={usd(plant.estimated_value_usd)} />
        <Row label="Mature height" value={`${plant.height} ft`} />
        <Row label="Spacing" value={`${plant.spacing_ft} ft`} />
      </dl>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <span className="text-xs text-ink-faint">Status</span>
        <Badge tone="green">{plant.status[0].toUpperCase() + plant.status.slice(1)}</Badge>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-2.5 last:border-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm font-medium text-forest">{value}</dd>
    </div>
  );
}

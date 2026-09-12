"use client";

import { useEffect, useState } from "react";

import { cx } from "@/lib/format";
import type { ExperienceLevel, GardenType, GrowingSpace, WaterAccess } from "@/lib/types";

export const GARDEN_TYPE_OPTIONS: { value: GardenType; label: string }[] = [
  { value: "in-ground", label: "In-ground" },
  { value: "raised-beds", label: "Raised beds" },
  { value: "containers", label: "Containers" },
  { value: "balcony", label: "Balcony" },
];

export const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "Beginner", hint: "First season" },
  { value: "intermediate", label: "Intermediate", hint: "A few seasons in" },
  { value: "advanced", label: "Advanced", hint: "Confident with anything" },
];

export const WATER_OPTIONS: { value: WaterAccess; label: string }[] = [
  { value: "hose", label: "Outdoor hose" },
  { value: "watering-can", label: "Watering can" },
  { value: "irrigation", label: "Drip irrigation" },
  { value: "limited", label: "Limited access" },
];

function OptionGrid<T extends string>({
  legend,
  options,
  value,
  onChange,
  columns = "sm:grid-cols-3",
}: {
  legend: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: string;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className={cx("grid grid-cols-2 gap-2", columns)}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={cx(
                "rounded-xl border px-3 py-3 text-left transition-all",
                selected
                  ? "border-forest bg-forest text-cream shadow-card"
                  : "border-line bg-white text-forest hover:border-moss/50 hover:bg-sage-tint",
              )}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              {option.hint ? (
                <span className={cx("block text-[11px]", selected ? "text-cream/70" : "text-ink-faint")}>
                  {option.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * A plot dimension.
 *
 * The box has to stay clearable while you retype it, but an empty box is
 * `Number("") === 0`, and writing that to the store poisons every request that
 * carries the plot — the schema requires > 0. So the draft text lives here and
 * only a valid number is committed; on blur the box snaps back to what was
 * actually stored.
 */
function DimensionInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // Keep up with changes made elsewhere (e.g. "Use demo space").
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      aria-label={label}
      className="input"
      type="number"
      inputMode="numeric"
      min={1}
      max={200}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = Number(event.target.value);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) onCommit(parsed);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

export function GrowingSpaceForm({
  space,
  onChange,
}: {
  space: GrowingSpace;
  onChange: (patch: Partial<GrowingSpace>) => void;
}) {
  const setPlot = (patch: Partial<GrowingSpace["plot"]>) =>
    onChange({ plot: { ...space.plot, ...patch } });

  return (
    <div className="space-y-7">
      <div>
        <span className="label">Plot size</span>
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
          <DimensionInput
            label="Plot width in feet"
            value={space.plot.width_ft}
            onCommit={(width_ft) => setPlot({ width_ft })}
          />
          <span className="text-sm text-ink-faint">×</span>
          <DimensionInput
            label="Plot length in feet"
            value={space.plot.length_ft}
            onCommit={(length_ft) => setPlot({ length_ft })}
          />
          <span className="rounded-xl border border-line bg-cream-deep px-3 py-2.5 text-sm text-ink-muted">
            feet
          </span>
        </div>
      </div>

      <OptionGrid
        legend="Garden type"
        options={GARDEN_TYPE_OPTIONS}
        value={space.garden_type}
        onChange={(value) => onChange({ garden_type: value })}
        columns="sm:grid-cols-4"
      />

      <OptionGrid
        legend="Gardening experience"
        options={EXPERIENCE_OPTIONS}
        value={space.experience}
        onChange={(value) => onChange({ experience: value })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="budget">
            Season budget
          </label>
          <div className="flex items-center gap-3">
            <input
              id="budget"
              type="range"
              min={25}
              max={600}
              step={25}
              className="flex-1"
              value={space.budget_usd}
              onChange={(event) => onChange({ budget_usd: Number(event.target.value) })}
            />
            <span className="w-16 rounded-lg bg-sage px-2 py-1 text-center text-sm font-semibold text-forest">
              ${space.budget_usd}
            </span>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="water">
            Water access
          </label>
          <select
            id="water"
            className="input"
            value={space.water_access}
            onChange={(event) => onChange({ water_access: event.target.value as WaterAccess })}
          >
            {WATER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

    </div>
  );
}

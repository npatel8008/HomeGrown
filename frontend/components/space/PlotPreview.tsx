"use client";

import { cx } from "@/lib/format";
import type { SunlightLevel } from "@/lib/types";

const SUN_TINT: Record<SunlightLevel, string> = {
  "full-sun": "from-[#FBF3DC] to-[#EFF5E7]",
  "partial-sun": "from-[#F3F4E6] to-[#E9F0E6]",
  "mostly-shade": "from-[#E7EBE9] to-[#DFE7E2]",
};

/** Scaled rectangle preview of the plot, updated live as dimensions change. */
export function PlotPreview({
  width,
  length,
  sunlight = "full-sun",
  gardenTypeLabel,
}: {
  width: number;
  length: number;
  sunlight?: SunlightLevel;
  gardenTypeLabel?: string;
}) {
  const safeWidth = Math.max(1, width || 1);
  const safeLength = Math.max(1, length || 1);
  const area = safeWidth * safeLength;

  // Fit the plot inside a 100x100 box while preserving aspect ratio.
  const longest = Math.max(safeWidth, safeLength);
  const boxWidth = (safeWidth / longest) * 100;
  const boxHeight = (safeLength / longest) * 100;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="eyebrow">Your plot</span>
        <span className="text-xs text-ink-faint">Drawn to scale</span>
      </div>

      <div className="relative flex aspect-[4/3] items-center justify-center rounded-xl bg-cream-deep/70 p-6">
        <div
          className={cx(
            "relative rounded-lg border-2 border-dashed border-moss/50 bg-gradient-to-br shadow-inset",
            SUN_TINT[sunlight],
          )}
          style={{
            width: `${boxWidth}%`,
            height: `${boxHeight}%`,
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(74,143,95,0.10) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, rgba(74,143,95,0.10) 0 1px, transparent 1px 12px)",
          }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <span className="font-display text-2xl leading-none text-forest">
              {area.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-forest/70">
              sq ft growing area
            </span>
          </div>

          {/* width dimension line */}
          <span className="absolute -top-6 left-0 right-0 flex items-center gap-2 text-[11px] font-medium text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            {safeWidth} ft
            <span className="h-px flex-1 bg-line" />
          </span>
          {/* length dimension line */}
          <span className="absolute -right-1 top-0 bottom-0 flex translate-x-full flex-col items-center gap-2 pl-3 text-[11px] font-medium text-ink-muted">
            <span className="w-px flex-1 bg-line" />
            <span className="whitespace-nowrap">{safeLength} ft</span>
            <span className="w-px flex-1 bg-line" />
          </span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-sage-tint px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Dimensions</dt>
          <dd className="font-medium text-forest">
            {safeWidth} ft × {safeLength} ft
          </dd>
        </div>
        <div className="rounded-xl bg-sage-tint px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">Setup</dt>
          <dd className="font-medium text-forest">{gardenTypeLabel ?? "Raised beds"}</dd>
        </div>
      </dl>
    </div>
  );
}

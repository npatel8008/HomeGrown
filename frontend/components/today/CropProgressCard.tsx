"use client";

import { cx } from "@/lib/format";
import type { CropSchedule, GrowthStage } from "@/lib/types";
import { ClockIcon, DropIcon } from "@/components/ui/Icons";

const STAGE_TONE: Record<GrowthStage, string> = {
  "not-started": "bg-cream-deep text-ink-faint",
  establishing: "bg-[#EAF2F6] text-[#2F6178]",
  growing: "bg-sage text-forest",
  maturing: "bg-[#FBF3E1] text-[#8B6417]",
  harvesting: "bg-[#E6F3E4] text-moss-dark",
  finished: "bg-cream-deep text-ink-faint",
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** One crop's position in the season, and what it needs next. */
export function CropProgressCard({ crop }: { crop: CropSchedule }) {
  const progress = Math.max(0, Math.min(100, crop.progress_pct));

  return (
    <article className="card overflow-hidden">
      <div className="flex items-start gap-3 p-5 pb-4">
        <span
          className="mt-0.5 h-9 w-9 shrink-0 rounded-lg"
          style={{ backgroundColor: crop.color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base text-forest">{crop.crop}</h3>
            <span
              className={cx(
                "rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                STAGE_TONE[crop.stage],
              )}
            >
              {crop.stage_label}
            </span>
            <span className="text-[11px] text-ink-faint">{crop.plants} plants</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Day {crop.days_since_planting} of ~{crop.days_to_harvest} · planted{" "}
            {shortDate(crop.planted_on)}
          </p>
        </div>
        <span className="shrink-0 font-display text-xl text-forest">{progress}%</span>
      </div>

      {/* Progress toward first harvest. */}
      <div className="px-5">
        <div className="h-2 w-full overflow-hidden rounded-pill bg-sage-deep/50">
          <div
            className="h-full rounded-pill transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(2, progress)}%`, backgroundColor: crop.color }}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px bg-line">
        <div className={cx("px-5 py-3", crop.water_due ? "bg-[#FBEDE3]" : "bg-white")}>
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
            <DropIcon className="h-3.5 w-3.5" />
            Next water
          </dt>
          <dd
            className={cx(
              "mt-0.5 font-display text-base",
              crop.water_due ? "text-[#A0522A]" : "text-forest",
            )}
          >
            {crop.water_due ? "Today" : shortDate(crop.next_water_date)}
          </dd>
        </div>
        <div className={cx("px-5 py-3", crop.harvest_open ? "bg-[#E6F3E4]" : "bg-white")}>
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
            <ClockIcon className="h-3.5 w-3.5" />
            {crop.harvest_open ? "Harvest window" : "First harvest"}
          </dt>
          <dd
            className={cx(
              "mt-0.5 font-display text-base",
              crop.harvest_open ? "text-moss-dark" : "text-forest",
            )}
          >
            {crop.harvest_open
              ? `Open until ${shortDate(crop.harvest_window_ends)}`
              : shortDate(crop.first_harvest_date)}
          </dd>
        </div>
      </dl>

      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-muted">
        {crop.water_note}
      </p>

      {crop.harvested_lbs > 0 ? (
        <p className="border-t border-line bg-sage-tint px-5 py-2.5 text-xs text-forest">
          <span className="font-semibold">{crop.harvested_lbs} lbs</span> harvested so far of an
          expected {crop.expected_yield_lbs} lbs
        </p>
      ) : null}
    </article>
  );
}

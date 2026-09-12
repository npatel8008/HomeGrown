"use client";

import { useState } from "react";

import { usd, waterLabel } from "@/lib/format";
import type { CropRecommendation } from "@/lib/types";
import { Badge, DifficultyBadge } from "@/components/ui/Badge";
import { ClockIcon, DropIcon, RulerIcon } from "@/components/ui/Icons";
import { RecommendationScore, ScoreDial } from "./RecommendationScore";

export function CropRecommendationCard({ crop }: { crop: CropRecommendation }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <article className="card overflow-hidden transition-shadow hover:shadow-lift">
      <div className="flex items-start gap-4 border-b border-line/70 p-5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-lg text-white"
          style={{ backgroundColor: crop.color }}
          aria-hidden="true"
        >
          {crop.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl leading-tight text-forest">{crop.name}</h3>
            <Badge tone="solid">#{crop.rank}</Badge>
            <DifficultyBadge difficulty={crop.difficulty} />
          </div>
          <p className="mt-1 text-xs capitalize text-ink-faint">{crop.category.replace(/-/g, " ")}</p>
        </div>
        <ScoreDial score={crop.score} color={crop.color} />
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-sage-tint px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-moss-dark">Why this crop</p>
          <p className="mt-1 text-sm leading-relaxed text-forest first-letter:uppercase">{crop.reason}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Recommended" value={`${crop.plants_recommended}`} unit="plants" />
          <Metric label="Expected yield" value={`${crop.expected_yield_lbs}`} unit="lbs" />
          <Metric label="Grocery value" value={usd(crop.grocery_value_usd)} />
          <Metric label="Est. savings" value={usd(crop.savings_usd)} highlight />
        </div>

        <ul className="flex flex-wrap gap-2 text-xs text-ink-muted">
          <li className="chip">
            <ClockIcon className="h-3.5 w-3.5" /> ~{crop.days_to_harvest} days to harvest
          </li>
          <li className="chip">
            <DropIcon className="h-3.5 w-3.5" /> {waterLabel(crop.water_requirement)} water
          </li>
          <li className="chip">
            <RulerIcon className="h-3.5 w-3.5" /> {crop.space_required_sqft} sq ft
          </li>
          <li className="chip">Cost {usd(crop.growing_cost_usd)}</li>
        </ul>

        <div>
          <button
            type="button"
            className="text-xs font-semibold text-moss-dark underline-offset-4 hover:underline"
            onClick={() => setShowBreakdown((value) => !value)}
            aria-expanded={showBreakdown}
          >
            {showBreakdown ? "Hide score breakdown" : "How was this scored?"}
          </button>
          {showBreakdown ? (
            <div className="mt-3 animate-fade-up rounded-xl border border-line bg-cream/60 p-4">
              <RecommendationScore breakdown={crop.score_breakdown} />
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{crop.description}</p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "rounded-xl bg-forest px-3 py-2.5 text-cream" : "px-1 py-2.5"}>
      <p
        className={
          highlight
            ? "text-[10px] uppercase tracking-wide text-cream/70"
            : "text-[10px] uppercase tracking-wide text-ink-faint"
        }
      >
        {label}
      </p>
      <p className={highlight ? "font-display text-lg leading-tight" : "font-display text-lg leading-tight text-forest"}>
        {value}
        {unit ? <span className="ml-1 text-xs font-sans font-medium opacity-70">{unit}</span> : null}
      </p>
    </div>
  );
}

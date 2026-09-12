"use client";

import { usageLabel } from "@/lib/format";
import type { ExtractedIngredient } from "@/lib/types";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { TrashIcon } from "@/components/ui/Icons";

/** One ingredient in the household food-demand profile, with an importance slider. */
export function IngredientCard({
  ingredient,
  onRemove,
  onScoreChange,
}: {
  ingredient: ExtractedIngredient;
  onRemove: () => void;
  onScoreChange: (score: number) => void;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg text-forest">{ingredient.ingredient}</h3>
            {ingredient.growable ? (
              <Badge tone="green">Growable</Badge>
            ) : (
              // Says it's a gap in our data, not that the plant can't be grown.
              <Badge tone="neutral">Not in our crop library yet</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            {ingredient.matched_meals.length > 0
              ? `From ${ingredient.matched_meals.join(", ")}`
              : "Added manually"}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${ingredient.ingredient}`}
          className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-cream-deep hover:text-earth"
          onClick={onRemove}
        >
          <TrashIcon />
        </button>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm font-medium text-forest">{usageLabel(ingredient.weekly_usage_score)}</span>
        <span className="font-display text-xl text-forest">{ingredient.weekly_usage_score}</span>
      </div>
      <ProgressBar value={ingredient.weekly_usage_score} className="mt-2" />

      <label className="mt-4 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          Adjust importance
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={ingredient.weekly_usage_score}
          onChange={(event) => onScoreChange(Number(event.target.value))}
          className="mt-2 w-full"
          aria-label={`${ingredient.ingredient} importance`}
        />
      </label>
    </div>
  );
}

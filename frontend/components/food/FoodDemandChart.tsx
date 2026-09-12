"use client";

import { usageLabel } from "@/lib/format";
import type { ExtractedIngredient } from "@/lib/types";

/** Horizontal bar chart of the household's growable ingredient demand. */
export function FoodDemandChart({ ingredients }: { ingredients: ExtractedIngredient[] }) {
  const growable = ingredients.filter((item) => item.growable);
  if (growable.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        No growable ingredients yet — add a few above to see the profile.
      </p>
    );
  }

  const max = Math.max(...growable.map((item) => item.weekly_usage_score), 1);

  return (
    <ul className="space-y-3.5">
      {growable.map((item, index) => {
        const width = Math.max(8, (item.weekly_usage_score / max) * 100);
        const wideEnough = width >= 58;
        return (
          <li
            key={item.ingredient}
            className="grid grid-cols-[minmax(88px,120px)_1fr_auto] items-center gap-3"
          >
            <span className="truncate text-sm font-medium text-forest">{item.ingredient}</span>
            <span className="relative flex h-7 items-center overflow-hidden rounded-lg bg-sage-tint">
              <span
                className="flex h-full shrink-0 items-center justify-end rounded-lg bg-gradient-to-r from-moss-light to-moss overflow-hidden whitespace-nowrap px-2.5 text-[11px] font-semibold text-white animate-fade-up"
                style={{ width: `${width}%`, animationDelay: `${index * 45}ms` }}
              >
                {/* Label sits inside the bar when it fits, beside it when it doesn't. */}
                {wideEnough ? usageLabel(item.weekly_usage_score) : null}
              </span>
              {!wideEnough ? (
                <span className="whitespace-nowrap pl-2 text-[11px] font-medium text-ink-muted">
                  {usageLabel(item.weekly_usage_score)}
                </span>
              ) : null}
            </span>
            <span className="w-8 text-right font-display text-sm text-forest">
              {item.weekly_usage_score}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

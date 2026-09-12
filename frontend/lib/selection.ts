/**
 * Recompute the garden summary from whichever crops the user has selected.
 *
 * Mirrors the arithmetic in `backend/services/crop_scoring.py`, but only the
 * summing — no scoring or allocation happens here. The one constant that would
 * otherwise have to be duplicated (season-long produce need) is sent down by
 * the backend as `summary.produce_need_lbs`.
 */

import type { CropRecommendation, GardenSummary } from "./types";

export function summarizeSelection(
  base: GardenSummary,
  all: CropRecommendation[],
  selectedIds: string[],
): GardenSummary {
  const selected = all.filter((crop) => selectedIds.includes(crop.crop_id));

  const sum = (pick: (crop: CropRecommendation) => number) =>
    selected.reduce((total, crop) => total + pick(crop), 0);

  const yieldLbs = sum((crop) => crop.expected_yield_lbs);
  const value = sum((crop) => crop.grocery_value_usd);
  const cost = sum((crop) => crop.growing_cost_usd);
  const need = base.produce_need_lbs || 1;
  const coverage = Math.max(0, Math.min(100, Math.round((yieldLbs / need) * 100)));

  const householdPhrase = base.coverage_explainer.match(/household of (\d+)/);
  const household = householdPhrase ? householdPhrase[1] : "your household";

  return {
    ...base,
    used_area_sqft: Number(sum((crop) => crop.space_required_sqft).toFixed(1)),
    crop_count: selected.length,
    total_plants: sum((crop) => crop.plants_recommended),
    estimated_yield_lbs: Number(yieldLbs.toFixed(1)),
    estimated_grocery_value_usd: Number(value.toFixed(2)),
    estimated_cost_usd: Number(cost.toFixed(2)),
    estimated_savings_usd: Number((value - cost).toFixed(2)),
    homegrown_coverage_pct: coverage,
    coverage_explainer:
      `Your garden could provide approximately ${coverage}% of the produce a ` +
      `household of ${household} regularly consumes during the growing season.`,
  };
}

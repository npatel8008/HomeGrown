/**
 * Applying voice commands to the garden.
 *
 * Pure functions over the two pieces of state that decide what grows:
 * `selectedCropIds` (which crops are in the garden) and `plantCounts` (how many
 * of each, overriding the recommender's suggestion). The layout is then
 * regenerated from those by the existing /api/generate-layout call — voice
 * never invents plant positions, it changes the inputs and lets the real
 * packer run. That is why a spoken edit produces exactly the same layout as
 * clicking the same change in the UI.
 *
 * Interpretation happens on the backend (services/garden_voice.py); this file
 * only applies already-validated commands, so every crop_id arriving here is
 * known to exist.
 */

import type { GardenCommand, RecommendCropsResponse } from "./types";

/** Used when a crop is added that the recommender never scored. */
const DEFAULT_PLANTS = 4;
const MAX_PLANTS = 60;

export interface GardenSelection {
  selectedCropIds: string[];
  plantCounts: Record<string, number>;
}

export interface AppliedCommands extends GardenSelection {
  /** One line per change, for the on-screen log. */
  applied: string[];
  /** Requests that parsed but changed nothing, with the reason. */
  skipped: string[];
  /** True when the caller should pop its undo stack instead of using this. */
  undo: boolean;
}

function recommendedCount(
  cropId: string,
  recommendations: RecommendCropsResponse | null,
): number | null {
  const match = recommendations?.recommendations.find((crop) => crop.crop_id === cropId);
  return match ? match.plants_recommended : null;
}

function nameFor(
  cropId: string,
  fallback: string | null | undefined,
  recommendations: RecommendCropsResponse | null,
): string {
  const match = recommendations?.recommendations.find((crop) => crop.crop_id === cropId);
  return match?.name ?? fallback ?? cropId;
}

/**
 * The set of crops actually in the garden right now.
 *
 * An empty `selectedCropIds` has always meant "all of them" elsewhere in the
 * app, so it is materialised into a real list before editing — otherwise
 * "remove the kale" on an untouched garden would remove kale from a list that
 * means everything, and quietly select nothing at all.
 */
export function materialiseSelection(
  selection: GardenSelection,
  recommendations: RecommendCropsResponse | null,
): GardenSelection {
  if (selection.selectedCropIds.length > 0) return selection;
  return {
    ...selection,
    selectedCropIds: (recommendations?.recommendations ?? []).map((crop) => crop.crop_id),
  };
}

export function countFor(
  cropId: string,
  selection: GardenSelection,
  recommendations: RecommendCropsResponse | null,
): number {
  const override = selection.plantCounts[cropId];
  if (typeof override === "number") return override;
  return recommendedCount(cropId, recommendations) ?? DEFAULT_PLANTS;
}

function clamp(plants: number): number {
  return Math.max(0, Math.min(MAX_PLANTS, Math.round(plants)));
}

export function applyCommands(
  commands: GardenCommand[],
  selection: GardenSelection,
  recommendations: RecommendCropsResponse | null,
): AppliedCommands {
  let next = materialiseSelection(selection, recommendations);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const command of commands) {
    if (command.kind === "undo") {
      return { ...next, applied, skipped, undo: true };
    }

    if (command.kind === "clear_crops") {
      next = { selectedCropIds: [], plantCounts: {} };
      applied.push("Cleared the garden");
      continue;
    }

    if (command.kind === "select_all_crops") {
      next = {
        selectedCropIds: (recommendations?.recommendations ?? []).map((crop) => crop.crop_id),
        plantCounts: next.plantCounts,
      };
      applied.push("Added every recommended crop");
      continue;
    }

    const cropId = command.crop_id;
    if (!cropId) continue;
    const label = nameFor(cropId, command.crop, recommendations);
    const inGarden = next.selectedCropIds.includes(cropId);

    switch (command.kind) {
      case "add_crop": {
        if (inGarden) {
          skipped.push(`${label} was already planted`);
          break;
        }
        next = {
          selectedCropIds: [...next.selectedCropIds, cropId],
          plantCounts: {
            ...next.plantCounts,
            [cropId]: countFor(cropId, next, recommendations),
          },
        };
        applied.push(`Added ${label}`);
        break;
      }

      case "remove_crop": {
        if (!inGarden) {
          skipped.push(`${label} wasn't in the garden`);
          break;
        }
        const { [cropId]: _removed, ...rest } = next.plantCounts;
        next = {
          selectedCropIds: next.selectedCropIds.filter((id) => id !== cropId),
          plantCounts: rest,
        };
        applied.push(`Removed ${label}`);
        break;
      }

      case "set_crop_count":
      case "adjust_crop_count":
      case "scale_crop_count": {
        const current = countFor(cropId, next, recommendations);
        let wanted = current;
        if (command.kind === "set_crop_count") wanted = command.plants ?? current;
        if (command.kind === "adjust_crop_count") wanted = current + (command.delta ?? 0);
        if (command.kind === "scale_crop_count") wanted = current * (command.factor ?? 1);
        const plants = clamp(wanted);

        if (plants === 0) {
          const { [cropId]: _dropped, ...rest } = next.plantCounts;
          next = {
            selectedCropIds: next.selectedCropIds.filter((id) => id !== cropId),
            plantCounts: rest,
          };
          applied.push(`Removed ${label}`);
          break;
        }

        next = {
          selectedCropIds: inGarden ? next.selectedCropIds : [...next.selectedCropIds, cropId],
          plantCounts: { ...next.plantCounts, [cropId]: plants },
        };
        applied.push(
          plants === current && inGarden
            ? `${label} already had ${plants} plants`
            : `${label}: ${plants} plant${plants === 1 ? "" : "s"}`,
        );
        break;
      }

      default:
        break;
    }
  }

  return { ...next, applied, skipped, undo: false };
}

/**
 * The crops payload for /api/generate-layout.
 *
 * Built from the selection rather than straight off the recommendations, so a
 * crop added by voice that the recommender never ranked still gets planted —
 * the layout generator looks crops up in crops.json, not in the response.
 */
export function layoutCropsFor(
  selection: GardenSelection,
  recommendations: RecommendCropsResponse | null,
): { crop_id: string; plants: number }[] {
  const materialised = materialiseSelection(selection, recommendations);
  return materialised.selectedCropIds
    .map((cropId) => ({ crop_id: cropId, plants: countFor(cropId, materialised, recommendations) }))
    .filter((crop) => crop.plants > 0);
}

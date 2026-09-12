"use client";

/**
 * Write-through sync between the local garden state and the signed-in
 * account's MongoDB record.
 *
 * Renders nothing. Mounted once in the root layout.
 *
 * The rules are deliberately dull, because the subtle version of this is how
 * people lose a garden plan:
 *
 *   1. Once per load, if the account has a saved garden and this browser does
 *      not, adopt the saved one. (Server wins only over *nothing* — never over
 *      work in progress.)
 *   2. After that, any change to the layout, recommendations or crop selection
 *      is pushed up, debounced. Local is the source of truth while you work.
 *   3. Placed plants are upserted as plantings, so care history survives a
 *      layout regeneration.
 *
 * Signed out, or with storage switched off, every call returns a non-"ok"
 * state and this component quietly does nothing — the localStorage demo path
 * is untouched.
 */

import { useEffect, useRef } from "react";

import { fetchSavedGarden, saveGarden, savePlantings } from "@/lib/api-me";
import { useGardenStore } from "@/lib/store";
import type { Planting } from "@/lib/types";

const DEBOUNCE_MS = 1200;

export function GardenSync() {
  const { state, hydrated, update } = useGardenStore();
  const adopted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // What we last sent, so we don't re-PUT identical state on every render.
  const lastSent = useRef<string>("");

  // 1. Adopt the saved garden, but only into an empty browser.
  useEffect(() => {
    if (!hydrated || adopted.current) return;
    adopted.current = true;

    if (state.layout || state.recommendations) return;

    void (async () => {
      const result = await fetchSavedGarden();
      if (result.state !== "ok" || !result.data) return;
      const saved = result.data;
      update({
        layout: saved.layout ?? null,
        recommendations: saved.recommendations ?? null,
        selectedCropIds: saved.selected_crop_ids ?? [],
      });
    })();
  }, [hydrated, state.layout, state.recommendations, update]);

  // 2 + 3. Push local changes up.
  useEffect(() => {
    if (!hydrated || !adopted.current) return;
    if (!state.layout && !state.recommendations) return;

    const snapshot = JSON.stringify({
      layout: state.layout,
      recommendations: state.recommendations,
      selected: state.selectedCropIds,
    });
    if (snapshot === lastSent.current) return;

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        const result = await saveGarden({
          name: "My garden",
          plot: state.space.plot ?? null,
          garden_type: state.space.garden_type ?? null,
          location: state.location?.label ?? state.space.location ?? null,
          zip_code: state.space.zip_code ?? null,
          selected_crop_ids: state.selectedCropIds,
          layout: state.layout,
          recommendations: state.recommendations,
        });
        if (result.state !== "ok") return;
        lastSent.current = snapshot;

        const plants = state.layout?.plants ?? [];
        if (plants.length === 0) return;
        const plantings: Planting[] = plants.map((plant) => ({
          plant_id: plant.id,
          crop_id: plant.crop_id,
          crop: plant.crop,
          status: "planted",
        }));
        await savePlantings(plantings);
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer.current);
  }, [
    hydrated,
    state.layout,
    state.recommendations,
    state.selectedCropIds,
    state.space,
    state.location,
  ]);

  return null;
}

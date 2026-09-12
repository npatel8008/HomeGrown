"use client";

/**
 * Client-side demo state.
 *
 * Everything the user builds up as they move through the flow lives here and
 * is mirrored into localStorage so a refresh (or a jump straight to /garden)
 * doesn't lose the demo.
 *
 * >>> REPLACE ME <<<
 * Swap the localStorage read/write in `useEffect` for Supabase reads/writes
 * keyed by user id. The shape of `GardenState` is already close to a row per
 * section: households, food_profiles, growing_spaces, recommendations, layouts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DEMO_FREE_TEXT, DEMO_HOUSEHOLD_SIZE, DEMO_MEALS, DEMO_SPACE } from "./demo";
import type {
  Climate,
  ExtractedIngredient,
  GenerateLayoutResponse,
  GrowingSpace,
  Meal,
  RecommendCropsResponse,
  ResolvedLocation,
} from "./types";

const STORAGE_KEY = "gardenai.demo.v1";

export interface GardenState {
  householdSize: number;
  meals: Meal[];
  freeText: string;
  ingredients: ExtractedIngredient[];
  /** `generated_by` from /api/analyze-food — which extractor actually ran. */
  ingredientsSource: string | null;
  space: GrowingSpace;
  /** Resolved from the city/ZIP via /api/location. */
  location: ResolvedLocation | null;
  climate: Climate | null;
  recommendations: RecommendCropsResponse | null;
  /** Crop ids the user has chosen to actually plant. */
  selectedCropIds: string[];
  layout: GenerateLayoutResponse | null;
  /** True once the API answered with bundled data instead of a live backend. */
  offlineMode: boolean;
}

const EMPTY_STATE: GardenState = {
  householdSize: 2,
  meals: [],
  freeText: "",
  ingredients: [],
  ingredientsSource: null,
  space: { ...DEMO_SPACE, location: "", zip_code: "" },
  location: null,
  climate: null,
  recommendations: null,
  selectedCropIds: [],
  layout: null,
  offlineMode: false,
};

interface GardenStore {
  state: GardenState;
  hydrated: boolean;
  update: (patch: Partial<GardenState>) => void;
  /** Fills the whole flow with the seeded demo household. */
  loadDemo: () => void;
  reset: () => void;
  /** Which onboarding steps are complete — drives the progress header. */
  progress: { food: boolean; space: boolean; recommendations: boolean; garden: boolean };
}

const StoreContext = createContext<GardenStore | null>(null);

export function GardenStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GardenState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...EMPTY_STATE, ...(JSON.parse(raw) as GardenState) });
    } catch {
      // Corrupt or unavailable storage just means we start fresh.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing / quota — the demo still works in memory.
    }
  }, [state, hydrated]);

  const update = useCallback((patch: Partial<GardenState>) => {
    setState((previous) => ({ ...previous, ...patch }));
  }, []);

  const loadDemo = useCallback(() => {
    setState((previous) => ({
      ...previous,
      householdSize: DEMO_HOUSEHOLD_SIZE,
      meals: DEMO_MEALS,
      freeText: DEMO_FREE_TEXT,
      space: DEMO_SPACE,
    }));
  }, []);

  const reset = useCallback(() => setState(EMPTY_STATE), []);

  const value = useMemo<GardenStore>(
    () => ({
      state,
      hydrated,
      update,
      loadDemo,
      reset,
      progress: {
        food: state.ingredients.length > 0,
        space: Boolean(state.space.location),
        recommendations: Boolean(state.recommendations),
        garden: Boolean(state.layout),
      },
    }),
    [state, hydrated, update, loadDemo, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useGardenStore(): GardenStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useGardenStore must be used inside <GardenStoreProvider>");
  return store;
}

/**
 * Days since planting per crop, for the demo garden.
 *
 * The whole plot is treated as planted out at the start of the season, so
 * every crop is the same age and the task list varies because crops mature at
 * different rates — fast greens are ready while tomatoes are still weeks off.
 * (Earlier this staggered by list position, which made the task mix depend on
 * the arbitrary order the recommender happened to return.)
 *
 * Replace with real per-planting dates once plantings are persisted.
 */
export function derivePlantings(
  recommendations: RecommendCropsResponse | null,
  seasonDay: number,
  selectedCropIds: string[] = [],
): { crop_id: string; days_since_planting: number }[] {
  if (!recommendations) return [];
  return recommendations.recommendations
    .filter(
      (crop) => selectedCropIds.length === 0 || selectedCropIds.includes(crop.crop_id),
    )
    .map((crop) => ({
      crop_id: crop.crop_id,
      days_since_planting: Math.max(0, seasonDay),
    }));
}

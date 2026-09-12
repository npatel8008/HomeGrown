"use client";

import Link from "next/link";
import { useState } from "react";

import { useGardenStore } from "@/lib/store";
import type { ExtractedIngredient } from "@/lib/types";
import { FoodDemandChart } from "@/components/food/FoodDemandChart";
import { IngredientCard } from "@/components/food/IngredientCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressHeader } from "@/components/layout/ProgressHeader";
import { ArrowRightIcon, PlusIcon } from "@/components/ui/Icons";
import { EngineBadge } from "@/components/ui/EngineBadge";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import fallback from "@/lib/fallback.json";

/** Crop library names, so a manually added ingredient can still be growable. */
const CROP_LIBRARY: { id: string; name: string }[] = (
  fallback.crops as { id: string; name: string }[]
).map((crop) => ({ id: crop.id, name: crop.name }));

export default function FoodProfilePage() {
  const { state, update, hydrated } = useGardenStore();
  const [newIngredient, setNewIngredient] = useState("");

  const setIngredients = (ingredients: ExtractedIngredient[]) => update({ ingredients });

  const addIngredient = () => {
    const name = newIngredient.trim();
    if (!name) return;
    if (state.ingredients.some((item) => item.ingredient.toLowerCase() === name.toLowerCase())) {
      setNewIngredient("");
      return;
    }
    const match = CROP_LIBRARY.find((crop) => crop.name.toLowerCase() === name.toLowerCase());
    setIngredients([
      ...state.ingredients,
      {
        ingredient: match?.name ?? name,
        weekly_usage_score: 50,
        growable: Boolean(match),
        crop_id: match?.id ?? null,
        matched_meals: [],
      },
    ]);
    setNewIngredient("");
  };

  if (hydrated && state.ingredients.length === 0) {
    return (
      <div className="section pt-10">
        <ProgressHeader current="food" />
        <div className="card mt-10 flex flex-col items-center gap-4 p-14 text-center">
          <h1 className="font-display text-2xl text-forest">No food profile yet</h1>
          <p className="max-w-md text-sm text-ink-muted">
            Tell us what your household eats and we&apos;ll build a demand profile of the
            ingredients worth growing.
          </p>
          <Link href="/onboarding/food" className="btn-primary">
            Start with my meals
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    );
  }

  const growable = state.ingredients.filter((item) => item.growable);

  return (
    <div className="section pt-10">
      <ProgressHeader current="food" />

      <div className="mt-8">
        <PageHeader
          eyebrow="Step 1 of 4 · Results"
          title="Your household food-demand profile"
          description={`Extracted from ${state.meals.length} meals for a household of ${state.householdSize}. Remove anything that looks wrong, add what we missed, and drag the sliders if the importance is off.`}
          actions={
            <Link href="/onboarding/space" className="btn-primary">
              Continue to My Growing Space
              <ArrowRightIcon />
            </Link>
          }
        />
      </div>

      {state.offlineMode ? (
        <div className="mt-6">
          <OfflineNotice message="This profile is the bundled demo extraction, not a fresh one — the backend wasn't reachable. Start it to analyze your own meals." />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.15fr] lg:items-start">
        <section className="card p-6 sm:p-7">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg text-forest">Demand at a glance</h2>
            <EngineBadge generatedBy={state.ingredientsSource} />
          </div>
          <p className="mb-5 text-xs text-ink-faint">
            {growable.length} growable ingredients, scored 0-100 by how much your household uses them.
          </p>
          <FoodDemandChart ingredients={state.ingredients} />

          <div className="mt-7 border-t border-line pt-5">
            <label className="label" htmlFor="add-ingredient">
              Add an ingredient we missed
            </label>
            <div className="flex gap-2">
              <input
                id="add-ingredient"
                className="input"
                list="crop-library"
                placeholder="Jalapeño"
                value={newIngredient}
                onChange={(event) => setNewIngredient(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addIngredient();
                  }
                }}
              />
              <datalist id="crop-library">
                {CROP_LIBRARY.map((crop) => (
                  <option key={crop.id} value={crop.name} />
                ))}
              </datalist>
              <button type="button" className="btn-secondary shrink-0" onClick={addIngredient}>
                <PlusIcon />
                Add
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg text-forest">Ingredients</h2>
            <span className="text-xs text-ink-faint">{state.ingredients.length} total</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {state.ingredients.map((ingredient, index) => (
              <IngredientCard
                key={ingredient.ingredient}
                ingredient={ingredient}
                onRemove={() =>
                  setIngredients(state.ingredients.filter((_, position) => position !== index))
                }
                onScoreChange={(score) => {
                  const next = [...state.ingredients];
                  next[index] = { ...next[index], weekly_usage_score: score };
                  setIngredients(next);
                }}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-10 flex justify-end">
        <Link href="/onboarding/space" className="btn-primary !px-7 !py-3.5 text-base">
          Continue to My Growing Space
          <ArrowRightIcon />
        </Link>
      </div>
    </div>
  );
}

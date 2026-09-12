"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { analyzeFood } from "@/lib/api";
import { DEMO_FREE_TEXT, DEMO_HOUSEHOLD_SIZE, DEMO_MEALS } from "@/lib/demo";
import { useGardenStore } from "@/lib/store";
import { MealInput } from "@/components/food/MealInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressHeader } from "@/components/layout/ProgressHeader";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/Icons";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { Spinner } from "@/components/ui/Spinner";

export default function FoodOnboardingPage() {
  const router = useRouter();
  const { state, update, hydrated } = useGardenStore();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const submit = async () => {
    setBusy(true);
    setNotice(undefined);
    const result = await analyzeFood({
      household_size: state.householdSize,
      meals: state.meals,
      free_text: state.freeText,
    });
    update({
      ingredients: result.data.ingredients,
      ingredientsSource: result.data.generated_by,
      ingredientsOffline: result.usedFallback,
    });
    setBusy(false);
    if (result.usedFallback) setNotice(result.error);
    router.push("/profile");
  };

  const canSubmit = state.meals.length > 0 || state.freeText.trim().length > 12;

  return (
    <div className="section pt-10">
      <ProgressHeader current="food" />

      <div className="mt-8">
        <PageHeader
          eyebrow="Step 1 of 4"
          title="What does your household eat?"
          description="Add the meals you cook most often, or just describe a normal week. We use this to work out which ingredients you go through — and therefore which are worth growing."
        />
      </div>

      {notice ? (
        <div className="mt-6">
          <OfflineNotice message={notice} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="card space-y-8 p-6 sm:p-8">
          <section>
            <h2 className="mb-4 font-display text-lg text-forest">Add individual meals</h2>
            <MealInput meals={state.meals} onChange={(meals) => update({ meals })} />
          </section>

          <section className="border-t border-line pt-7">
            <label className="label" htmlFor="free-text">
              Tell us what your household usually eats
            </label>
            <textarea
              id="free-text"
              rows={5}
              className="input resize-y leading-relaxed"
              placeholder="We make tacos twice a week, pasta a few times a week, salads for lunch, and eggs most mornings."
              value={state.freeText}
              onChange={(event) => update({ freeText: event.target.value })}
            />
            <p className="mt-2 text-xs text-ink-faint">
              Free text is read by the ingredient-extraction service. With an{" "}
              <code className="rounded bg-cream-deep px-1 py-0.5">IFM_API_KEY</code> set that&apos;s
              K2; without one it falls back to a built-in keyword matcher.
            </p>
          </section>

          <section className="border-t border-line pt-7">
            <label className="label" htmlFor="household">
              Household size
            </label>
            <div className="flex items-center gap-4">
              <input
                id="household"
                type="range"
                min={1}
                max={10}
                value={state.householdSize}
                onChange={(event) => update({ householdSize: Number(event.target.value) })}
                className="max-w-xs flex-1"
              />
              <span className="rounded-lg bg-sage px-3 py-1.5 text-sm font-semibold text-forest">
                {state.householdSize} {state.householdSize === 1 ? "person" : "people"}
              </span>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-7">
            <button
              type="button"
              className="btn-primary"
              onClick={submit}
              disabled={!hydrated || busy || !canSubmit}
            >
              {busy ? "Reading your meals…" : "Analyze my food habits"}
              {!busy ? <ArrowRightIcon /> : null}
            </button>
            <button
              type="button"
              className="btn-ghost !text-sm"
              onClick={() =>
                update({
                  meals: DEMO_MEALS,
                  freeText: DEMO_FREE_TEXT,
                  householdSize: DEMO_HOUSEHOLD_SIZE,
                })
              }
            >
              <SparkIcon className="h-4 w-4" />
              Fill demo household
            </button>
            {busy ? (
              <Spinner label="Extracting ingredients — AI extraction takes a few seconds" />
            ) : null}
          </div>
        </div>

        <aside className="card space-y-4 bg-sage-tint p-6">
          <h2 className="font-display text-lg text-forest">Why we ask</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            Most garden planners start with what grows well. This one starts with what you buy. A
            crop only earns space if your household actually eats it.
          </p>
          <ul className="space-y-3 text-sm text-forest">
            {[
              ["Tacos", "tomato, cilantro, jalapeño, lettuce"],
              ["Pasta", "tomato, basil"],
              ["Salads", "lettuce, spinach, cucumber, cherry tomato"],
              ["Omelets", "spinach, green onion, bell pepper"],
            ].map(([meal, ingredients]) => (
              <li key={meal} className="rounded-xl bg-white/80 px-3.5 py-3">
                <p className="text-sm font-semibold">{meal}</p>
                <p className="mt-0.5 text-xs text-ink-muted">→ {ingredients}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

import type { Meal } from "@/lib/types";
import { PlusIcon, TrashIcon } from "@/components/ui/Icons";

const SUGGESTIONS = ["Tacos", "Pasta", "Salads", "Omelets", "Stir fry", "Curry", "Sandwiches", "Soup"];

const FREQUENCIES = [1, 2, 3, 4, 5, 7];

/** Add/remove individual meals with a per-week frequency. */
export function MealInput({
  meals,
  onChange,
}: {
  meals: Meal[];
  onChange: (meals: Meal[]) => void;
}) {
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState(2);

  const add = (mealName: string) => {
    const trimmed = mealName.trim();
    if (!trimmed) return;
    const existing = meals.findIndex(
      (meal) => meal.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing >= 0) {
      const next = [...meals];
      next[existing] = { name: next[existing].name, times_per_week: frequency };
      onChange(next);
    } else {
      onChange([...meals, { name: trimmed, times_per_week: frequency }]);
    }
    setName("");
  };

  const setMealFrequency = (index: number, value: number) => {
    const next = [...meals];
    next[index] = { ...next[index], times_per_week: value };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label className="label" htmlFor="meal-name">
            Meal
          </label>
          <input
            id="meal-name"
            className="input"
            placeholder="Tacos"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(name);
              }
            }}
          />
        </div>
        <div className="sm:w-44">
          <label className="label" htmlFor="meal-frequency">
            Frequency
          </label>
          <select
            id="meal-frequency"
            className="input"
            value={frequency}
            onChange={(event) => setFrequency(Number(event.target.value))}
          >
            {FREQUENCIES.map((value) => (
              <option key={value} value={value}>
                {value}× per week
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => add(name)}>
            <PlusIcon />
            Add meal
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.filter(
          (suggestion) => !meals.some((meal) => meal.name.toLowerCase() === suggestion.toLowerCase()),
        ).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="chip transition-colors hover:border-moss/50 hover:bg-sage-tint hover:text-forest"
            onClick={() => add(suggestion)}
          >
            <PlusIcon className="h-3 w-3" />
            {suggestion}
          </button>
        ))}
      </div>

      {meals.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
          {meals.map((meal, index) => (
            <li key={meal.name} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 text-sm font-medium text-forest">{meal.name}</span>
              <select
                aria-label={`${meal.name} frequency`}
                className="rounded-lg border border-line bg-cream px-2.5 py-1.5 text-xs text-ink-muted focus:border-moss focus:outline-none"
                value={meal.times_per_week}
                onChange={(event) => setMealFrequency(index, Number(event.target.value))}
              >
                {FREQUENCIES.map((value) => (
                  <option key={value} value={value}>
                    {value}× per week
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remove ${meal.name}`}
                className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-cream-deep hover:text-earth"
                onClick={() => onChange(meals.filter((_, position) => position !== index))}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-white/60 px-4 py-6 text-center text-sm text-ink-faint">
          No meals added yet. Add a few, or just describe your week in the box below.
        </p>
      )}
    </div>
  );
}

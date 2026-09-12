/** The seeded hackathon demo household. */

import type { GrowingSpace, Meal } from "./types";

export const DEMO_HOUSEHOLD_SIZE = 4;

export const DEMO_MEALS: Meal[] = [
  { name: "Tacos", times_per_week: 2 },
  { name: "Pasta", times_per_week: 2 },
  { name: "Salads", times_per_week: 3 },
  { name: "Omelets", times_per_week: 4 },
];

export const DEMO_FREE_TEXT =
  "We make tacos twice a week, pasta a few times a week, salads for lunch, and eggs most mornings.";

export const DEMO_SPACE: GrowingSpace = {
  location: "Demo City, US",
  zip_code: "00000",
  plot: { width_ft: 12, length_ft: 8, unit: "ft" },
  sunlight: "full-sun",
  garden_type: "raised-beds",
  experience: "beginner",
  budget_usd: 150,
  water_access: "hose",
  notes: "",
};

/** Day of the growing season used by the "Today" dashboard. */
export const DEMO_SEASON_DAY = 34;

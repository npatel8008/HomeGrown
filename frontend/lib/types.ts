/**
 * Typed API contracts — the TypeScript mirror of `backend/models/schemas.py`.
 * There is no codegen step in the scaffold: change one, change the other.
 */

export type SunlightLevel = "full-sun" | "partial-sun" | "mostly-shade";
export type GardenType = "in-ground" | "raised-beds" | "containers" | "balcony";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type WaterAccess = "hose" | "watering-can" | "irrigation" | "limited";
export type Difficulty = "easy" | "medium" | "hard";
export type TaskCategory = "needs-attention" | "coming-soon" | "on-track";

/* ------------------------------------------------------------------ */
/* 0. GET /api/health                                                  */
/* ------------------------------------------------------------------ */

export interface HealthResponse {
  status: string;
  version: string;
  llm: {
    configured: boolean;
    structured_model: string | null;
    prose_model: string | null;
  };
  systems: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* 1. POST /api/analyze-food                                           */
/* ------------------------------------------------------------------ */

export interface Meal {
  name: string;
  times_per_week: number;
}

export interface AnalyzeFoodRequest {
  household_size: number;
  meals: Meal[];
  free_text: string;
}

export interface ExtractedIngredient {
  ingredient: string;
  weekly_usage_score: number;
  growable: boolean;
  crop_id: string | null;
  matched_meals: string[];
}

export interface AnalyzeFoodResponse {
  household_size: number;
  ingredients: ExtractedIngredient[];
  generated_by: string;
}

/* ------------------------------------------------------------------ */
/* 2. POST /api/recommend-crops                                        */
/* ------------------------------------------------------------------ */

export interface PlotSpec {
  width_ft: number;
  length_ft: number;
  unit: string;
}

export interface GrowingSpace {
  location: string;
  zip_code: string;
  plot: PlotSpec;
  sunlight: SunlightLevel;
  garden_type: GardenType;
  experience: ExperienceLevel;
  budget_usd: number;
  water_access: WaterAccess;
  notes: string;
}

export interface RecommendCropsRequest {
  household_size: number;
  ingredients: ExtractedIngredient[];
  space: GrowingSpace;
}

export interface ScoreBreakdown {
  household_demand: number;
  climate_fit: number;
  space_efficiency: number;
  financial_value: number;
  ease_of_growing: number;
}

export interface CropRecommendation {
  crop_id: string;
  name: string;
  category: string;
  rank: number;
  score: number;
  score_breakdown: ScoreBreakdown;
  reason: string;
  plants_recommended: number;
  expected_yield_lbs: number;
  grocery_value_usd: number;
  growing_cost_usd: number;
  savings_usd: number;
  days_to_harvest: number;
  difficulty: Difficulty;
  water_requirement: string;
  space_required_sqft: number;
  color: string;
  image: string;
  description: string;
}

export interface GardenSummary {
  total_area_sqft: number;
  used_area_sqft: number;
  crop_count: number;
  total_plants: number;
  estimated_yield_lbs: number;
  estimated_grocery_value_usd: number;
  estimated_cost_usd: number;
  estimated_savings_usd: number;
  homegrown_coverage_pct: number;
  coverage_explainer: string;
  within_budget: boolean;
}

export interface RecommendCropsResponse {
  summary: GardenSummary;
  recommendations: CropRecommendation[];
  skipped: string[];
  generated_by: string;
}

/* ------------------------------------------------------------------ */
/* 3. POST /api/generate-layout                                        */
/* ------------------------------------------------------------------ */

export interface GenerateLayoutRequest {
  plot: PlotSpec;
  garden_type: GardenType;
  crops: { crop_id: string; plants: number }[];
}

export interface PlacedPlant {
  id: string;
  crop: string;
  crop_id: string;
  x: number;
  z: number;
  height: number;
  spacing_ft: number;
  color: string;
  days_to_harvest: number;
  expected_yield_lbs: number;
  water_requirement: string;
  estimated_value_usd: number;
  status: string;
}

export interface LayoutBed {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  label: string;
}

export interface LayoutPath {
  x: number;
  z: number;
  width: number;
  length: number;
}

export interface LayoutLegendEntry {
  crop_id: string;
  crop: string;
  color: string;
  count: number;
}

export interface GenerateLayoutResponse {
  plot: PlotSpec;
  garden_type: GardenType;
  plants: PlacedPlant[];
  beds: LayoutBed[];
  paths: LayoutPath[];
  legend: LayoutLegendEntry[];
  unplaced: LayoutLegendEntry[];
  generated_by: string;
}

/* ------------------------------------------------------------------ */
/* 4. GET /api/garden-status, GET /api/care-recommendations            */
/* ------------------------------------------------------------------ */

export interface Weather {
  location: string;
  temperature_f: number;
  conditions: string;
  rain_probability_pct: number;
  wind_mph: number;
  forecast_note: string;
  source: string;
}

export interface GardenProgress {
  day_of_season: number;
  season_length_days: number;
  harvest_value_to_date_usd: number;
  projected_seasonal_value_usd: number;
  crops_planted: number;
  next_harvest_crop: string | null;
  next_harvest_in_days: number | null;
}

export interface GardenStatusResponse {
  weather: Weather;
  progress: GardenProgress;
  generated_by: string;
}

export interface CareTask {
  id: string;
  crop_id: string;
  crop: string;
  title: string;
  reason: string;
  category: TaskCategory;
  action: string;
  due_in_days: number;
  color: string;
}

export interface CareRecommendationsResponse {
  weather: Weather;
  tasks: CareTask[];
  counts: Record<string, number>;
  generated_by: string;
}

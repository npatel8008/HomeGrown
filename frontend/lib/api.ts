/**
 * Single place where the frontend talks to the FastAPI backend.
 *
 * Every call degrades gracefully: if the backend is not running (very common
 * five minutes before a demo), we fall back to `lib/fallback.json`, which was
 * captured from the real API for the seeded demo household. Callers get a
 * `usedFallback` flag so the UI can say so honestly instead of pretending.
 */

import fallback from "./fallback.json";
import type {
  AnalyzeFoodRequest,
  HealthResponse,
  AnalyzeFoodResponse,
  CareRecommendationsResponse,
  GardenStatusResponse,
  GenerateLayoutRequest,
  LocationLookupResponse,
  GenerateLayoutResponse,
  RecommendCropsRequest,
  RecommendCropsResponse,
} from "./types";

// Empty by default, so every call is same-origin (`/api/...`). In development
// `next.config.mjs` rewrites those to the FastAPI backend; for a deployment,
// set NEXT_PUBLIC_API_URL to the backend's https:// origin.
//
// This used to default to http://localhost:8000, which quietly broke every
// device that is not the machine running the backend — on a phone, "localhost"
// is the phone. The fetch fails, `request()` catches it, and the app serves
// bundled fallback data while looking perfectly healthy.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

// Only for error messages: "" is correct for fetch but unreadable in a banner.
const API_TARGET_LABEL = API_BASE_URL || "this app's own origin (proxied to the backend)";

// Generous, because the LLM-backed steps (ingredient extraction, crop
// rationales) legitimately take 5-15s. A backend that is simply *down* fails
// instantly with a connection error, so this doesn't delay the offline path.
const REQUEST_TIMEOUT_MS = 60000;

export interface ApiResult<T> {
  data: T;
  usedFallback: boolean;
  error?: string;
}

async function request<T>(path: string, init: RequestInit, offline: T): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return { data: (await response.json()) as T, usedFallback: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      data: offline,
      usedFallback: true,
      error: `Backend unreachable at ${API_TARGET_LABEL} (${message}) — showing bundled demo data.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Which systems are running on a real model vs. a mock. */
export function getHealth() {
  return request<HealthResponse>(
    "/api/health",
    { method: "GET" },
    {
      status: "offline",
      version: "0.1.0",
      llm: { configured: false, structured_model: null, prose_model: null },
      systems: {
        ingredient_extraction: "mock-keywords",
        crop_scoring: "mock-heuristic",
        layout_generation: "mock-shelf-packing",
        care_engine: "mock-rules",
        weather: "mock",
      },
    },
  );
}

/** Geocoding + local climate for a city or postal code. */
export function lookupLocation(city: string, zipCode: string) {
  const query = `?city=${encodeURIComponent(city)}&zip=${encodeURIComponent(zipCode)}`;
  return request<LocationLookupResponse>(
    `/api/location${query}`,
    { method: "GET" },
    fallback.location as LocationLookupResponse,
  );
}

/** SYSTEM 1 — ingredient extraction. */
export function analyzeFood(body: AnalyzeFoodRequest) {
  return request<AnalyzeFoodResponse>(
    "/api/analyze-food",
    { method: "POST", body: JSON.stringify(body) },
    fallback.analyzeFood as AnalyzeFoodResponse,
  );
}

/** SYSTEM 2 — crop recommendation / scoring. */
export function recommendCrops(body: RecommendCropsRequest) {
  return request<RecommendCropsResponse>(
    "/api/recommend-crops",
    { method: "POST", body: JSON.stringify(body) },
    fallback.recommendCrops as RecommendCropsResponse,
  );
}

/** SYSTEM 3 — garden layout generation. */
export function generateLayout(body: GenerateLayoutRequest) {
  return request<GenerateLayoutResponse>(
    "/api/generate-layout",
    { method: "POST", body: JSON.stringify(body) },
    fallback.layout as GenerateLayoutResponse,
  );
}

/** SYSTEM 4 — garden care: season progress. */
export function getGardenStatus(day = 34, location = "", zipCode = "") {
  const query = `?day=${day}&location=${encodeURIComponent(location)}&zip=${encodeURIComponent(zipCode)}`;
  return request<GardenStatusResponse>(
    `/api/garden-status${query}`,
    { method: "GET" },
    fallback.gardenStatus as GardenStatusResponse,
  );
}

/** SYSTEM 4 — garden care: today's tasks. */
export function getCareRecommendations(
  plantings: { crop_id: string; days_since_planting: number }[] = [],
  location = "",
  zipCode = "",
) {
  const crops = plantings
    .map((planting) => `${planting.crop_id}:${planting.days_since_planting}`)
    .join(",");
  const query =
    `?location=${encodeURIComponent(location)}&zip=${encodeURIComponent(zipCode)}` +
    (crops ? `&crops=${crops}` : "");
  return request<CareRecommendationsResponse>(
    `/api/care-recommendations${query}`,
    { method: "GET" },
    fallback.careRecommendations as CareRecommendationsResponse,
  );
}

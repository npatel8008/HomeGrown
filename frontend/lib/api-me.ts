/**
 * Client for the signed-in user's own data.
 *
 * Deliberately separate from `lib/api.ts`, and deliberately NOT using
 * `API_BASE_URL`: these calls must stay same-origin so they hit
 * `app/api/me/[...path]/route.ts`, which is where the Auth0 session is checked
 * and a backend token is attached. Pointing them straight at the backend would
 * strip the identity and the request would be rejected — as it should be.
 *
 * Nothing here sends a user id. The server derives it from the session.
 */

import type {
  CareEvent,
  CareEventOut,
  CareSummaryResponse,
  Planting,
  PlantingOut,
  PlantingStatus,
  SavedGarden,
  SavedGardenOut,
  ScheduleResponse,
  StartGardenRequest,
} from "./types";

/** Why a per-account call could not be served. Drives honest UI copy. */
export type StorageState =
  | "ok"
  | "signed-out" // 401 — not logged in
  | "unavailable" // 503 — auth or MongoDB not configured on the server
  | "error";

export interface MeResult<T> {
  data: T | null;
  state: StorageState;
  error?: string;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<MeResult<T>> {
  try {
    const response = await fetch(`/api/me${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });

    if (response.status === 401) return { data: null, state: "signed-out" };
    if (response.status === 503 || response.status === 502) {
      const detail = await response.text();
      return { data: null, state: "unavailable", error: detail.slice(0, 300) };
    }
    if (!response.ok) {
      return {
        data: null,
        state: "error",
        error: `${response.status} ${response.statusText}`,
      };
    }
    if (response.status === 204) return { data: null, state: "ok" };
    return { data: (await response.json()) as T, state: "ok" };
  } catch (error) {
    return {
      data: null,
      state: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/* ---- the growth schedule ---------------------------------------------- */

/**
 * Put the plan in the ground. Every placed plant in the saved layout becomes
 * a dated planting, and progress is measured from `season_start` onward.
 */
export function startGarden(request: StartGardenRequest = {}) {
  return call<ScheduleResponse>("/garden/start", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/** Where every crop is today, and what to do about it. */
export function fetchSchedule() {
  return call<ScheduleResponse>("/schedule");
}

/* ---- the saved garden ------------------------------------------------- */

export function fetchSavedGarden() {
  return call<SavedGardenOut | null>("/garden");
}

export function saveGarden(garden: Partial<SavedGarden>) {
  // The plot can legitimately be mid-edit in the UI; the schema still requires
  // positive dimensions. Never let a transient value break the save.
  if (garden.plot) {
    const dim = (value: number, fallbackValue: number) =>
      Number.isFinite(value) && value > 0 ? Math.min(200, value) : fallbackValue;
    garden = {
      ...garden,
      plot: {
        ...garden.plot,
        width_ft: dim(garden.plot.width_ft, 12),
        length_ft: dim(garden.plot.length_ft, 8),
        unit: garden.plot.unit || "ft",
      },
    };
  }
  return call<SavedGardenOut>("/garden", { method: "PUT", body: JSON.stringify(garden) });
}

/* ---- what is in the ground -------------------------------------------- */

export function fetchPlantings() {
  return call<PlantingOut[]>("/plantings");
}

export function savePlantings(plantings: Planting[]) {
  return call<PlantingOut[]>("/plantings", {
    method: "POST",
    body: JSON.stringify({ plantings }),
  });
}

export function updatePlanting(
  plantId: string,
  patch: { status?: PlantingStatus; planted_on?: string; notes?: string },
) {
  return call<PlantingOut>(`/plantings/${encodeURIComponent(plantId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/* ---- the care record --------------------------------------------------- */

export function fetchCareEvents(params: { crop_id?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.crop_id) query.set("crop_id", params.crop_id);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query}` : "";
  return call<CareEventOut[]>(`/care-events${suffix}`);
}

export function logCareEvent(event: CareEvent) {
  return call<CareEventOut>("/care-events", { method: "POST", body: JSON.stringify(event) });
}

export function deleteCareEvent(eventId: string) {
  return call<null>(`/care-events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

export function fetchCareSummary() {
  return call<CareSummaryResponse>("/care-summary");
}

/** Erase everything this account owns. */
export function deleteMyData() {
  return call<{ deleted: Record<string, number> }>("/data", { method: "DELETE" });
}

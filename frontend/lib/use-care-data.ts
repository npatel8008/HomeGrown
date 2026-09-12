"use client";

/**
 * The signed-in user's care record.
 *
 * Loads from MongoDB through /api/me/*, and reports *why* it has nothing when
 * it has nothing — signed out, storage not configured, or a real error. The UI
 * says which, rather than silently showing an empty list that looks like "you
 * have never watered anything".
 */

import { useCallback, useEffect, useState } from "react";

import { fetchCareSummary, logCareEvent, type StorageState } from "./api-me";
import type { CareEvent, CareSummaryResponse, CareEventKind, CareTask } from "./types";

/** care_engine task actions → what we record as having been done. */
const ACTION_TO_KIND: Record<string, CareEventKind> = {
  water: "watered",
  "check-moisture": "note",
  prune: "pruned",
  support: "note",
  observe: "note",
  fertilize: "fertilized",
  harvest: "harvested",
};

export function careEventForTask(task: CareTask): CareEvent {
  return {
    kind: ACTION_TO_KIND[task.action] ?? "note",
    crop_id: task.crop_id,
    crop: task.crop,
    task_id: task.id,
    note: task.title,
  };
}

export function useCareData() {
  const [summary, setSummary] = useState<CareSummaryResponse | null>(null);
  const [state, setState] = useState<StorageState>("ok");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchCareSummary();
    setSummary(result.data);
    setState(result.state);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const log = useCallback(
    async (event: CareEvent) => {
      const result = await logCareEvent(event);
      if (result.state === "ok") {
        await reload();
      } else {
        setState(result.state);
      }
      return result;
    },
    [reload],
  );

  return { summary, state, loading, reload, log };
}

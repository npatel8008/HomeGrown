"use client";

/**
 * The signed-in user's dated garden.
 *
 * Like `use-care-data`, this reports *why* it has nothing — signed out,
 * storage off, or simply not started yet — so the UI can say which instead of
 * showing an empty list that reads like "your garden is doing nothing".
 */

import { useCallback, useEffect, useState } from "react";

import { fetchSchedule, startGarden, type StorageState } from "./api-me";
import type { ScheduleResponse } from "./types";

export function useSchedule() {
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [state, setState] = useState<StorageState>("ok");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchSchedule();
    setSchedule(result.data);
    setState(result.state);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** `seasonStart` is a Date, or omitted for "today". */
  const start = useCallback(
    async (seasonStart?: Date) => {
      setStarting(true);
      const result = await startGarden(
        seasonStart ? { season_start: seasonStart.toISOString() } : {},
      );
      if (result.data) setSchedule(result.data);
      setState(result.state);
      setStarting(false);
      return result;
    },
    [],
  );

  return {
    schedule,
    state,
    loading,
    starting,
    reload,
    start,
    /** True only when storage is on AND a season has actually been started. */
    started: state === "ok" && Boolean(schedule?.started),
  };
}

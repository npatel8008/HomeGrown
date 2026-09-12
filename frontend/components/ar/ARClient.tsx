"use client";

/**
 * Client half of the AR route: pulls the current layout out of the store and
 * hands it to the AR screen.
 *
 * The layout is whatever the planner produced — and for a signed-in user with
 * a saved garden, `GardenSync` will have already restored it, so opening this
 * on a phone after signing in shows the garden they planned on a laptop.
 */

import { DEMO_SEASON_DAY } from "@/lib/demo";
import { useGardenStore } from "@/lib/store";
import { ARScreen } from "./ARScreen";

export function ARClient() {
  const { state, hydrated } = useGardenStore();

  if (!hydrated) {
    return (
      <div className="section flex min-h-[60vh] items-center justify-center">
        <span className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sage-deep border-t-forest" />
          Loading your garden…
        </span>
      </div>
    );
  }

  return <ARScreen layout={state.layout} seasonDay={DEMO_SEASON_DAY} />;
}

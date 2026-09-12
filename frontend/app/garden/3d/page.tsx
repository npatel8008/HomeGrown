"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";

import { DEMO_SEASON_DAY } from "@/lib/demo";
import { useGardenStore } from "@/lib/store";
import type { SceneClock } from "@/components/garden/Garden3D";
import { SceneControls } from "@/components/garden/SceneControls";
import type { PlacedPlant } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlantDetailsPanel } from "@/components/garden/PlantDetailsPanel";
import { PlantLegend } from "@/components/garden/GardenGrid";
import { ArrowRightIcon, GridIcon } from "@/components/ui/Icons";

// three.js is client-only and heavy — keep it out of the server bundle.
const Garden3D = dynamic(() => import("@/components/garden/Garden3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] w-full items-center justify-center rounded-card border border-line bg-sage-tint">
      <span className="flex items-center gap-3 text-sm text-ink-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-sage-deep border-t-forest" />
        Loading 3D garden…
      </span>
    </div>
  ),
});

const SEASON_LENGTH_DAYS = 150;

export default function Garden3DPage() {
  const { state, hydrated } = useGardenStore();
  const [selected, setSelected] = useState<PlacedPlant | null>(null);

  // Held in a ref, not state: the scrubber and the render loop share it so
  // dragging never re-renders the plants.
  const clockRef = useRef<SceneClock>({ day: DEMO_SEASON_DAY, timeOfDay: 0.5 });

  if (hydrated && !state.layout) {
    return (
      <div className="section pt-10">
        <div className="card mt-6 flex flex-col items-center gap-4 p-14 text-center">
          <h1 className="font-display text-2xl text-forest">Nothing to visualize yet</h1>
          <p className="max-w-md text-sm text-ink-muted">
            Generate a garden layout first — the 3D scene renders the same layout JSON as the 2D
            planner.
          </p>
          <Link href="/garden" className="btn-primary">
            Go to the garden plan
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    );
  }

  const layout = state.layout;

  return (
    <div className="section pt-10">
      <PageHeader
        eyebrow="Garden visualization"
        title="Walk through your garden"
        description="Rotate, zoom and pan. Click any plant for its harvest timeline and value."
        actions={
          <Link href="/garden" className="btn-secondary">
            <GridIcon className="h-4 w-4" />
            2D planner
          </Link>
        }
      />

      {layout ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          <div className="space-y-4">
            <Garden3D
              layout={layout}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              clockRef={clockRef}
            />
            <SceneControls
              layout={layout}
              clockRef={clockRef}
              seasonLength={SEASON_LENGTH_DAYS}
              initialDay={DEMO_SEASON_DAY}
            />
            <p className="text-xs leading-relaxed text-ink-faint">
              Plants are procedural geometry sized from each crop&apos;s mature height, with a
              per-plant seed so no two are identical. Growth is driven by each crop&apos;s{" "}
              <code className="rounded bg-cream-deep px-1 py-0.5">days_to_harvest</code>. Positions,
              spacing and bed geometry come from{" "}
              <code className="rounded bg-cream-deep px-1 py-0.5">POST /api/generate-layout</code> —
              the same response the 2D planner draws.
            </p>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24">
            <PlantDetailsPanel plant={selected} onClose={() => setSelected(null)} />
            <PlantLegend layout={layout} />
          </div>
        </div>
      ) : null}

      <div className="mt-10 flex justify-end">
        <Link href="/today" className="btn-primary !px-7 !py-3.5 text-base">
          See what to do today
          <ArrowRightIcon />
        </Link>
      </div>
    </div>
  );
}

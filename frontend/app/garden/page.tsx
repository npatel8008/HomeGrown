"use client";

import Link from "next/link";
import { useState } from "react";

import { generateLayout } from "@/lib/api";
import { layoutCropsFor } from "@/lib/garden-commands";
import { sqft } from "@/lib/format";
import { useGardenStore } from "@/lib/store";
import type { PlacedPlant } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressHeader } from "@/components/layout/ProgressHeader";
import { GardenGrid, PlantLegend } from "@/components/garden/GardenGrid";
import { PlantDetailsPanel } from "@/components/garden/PlantDetailsPanel";
import { ArrowRightIcon, CubeIcon } from "@/components/ui/Icons";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { VoiceGardenControl } from "@/components/voice/VoiceGardenControl";

export default function GardenPlanPage() {
  const { state, update, hydrated } = useGardenStore();
  const [selected, setSelected] = useState<PlacedPlant | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const regenerate = async () => {
    if (!state.recommendations) return;
    setBusy(true);
    const result = await generateLayout({
      plot: state.space.plot,
      garden_type: state.space.garden_type,
      // Shared with the voice control, so a spoken edit and a clicked one
      // build the identical request.
      crops: layoutCropsFor(
        { selectedCropIds: state.selectedCropIds, plantCounts: state.plantCounts },
        state.recommendations,
      ),
    });
    update({ layout: result.data, offlineMode: result.usedFallback });
    setSelected(null);
    setBusy(false);
    setNotice(result.usedFallback ? result.error : undefined);
  };

  if (hydrated && !state.layout) {
    return (
      <div className="section pt-10">
        <ProgressHeader current="garden" />
        <div className="card mt-10 flex flex-col items-center gap-4 p-14 text-center">
          <h1 className="font-display text-2xl text-forest">No garden layout yet</h1>
          <p className="max-w-md text-sm text-ink-muted">
            {state.recommendations
              ? "You have crop recommendations — generate a layout to place them in your plot."
              : "Finish the food and space steps first, then we'll place every plant for you."}
          </p>
          {state.recommendations ? (
            <button type="button" className="btn-primary" onClick={regenerate} disabled={busy}>
              {busy ? "Planning…" : "Generate garden layout"}
              {!busy ? <ArrowRightIcon /> : null}
            </button>
          ) : (
            <Link href="/onboarding/food" className="btn-primary">
              Start the flow
              <ArrowRightIcon />
            </Link>
          )}
        </div>
      </div>
    );
  }

  const layout = state.layout;

  return (
    <div className="section pt-10">
      <ProgressHeader current="garden" />

      <div className="mt-8">
        <PageHeader
          eyebrow="Step 4 of 4"
          title="Your garden plan"
          description="Every plant placed by spacing rules, tall crops at the back. The 3D view reads this exact layout."
          actions={
            <>
              <button type="button" className="btn-secondary" onClick={regenerate} disabled={busy}>
                {busy ? "Replanning…" : "Regenerate"}
              </button>
              <Link href="/garden/3d" className="btn-primary">
                <CubeIcon className="h-4 w-4" />
                View in 3D
              </Link>
            </>
          }
        />
      </div>

      {notice ? (
        <div className="mt-6">
          <OfflineNotice message={notice} />
        </div>
      ) : null}

      {layout ? (
        <>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
            <GardenGrid layout={layout} selectedId={selected?.id ?? null} onSelect={setSelected} />

            <div className="space-y-4 lg:sticky lg:top-24">
              <VoiceGardenControl />
              <PlantDetailsPanel plant={selected} onClose={() => setSelected(null)} />
              <PlantLegend layout={layout} />
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-4">
            <Fact label="Plot" value={`${layout.plot.width_ft} × ${layout.plot.length_ft} ft`} />
            <Fact label="Plants placed" value={`${layout.plants.length}`} />
            <Fact label="Beds" value={`${layout.beds.length}`} />
            <Fact
              label="Bed area"
              value={sqft(layout.beds.reduce((total, bed) => total + bed.width * bed.length, 0))}
            />
          </dl>

          <div className="mt-10 flex justify-end">
            <Link href="/garden/3d" className="btn-primary !px-7 !py-3.5 text-base">
              Explore in 3D
              <ArrowRightIcon />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-quiet px-5 py-4">
      <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-1 font-display text-xl text-forest">{value}</dd>
    </div>
  );
}

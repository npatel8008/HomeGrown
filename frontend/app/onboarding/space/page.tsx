"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { recommendCrops } from "@/lib/api";
import { DEMO_SPACE } from "@/lib/demo";
import { useGardenStore } from "@/lib/store";
import type { GrowingSpace } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressHeader } from "@/components/layout/ProgressHeader";
import {
  GARDEN_TYPE_OPTIONS,
  GrowingSpaceForm,
} from "@/components/space/GrowingSpaceForm";
import { PlotPreview } from "@/components/space/PlotPreview";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/Icons";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { Spinner } from "@/components/ui/Spinner";

export default function GrowingSpacePage() {
  const router = useRouter();
  const { state, update, hydrated } = useGardenStore();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const patchSpace = (patch: Partial<GrowingSpace>) =>
    update({ space: { ...state.space, ...patch } });

  const submit = async () => {
    setBusy(true);
    setNotice(undefined);
    const result = await recommendCrops({
      household_size: state.householdSize,
      ingredients: state.ingredients,
      space: { ...state.space, location: state.space.location || "Demo City, US" },
    });
    update({
      recommendations: result.data,
      offlineMode: result.usedFallback,
      // A new plan invalidates the old layout.
      layout: null,
    });
    setBusy(false);
    if (result.usedFallback) setNotice(result.error);
    router.push("/recommendations");
  };

  const gardenTypeLabel =
    GARDEN_TYPE_OPTIONS.find((option) => option.value === state.space.garden_type)?.label ??
    "Raised beds";

  return (
    <div className="section pt-10">
      <ProgressHeader current="space" />

      <div className="mt-8">
        <PageHeader
          eyebrow="Step 2 of 4"
          title="Your growing space"
          description="Dimensions, light and budget decide what's realistic. Everything here feeds the crop-scoring service."
        />
      </div>

      {notice ? (
        <div className="mt-6">
          <OfflineNotice message={notice} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="card p-6 sm:p-8">
          <GrowingSpaceForm space={state.space} onChange={patchSpace} />

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-7">
            <button type="button" className="btn-primary" onClick={submit} disabled={!hydrated || busy}>
              {busy ? "Scoring crops…" : "Get my crop recommendations"}
              {!busy ? <ArrowRightIcon /> : null}
            </button>
            <button
              type="button"
              className="btn-ghost !text-sm"
              onClick={() => update({ space: DEMO_SPACE })}
            >
              <SparkIcon className="h-4 w-4" />
              Use demo space
            </button>
            {busy ? (
              <Spinner label="Ranking crops and writing your rationales" />
            ) : null}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          <PlotPreview
            width={state.space.plot.width_ft}
            length={state.space.plot.length_ft}
            sunlight={state.space.sunlight}
            gardenTypeLabel={gardenTypeLabel}
          />
          <div className="card-quiet p-5 text-xs leading-relaxed text-ink-muted">
            <p className="mb-2 font-semibold text-forest">What happens next</p>
            <p>
              Your plot area minus paths and margins becomes the plantable budget. Crops are ranked
              on demand, light fit, space efficiency, financial value and ease, then allocated
              plants until the space or your ${state.space.budget_usd} budget runs out.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

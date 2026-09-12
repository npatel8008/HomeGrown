"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { generateLayout } from "@/lib/api";
import { useGardenStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressHeader } from "@/components/layout/ProgressHeader";
import { CropRecommendationCard } from "@/components/recommendations/CropRecommendationCard";
import { HomegrownCoverageCard } from "@/components/recommendations/HomegrownCoverageCard";
import { SavingsSummary } from "@/components/recommendations/SavingsSummary";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { EngineBadge } from "@/components/ui/EngineBadge";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { Spinner } from "@/components/ui/Spinner";

export default function RecommendationsPage() {
  const router = useRouter();
  const { state, update, hydrated } = useGardenStore();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const buildLayout = async () => {
    if (!state.recommendations) return;
    setBusy(true);
    const result = await generateLayout({
      plot: state.space.plot,
      garden_type: state.space.garden_type,
      crops: state.recommendations.recommendations.map((crop) => ({
        crop_id: crop.crop_id,
        plants: crop.plants_recommended,
      })),
    });
    update({ layout: result.data, offlineMode: result.usedFallback });
    setBusy(false);
    if (result.usedFallback) setNotice(result.error);
    router.push("/garden");
  };

  if (hydrated && !state.recommendations) {
    return (
      <div className="section pt-10">
        <ProgressHeader current="recommendations" />
        <div className="card mt-10 flex flex-col items-center gap-4 p-14 text-center">
          <h1 className="font-display text-2xl text-forest">No recommendations yet</h1>
          <p className="max-w-md text-sm text-ink-muted">
            Add your food habits and growing space and we&apos;ll rank the crops worth your square
            footage.
          </p>
          <Link href="/onboarding/food" className="btn-primary">
            Start the flow
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    );
  }

  const data = state.recommendations;

  return (
    <div className="section pt-10">
      <ProgressHeader current="recommendations" />

      <div className="mt-8">
        <PageHeader
          eyebrow="Step 3 of 4"
          title="Your personalized crop plan"
          description={
            data
              ? `${data.summary.crop_count} crops and ${data.summary.total_plants} plants, chosen for a household of ${state.householdSize} on ${data.summary.total_area_sqft} sq ft.`
              : undefined
          }
          actions={
            <button type="button" className="btn-primary" onClick={buildLayout} disabled={busy}>
              {busy ? "Placing plants…" : "Generate garden layout"}
              {!busy ? <ArrowRightIcon /> : null}
            </button>
          }
        />
      </div>

      {notice ? (
        <div className="mt-6">
          <OfflineNotice message={notice} />
        </div>
      ) : null}
      {state.offlineMode && !notice ? (
        <div className="mt-6">
          <OfflineNotice message="These numbers came from the bundled demo dataset because the backend wasn't reachable." />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-8">
            <SavingsSummary summary={data.summary} />
          </div>

          <div className="mt-6">
            <HomegrownCoverageCard summary={data.summary} />
          </div>

          <section className="mt-12">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-2xl text-forest">Recommended crops</h2>
                  <EngineBadge generatedBy={data.generated_by} />
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  Ranked by a weighted score across five factors. Open any card to see the breakdown.
                </p>
              </div>
              {busy ? <Spinner label="Placing plants" /> : null}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              {data.recommendations.map((crop) => (
                <CropRecommendationCard key={crop.crop_id} crop={crop} />
              ))}
            </div>

            {data.skipped.length > 0 ? (
              <p className="mt-6 rounded-card border border-line bg-white/70 px-5 py-4 text-xs text-ink-muted">
                <span className="font-semibold text-forest">Left out this season: </span>
                {data.skipped.join(", ")} — either your household doesn&apos;t use them much, they
                don&apos;t suit your light, or the space ran out first.
              </p>
            ) : null}
          </section>

          <div className="mt-10 flex flex-wrap justify-end gap-3">
            <Link href="/onboarding/space" className="btn-secondary">
              Adjust my space
            </Link>
            <button
              type="button"
              className="btn-primary !px-7 !py-3.5 text-base"
              onClick={buildLayout}
              disabled={busy}
            >
              Generate garden layout
              <ArrowRightIcon />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

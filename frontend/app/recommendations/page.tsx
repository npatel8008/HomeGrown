"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { generateLayout } from "@/lib/api";
import { layoutCropsFor } from "@/lib/garden-commands";
import { summarizeSelection } from "@/lib/selection";
import { useGardenStore } from "@/lib/store";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressHeader } from "@/components/layout/ProgressHeader";
import { CropRecommendationCard } from "@/components/recommendations/CropRecommendationCard";
import { HomegrownCoverageCard } from "@/components/recommendations/HomegrownCoverageCard";
import { SavingsSummary } from "@/components/recommendations/SavingsSummary";
import { ClimateCard } from "@/components/space/ClimateCard";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { EngineBadge } from "@/components/ui/EngineBadge";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { Spinner } from "@/components/ui/Spinner";

export default function RecommendationsPage() {
  const router = useRouter();
  const { state, update, hydrated } = useGardenStore();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const data = state.recommendations;

  // Default to everything selected for plans made before selection existed.
  const selectedIds = useMemo(() => {
    if (!data) return [];
    if (state.selectedCropIds.length > 0) {
      const valid = new Set(data.recommendations.map((crop) => crop.crop_id));
      return state.selectedCropIds.filter((id) => valid.has(id));
    }
    return data.recommendations.map((crop) => crop.crop_id);
  }, [data, state.selectedCropIds]);

  const summary = useMemo(
    () => (data ? summarizeSelection(data.summary, data.recommendations, selectedIds) : null),
    [data, selectedIds],
  );

  const toggleCrop = (cropId: string, next: boolean) => {
    const set = new Set(selectedIds);
    if (next) set.add(cropId);
    else set.delete(cropId);
    update({ selectedCropIds: Array.from(set), layout: null });
  };

  const setAll = (on: boolean) =>
    update({
      selectedCropIds: on && data ? data.recommendations.map((crop) => crop.crop_id) : [],
      layout: null,
    });

  const buildLayout = async () => {
    if (!data) return;
    setBusy(true);
    const result = await generateLayout({
      plot: state.space.plot,
      garden_type: state.space.garden_type,
      // Same builder the planner and the voice control use, so any per-crop
      // counts set by voice survive a regeneration from this page.
      crops: layoutCropsFor({ selectedCropIds: selectedIds, plantCounts: state.plantCounts }, data),
    });
    update({ layout: result.data, layoutOffline: result.usedFallback });
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

  return (
    <div className="section pt-10">
      <ProgressHeader current="recommendations" />

      <div className="mt-8">
        <PageHeader
          eyebrow="Step 3 of 4"
          title="Your personalized crop plan"
          description={
            summary
              ? `${summary.crop_count} of ${data?.recommendations.length} crops selected — ` +
                `${summary.total_plants} plants for a household of ${state.householdSize} on ` +
                `${summary.total_area_sqft} sq ft${
                  data?.location?.resolved ? ` in ${data.location.label}` : ""
                }.`
              : undefined
          }
          actions={
            <button
              type="button"
              className="btn-primary"
              onClick={buildLayout}
              disabled={busy || selectedIds.length === 0}
            >
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
      {state.recommendationsOffline && !notice ? (
        <div className="mt-6">
          <OfflineNotice message="These numbers came from the bundled demo dataset, not your backend. Regenerate from your growing space to use live data." />
        </div>
      ) : null}

      {data && summary ? (
        <>
          <div className="mt-8">
            <SavingsSummary summary={summary} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
            <HomegrownCoverageCard summary={summary} />
            <ClimateCard location={data.location} climate={data.climate} loading={false} />
          </div>

          <section className="mt-12">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-2xl text-forest">Recommended crops</h2>
                  <EngineBadge generatedBy={data.generated_by} />
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  Ranked by a weighted score across five factors. Untick anything you don&apos;t
                  want and the totals update — only what&apos;s ticked gets planted.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {busy ? <Spinner label="Placing plants" /> : null}
                <button type="button" className="btn-secondary !py-2 !text-xs" onClick={() => setAll(true)}>
                  Select all
                </button>
                <button type="button" className="btn-ghost !py-2 !text-xs" onClick={() => setAll(false)}>
                  Clear
                </button>
              </div>
            </div>

            {selectedIds.length === 0 ? (
              <p className="mb-5 rounded-card border border-[#F0DDBB] bg-[#FDF7EC] px-5 py-4 text-sm text-[#7A5418]">
                Nothing selected — pick at least one crop to generate a garden layout.
              </p>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-2">
              {data.recommendations.map((crop) => (
                <CropRecommendationCard
                  key={crop.crop_id}
                  crop={crop}
                  selected={selectedIds.includes(crop.crop_id)}
                  onToggle={toggleCrop}
                />
              ))}
            </div>

            {data.skipped.length > 0 ? (
              <div className="mt-6 rounded-card border border-line bg-white/70 px-5 py-4">
                <p className="mb-2.5 text-xs font-semibold text-forest">Left out this season</p>
                <ul className="space-y-1.5">
                  {data.skipped.map((item) => (
                    <li key={item.crop_id} className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span className="font-medium text-forest">{item.name}</span>
                      <span
                        className={
                          item.kind === "climate"
                            ? "rounded-pill bg-[#FBEDE3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#A0522A]"
                            : "rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint"
                        }
                      >
                        {item.kind}
                      </span>
                      <span className="text-ink-muted">{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
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

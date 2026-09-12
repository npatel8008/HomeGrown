"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { lookupLocation, recommendCrops } from "@/lib/api";
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
import { ClimateCard } from "@/components/space/ClimateCard";
import { LocationInput, type LocationMode } from "@/components/space/LocationInput";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/Icons";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { Spinner } from "@/components/ui/Spinner";

export default function GrowingSpacePage() {
  const router = useRouter();
  const { state, update, hydrated } = useGardenStore();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [locating, setLocating] = useState(false);
  const [mode, setMode] = useState<LocationMode>("zip");
  const [cityQuery, setCityQuery] = useState("");
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>();

  const zipInput = state.space.zip_code;

  // Restore the right input mode for a plan made earlier.
  useEffect(() => {
    if (!hydrated) return;
    if (!state.space.zip_code && state.space.location) {
      setMode("city");
      setCityQuery(state.space.location);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Resolve to real coordinates and climate, debounced so we aren't geocoding
  // on every keystroke. The city is derived from the result, never typed.
  useEffect(() => {
    if (!hydrated) return;

    const query = mode === "zip" ? zipInput.trim() : cityQuery.trim();
    const ready = mode === "zip" ? /^\d{5}$/.test(query) : query.length >= 3;
    if (!ready) {
      if (!query) update({ location: null, climate: null });
      return;
    }

    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(async () => {
      setLocating(true);
      const result = await lookupLocation(
        mode === "city" ? query : "",
        mode === "zip" ? query : "",
      );
      const found = result.data.location;
      update({
        location: found,
        climate: result.data.climate,
        // Keep the space in sync: the city is whatever the geocoder resolved,
        // so what's shown is exactly what the scoring engine will use.
        space: {
          ...state.space,
          zip_code: mode === "zip" ? query : "",
          location: found.resolved ? `${found.name}${found.region ? `, ${found.region}` : ""}` : "",
        },
      });
      setLocating(false);
    }, 600);

    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zipInput, cityQuery, mode, hydrated]);

  const patchSpace = (patch: Partial<GrowingSpace>) =>
    update({ space: { ...state.space, ...patch } });

  const submit = async () => {
    setBusy(true);
    setNotice(undefined);
    const result = await recommendCrops({
      household_size: state.householdSize,
      ingredients: state.ingredients,
      space: state.space,
    });
    update({
      recommendations: result.data,
      location: result.data.location ?? state.location,
      climate: result.data.climate ?? state.climate,
      // Everything is selected to begin with; the user prunes from there.
      selectedCropIds: result.data.recommendations.map((crop) => crop.crop_id),
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
          description="Your ZIP decides the frost dates and season length, which matter more than anything else here. Dimensions, budget and experience do the rest."
        />
      </div>

      {notice ? (
        <div className="mt-6">
          <OfflineNotice message={notice} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="card space-y-7 p-6 sm:p-8">
          <LocationInput
            mode={mode}
            onModeChange={(next) => {
              setMode(next);
              if (next === "zip") setCityQuery("");
              else patchSpace({ zip_code: "" });
              update({ location: null, climate: null });
            }}
            zipCode={state.space.zip_code}
            cityQuery={cityQuery}
            onZipChange={(value) => patchSpace({ zip_code: value })}
            onCityChange={setCityQuery}
            resolved={state.location}
            locating={locating}
          />

          <GrowingSpaceForm space={state.space} onChange={patchSpace} />

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-7">
            <button
              type="button"
              className="btn-primary"
              onClick={submit}
              disabled={!hydrated || busy || !state.location?.resolved}
            >
              {busy ? "Scoring crops…" : "Get my crop recommendations"}
              {!busy ? <ArrowRightIcon /> : null}
            </button>
            <button
              type="button"
              className="btn-ghost !text-sm"
              onClick={() => {
                setMode("zip");
                setCityQuery("");
                update({ space: DEMO_SPACE });
              }}
            >
              <SparkIcon className="h-4 w-4" />
              Use demo space
            </button>
            {!state.location?.resolved && !locating ? (
              <span className="text-xs text-ink-faint">
                Enter a ZIP code to continue — we need it for your frost dates.
              </span>
            ) : null}
            {busy ? (
              <Spinner label="Ranking crops and writing your rationales" />
            ) : null}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          <ClimateCard location={state.location} climate={state.climate} loading={locating} />
          <PlotPreview
            width={state.space.plot.width_ft}
            length={state.space.plot.length_ft}
            gardenTypeLabel={gardenTypeLabel}
          />
          <div className="card-quiet p-5 text-xs leading-relaxed text-ink-muted">
            <p className="mb-2 font-semibold text-forest">What happens next</p>
            <p>
              Your plot area minus paths and margins becomes the plantable budget. Crops are ranked
              on household demand, local climate fit, space efficiency, financial value and ease,
              then allocated plants until the space or your ${state.space.budget_usd} budget runs
              out. Anything that can&apos;t reach harvest before your first frost is dropped.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

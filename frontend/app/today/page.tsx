"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getCareRecommendations, getGardenStatus } from "@/lib/api";
import { DEMO_SEASON_DAY } from "@/lib/demo";
import { usd } from "@/lib/format";
import { derivePlantings, useGardenStore } from "@/lib/store";
import { careEventForTask, useCareData } from "@/lib/use-care-data";
import { useSchedule } from "@/lib/use-schedule";
import { CropProgressCard } from "@/components/today/CropProgressCard";
import type {
  CareRecommendationsResponse,
  CareTask,
  GardenStatusResponse,
  TaskCategory,
} from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { CareRecordCard } from "@/components/today/CareRecordCard";
import { GardenTaskCard } from "@/components/today/GardenTaskCard";
import { WeatherCard } from "@/components/today/WeatherCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ArrowRightIcon } from "@/components/ui/Icons";
import { OfflineNotice } from "@/components/ui/OfflineNotice";
import { Spinner } from "@/components/ui/Spinner";

const GROUPS: { key: TaskCategory; title: string; hint: string }[] = [
  { key: "needs-attention", title: "Needs attention", hint: "Do these today" },
  { key: "coming-soon", title: "Coming soon", hint: "This week" },
  { key: "on-track", title: "Healthy / on track", hint: "Nothing to do" },
];

export default function TodayPage() {
  const { state, hydrated } = useGardenStore();
  const [status, setStatus] = useState<GardenStatusResponse | null>(null);
  const [care, setCare] = useState<CareRecommendationsResponse | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const care_ = useCareData();
  // The dated garden, if this account has started one. When it has, it is the
  // source of truth and the demo day-counter below is not used at all.
  const sched = useSchedule();

  const location = state.space.location;
  const zipCode = state.space.zip_code;
  const label = state.location?.label || location || "your area";

  const load = useCallback(async () => {
    setLoading(true);
    const plantings = derivePlantings(
      state.recommendations,
      DEMO_SEASON_DAY,
      state.selectedCropIds,
    );
    const [statusResult, careResult] = await Promise.all([
      getGardenStatus(DEMO_SEASON_DAY, location, zipCode),
      getCareRecommendations(plantings, location, zipCode),
    ]);
    setStatus(statusResult.data);
    setCare(careResult.data);
    setNotice(statusResult.usedFallback ? statusResult.error : undefined);
    setLoading(false);
  }, [state.recommendations, state.selectedCropIds, location, zipCode]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  // Only offer "mark done" when there is an account to record it against.
  const completeTask =
    care_.state === "ok"
      ? async (task: CareTask) => {
          await care_.log(careEventForTask(task));
          // Watering or harvesting changes the schedule, so pull it again.
          if (sched.started) await sched.reload();
        }
      : undefined;

  // Prefer the real, dated schedule over the demo counter wherever we have it.
  const live = sched.started ? sched.schedule : null;
  const tasks = live ? live.tasks : care?.tasks ?? [];
  const weather = live?.weather ?? care?.weather ?? null;

  const dayOfSeason = live ? live.day_of_season : status?.progress.day_of_season ?? 0;
  const seasonLength = live
    ? live.season_length_days
    : status?.progress.season_length_days ?? 1;
  const seasonPct = (dayOfSeason / Math.max(1, seasonLength)) * 100;
  const harvestedValue = live
    ? live.harvested_value_usd
    : status?.progress.harvest_value_to_date_usd ?? 0;
  const projectedValue = live
    ? live.projected_value_usd
    : status?.progress.projected_seasonal_value_usd ?? 0;
  const nextUp = live
    ? live.crops.find((crop) => !crop.harvest_open)
    : null;

  return (
    <div className="section pt-10">
      <PageHeader
        eyebrow="Ongoing care"
        title="Your Garden Today"
        description={
          live
            ? `${label} · day ${live.day_of_season} · ${live.crops.length} crops tracked from your planting date`
            : `${label} · ${
                care
                  ? `${care.tasks.length} crops checked against the live forecast`
                  : "Loading forecast"
              }`
        }
        actions={
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
        }
      />

      {notice ? (
        <div className="mt-6">
          <OfflineNotice message={notice} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.6fr] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-24">
          {weather ? <WeatherCard weather={weather} /> : null}

          {live || status ? (
            <section className="card p-6">
              <h2 className="font-display text-lg text-forest">Garden progress</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Day {dayOfSeason} of a {seasonLength}-day growing season
                {live?.season_start
                  ? ` · planted ${new Date(live.season_start).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`
                  : " (demo timeline)"}
              </p>
              <ProgressBar value={seasonPct} className="mt-4" height="h-2.5" />

              <dl className="mt-6 space-y-4">
                <div className="flex items-baseline justify-between">
                  <dt className="text-sm text-ink-muted">
                    {live ? "Harvested so far" : "Harvest value so far"}
                  </dt>
                  <dd className="font-display text-2xl text-forest">{usd(harvestedValue)}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-sm text-ink-muted">Projected seasonal value</dt>
                  <dd className="font-display text-2xl text-moss-dark">{usd(projectedValue)}</dd>
                </div>
              </dl>

              {live && nextUp ? (
                <p className="mt-5 rounded-xl bg-sage-tint px-4 py-3 text-sm text-forest">
                  Next up: <span className="font-semibold">{nextUp.crop}</span> in about{" "}
                  {nextUp.days_until_harvest} days.
                </p>
              ) : !live && status?.progress.next_harvest_crop ? (
                <p className="mt-5 rounded-xl bg-sage-tint px-4 py-3 text-sm text-forest">
                  Next up:{" "}
                  <span className="font-semibold">{status.progress.next_harvest_crop}</span> in
                  about {status.progress.next_harvest_in_days} days.
                </p>
              ) : null}
            </section>
          ) : null}

          <CareRecordCard summary={care_.summary} state={care_.state} />

          {!state.recommendations ? (
            <div className="card-quiet p-5 text-sm text-ink-muted">
              <p className="mb-3">
                You&apos;re seeing the seeded demo garden. Build your own plan to get tasks for the
                crops you actually planted.
              </p>
              <Link href="/onboarding/food" className="btn-secondary !py-2 !text-xs">
                Build my garden
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
        </div>

        <div className="space-y-8">
          {loading && !care ? <Spinner label="Checking your garden" /> : null}

          {tasks.length > 0
            ? GROUPS.map((group) => {
                const groupTasks = tasks.filter((task) => task.category === group.key);
                if (groupTasks.length === 0) return null;
                return (
                  <section key={group.key}>
                    <div className="mb-3 flex items-baseline gap-3">
                      <h2 className="font-display text-xl text-forest">{group.title}</h2>
                      <span className="chip">{groupTasks.length}</span>
                      <span className="text-xs text-ink-faint">{group.hint}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {groupTasks.map((task) => (
                        <GardenTaskCard key={task.id} task={task} onComplete={completeTask} />
                      ))}
                    </div>
                  </section>
                );
              })
            : null}

          {live && live.crops.length > 0 ? (
            <section>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="font-display text-xl text-forest">Crop progress</h2>
                <span className="chip">{live.crops.length}</span>
                <span className="text-xs text-ink-faint">
                  Measured from your planting date
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {live.crops.map((crop) => (
                  <CropProgressCard key={crop.crop_id} crop={crop} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Not tracking yet — say what's missing rather than nothing. */}
          {!live && sched.state === "ok" && !sched.loading && state.layout ? (
            <div className="card-quiet flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-forest">This is a demo timeline.</span> Start
                your garden to track real dates, watering intervals and harvest windows.
              </p>
              <Link href="/garden" className="btn-secondary !py-2 !text-xs shrink-0">
                Start growing
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}

          {care && care.tasks.length === 0 && !live ? (
            <p className="card p-10 text-center text-sm text-ink-muted">
              Nothing planted yet — your task list will fill in once you generate a garden plan.
            </p>
          ) : null}

          <p className="rounded-card border border-line bg-white/70 px-5 py-4 text-xs leading-relaxed text-ink-muted">
            <span className="font-semibold text-forest">Where the intelligence goes: </span>
            once a season is started, progress comes from{" "}
            <code className="rounded bg-cream-deep px-1 py-0.5">backend/services/growth_schedule.py</code>{" "}
            using your real planting date and the live forecast; the horticultural rules still
            live in{" "}
            <code className="rounded bg-cream-deep px-1 py-0.5">care_engine.py</code>. Watering
            intervals are a lookup table nudged by temperature and rain; a soil-moisture
            balance from evapotranspiration is the natural next step.
          </p>
        </div>
      </div>
    </div>
  );
}

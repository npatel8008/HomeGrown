"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getCareRecommendations, getGardenStatus } from "@/lib/api";
import { DEMO_SEASON_DAY } from "@/lib/demo";
import { usd } from "@/lib/format";
import { derivePlantings, useGardenStore } from "@/lib/store";
import type { CareRecommendationsResponse, GardenStatusResponse, TaskCategory } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";
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

  const location = state.space.location || "Demo City, US";

  const load = useCallback(async () => {
    setLoading(true);
    const plantings = derivePlantings(state.recommendations, DEMO_SEASON_DAY);
    const [statusResult, careResult] = await Promise.all([
      getGardenStatus(DEMO_SEASON_DAY, location),
      getCareRecommendations(plantings, location),
    ]);
    setStatus(statusResult.data);
    setCare(careResult.data);
    setNotice(statusResult.usedFallback ? statusResult.error : undefined);
    setLoading(false);
  }, [state.recommendations, location]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  const progress = status?.progress;
  const seasonPct = progress
    ? (progress.day_of_season / Math.max(1, progress.season_length_days)) * 100
    : 0;

  return (
    <div className="section pt-10">
      <PageHeader
        eyebrow="Ongoing care"
        title="Your Garden Today"
        description={`${location} · ${
          care ? `${care.tasks.length} crops checked against today's forecast` : "Loading forecast"
        }`}
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
          {care ? <WeatherCard weather={care.weather} /> : null}

          {progress ? (
            <section className="card p-6">
              <h2 className="font-display text-lg text-forest">Garden progress</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Day {progress.day_of_season} of a {progress.season_length_days}-day growing season
              </p>
              <ProgressBar value={seasonPct} className="mt-4" height="h-2.5" />

              <dl className="mt-6 space-y-4">
                <div className="flex items-baseline justify-between">
                  <dt className="text-sm text-ink-muted">Harvest value so far</dt>
                  <dd className="font-display text-2xl text-forest">
                    {usd(progress.harvest_value_to_date_usd)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-sm text-ink-muted">Projected seasonal value</dt>
                  <dd className="font-display text-2xl text-moss-dark">
                    {usd(progress.projected_seasonal_value_usd)}
                  </dd>
                </div>
              </dl>

              {progress.next_harvest_crop ? (
                <p className="mt-5 rounded-xl bg-sage-tint px-4 py-3 text-sm text-forest">
                  Next up:{" "}
                  <span className="font-semibold">{progress.next_harvest_crop}</span> in about{" "}
                  {progress.next_harvest_in_days} days.
                </p>
              ) : null}
            </section>
          ) : null}

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

          {care
            ? GROUPS.map((group) => {
                const tasks = care.tasks.filter((task) => task.category === group.key);
                if (tasks.length === 0) return null;
                return (
                  <section key={group.key}>
                    <div className="mb-3 flex items-baseline gap-3">
                      <h2 className="font-display text-xl text-forest">{group.title}</h2>
                      <span className="chip">{tasks.length}</span>
                      <span className="text-xs text-ink-faint">{group.hint}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {tasks.map((task) => (
                        <GardenTaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  </section>
                );
              })
            : null}

          {care && care.tasks.length === 0 ? (
            <p className="card p-10 text-center text-sm text-ink-muted">
              Nothing planted yet — your task list will fill in once you generate a garden plan.
            </p>
          ) : null}

          <p className="rounded-card border border-line bg-white/70 px-5 py-4 text-xs leading-relaxed text-ink-muted">
            <span className="font-semibold text-forest">Where the intelligence goes: </span>
            tasks come from{" "}
            <code className="rounded bg-cream-deep px-1 py-0.5">backend/services/care_engine.py</code>,
            which currently uses a fixed mock forecast plus days-since-planting rules. Point{" "}
            <code className="rounded bg-cream-deep px-1 py-0.5">get_weather()</code> at a real
            provider and the rest keeps working.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * What this account has actually done in the garden, from MongoDB.
 *
 * Every state is spelled out: signed out, storage switched off, or a real
 * record. An empty card that could mean any of the three would be worse than
 * useless — it would look like data loss.
 */

import Link from "next/link";

import { loginHref } from "@/lib/auth-user";
import { usd } from "@/lib/format";
import type { StorageState } from "@/lib/api-me";
import type { CareSummaryResponse } from "@/lib/types";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const hours = Math.floor((Date.now() - then) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function CareRecordCard({
  summary,
  state,
}: {
  summary: CareSummaryResponse | null;
  state: StorageState;
}) {
  if (state === "signed-out") {
    return (
      <section className="card-quiet p-5 text-sm text-ink-muted">
        <h2 className="font-display text-base text-forest">Your care record</h2>
        <p className="mt-2">
          Sign in and every watering, feeding and harvest is saved to your account — so the
          garden remembers what you did, on any device.
        </p>
        <Link href={loginHref("/today")} className="btn-secondary mt-3 !py-2 !text-xs">
          Log in to start tracking
        </Link>
      </section>
    );
  }

  if (state !== "ok") {
    return (
      <section className="card-quiet p-5 text-sm text-ink-muted">
        <h2 className="font-display text-base text-forest">Your care record</h2>
        <p className="mt-2">
          Per-account storage is not switched on for this server, so nothing you mark as done is
          being saved. See <code className="rounded bg-cream-deep px-1 py-0.5">MONGODB_URI</code> in{" "}
          <code className="rounded bg-cream-deep px-1 py-0.5">backend/.env</code>.
        </p>
      </section>
    );
  }

  const crops = summary?.crops ?? [];

  return (
    <section className="card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-forest">Your care record</h2>
        <span className="chip">{crops.length}</span>
      </div>

      {summary && summary.total_harvested_lbs > 0 ? (
        <p className="mt-3 rounded-xl bg-sage-tint px-4 py-3 text-sm text-forest">
          Harvested <span className="font-semibold">{summary.total_harvested_lbs} lbs</span> so far,
          worth about{" "}
          <span className="font-semibold">{usd(summary.total_harvested_value_usd)}</span>.
        </p>
      ) : null}

      {crops.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Nothing logged yet. Mark a task done and it will show up here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {crops.map((crop) => (
            <li key={crop.crop_id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-forest">{crop.crop ?? crop.crop_id}</span>
              <span className="text-xs text-ink-muted">
                watered {timeAgo(crop.last_watered)}
                {crop.harvested_lbs > 0 ? ` · ${crop.harvested_lbs} lbs picked` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

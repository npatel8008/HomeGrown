import { lbs, usd } from "@/lib/format";
import { CountUp } from "@/components/ui/CountUp";
import type { GardenSummary } from "@/lib/types";

/** The signature metric: how much of the household's produce the garden covers. */
export function HomegrownCoverageCard({ summary }: { summary: GardenSummary }) {
  const coverage = Math.max(0, Math.min(100, summary.homegrown_coverage_pct));

  return (
    <section className="card overflow-hidden bg-forest text-cream">
      <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="relative mx-auto h-40 w-40">
          <svg viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(251,250,245,0.16)" strokeWidth="12" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="#8FD69C"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 52}
              strokeDashoffset={2 * Math.PI * 52 * (1 - coverage / 100)}
              className="transition-[stroke-dashoffset] duration-[1200ms] ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl leading-none">
              <CountUp
                value={coverage}
                durationMs={1200}
                format={(value) => `${Math.round(value)}%`}
              />
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.16em] text-cream/60">covered</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8FD69C]">
            Homegrown coverage
          </p>
          <h2 className="mt-2 font-display text-2xl leading-snug sm:text-[28px]">
            {summary.coverage_explainer}
          </h2>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-cream/60">Produce grown</dt>
              <dd className="font-display text-xl">{lbs(summary.estimated_yield_lbs)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-cream/60">Grocery value</dt>
              <dd className="font-display text-xl">{usd(summary.estimated_grocery_value_usd)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-cream/60">Net savings</dt>
              <dd className="font-display text-xl text-[#8FD69C]">{usd(summary.estimated_savings_usd)}</dd>
            </div>
          </dl>
          <p className="mt-5 text-[11px] leading-relaxed text-cream/50">
            Estimate only. Based on typical yields and retail produce prices, and an assumed
            7 lbs of produce per person per week.
          </p>
        </div>
      </div>
    </section>
  );
}

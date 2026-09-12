import { cx } from "@/lib/format";
import type { ScoreBreakdown } from "@/lib/types";

const LABELS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "household_demand", label: "Household demand" },
  { key: "climate_fit", label: "Local climate fit" },
  { key: "space_efficiency", label: "Space efficiency" },
  { key: "financial_value", label: "Financial value" },
  { key: "ease_of_growing", label: "Ease of growing" },
];

/** Circular 0-100 score dial. */
export function ScoreDial({
  score,
  size = 76,
  color = "#4A8F5F",
}: {
  score: number;
  size?: number;
  color?: string;
}) {
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E3E5DA" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg leading-none text-forest">{score}</span>
        <span className="text-[9px] uppercase tracking-wide text-ink-faint">/ 100</span>
      </div>
    </div>
  );
}

/** The five score components, so the recommendation is never a black box. */
export function RecommendationScore({
  breakdown,
  className,
}: {
  breakdown: ScoreBreakdown;
  className?: string;
}) {
  return (
    <dl className={cx("space-y-2", className)}>
      {LABELS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-3">
          <dt className="w-36 shrink-0 text-[11px] text-ink-muted">{label}</dt>
          <dd className="flex flex-1 items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-sage-deep/50">
              <span
                className="block h-full rounded-pill bg-moss"
                style={{ width: `${Math.max(2, Math.min(100, breakdown[key]))}%` }}
              />
            </span>
            <span className="w-7 text-right text-[11px] font-semibold text-forest">
              {Math.round(breakdown[key])}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

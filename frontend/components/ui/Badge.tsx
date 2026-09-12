import type { ReactNode } from "react";
import { cx } from "@/lib/format";

const TONES = {
  neutral: "bg-cream-deep text-ink-muted border-line",
  green: "bg-sage text-forest border-sage-deep",
  earth: "bg-earth-tint text-earth border-earth-light",
  solid: "bg-forest text-cream border-forest",
  warn: "bg-[#FDF3E3] text-[#93611F] border-[#F0DDBB]",
} as const;

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Difficulty gets its own consistent colour language across the app. */
export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const tone = difficulty === "easy" ? "green" : difficulty === "medium" ? "warn" : "earth";
  return <Badge tone={tone}>{difficulty[0].toUpperCase() + difficulty.slice(1)}</Badge>;
}

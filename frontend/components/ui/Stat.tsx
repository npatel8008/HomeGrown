import type { ReactNode } from "react";
import { cx } from "@/lib/format";

export function Stat({
  label,
  value,
  sub,
  icon,
  accent = "sage",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  accent?: "sage" | "earth" | "forest";
}) {
  const accents = {
    sage: "bg-sage text-forest",
    earth: "bg-earth-tint text-earth",
    forest: "bg-forest text-cream",
  } as const;

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
        {icon ? (
          <span className={cx("flex h-8 w-8 items-center justify-center rounded-full", accents[accent])}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="font-display text-3xl leading-none text-forest">{value}</div>
      {sub ? <p className="text-xs leading-relaxed text-ink-muted">{sub}</p> : null}
    </div>
  );
}

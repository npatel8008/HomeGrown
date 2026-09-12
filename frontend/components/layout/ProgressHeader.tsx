"use client";

import Link from "next/link";

import { cx } from "@/lib/format";
import { useGardenStore } from "@/lib/store";
import { CheckIcon } from "@/components/ui/Icons";

export type FlowStep = "food" | "space" | "recommendations" | "garden";

const STEPS: { key: FlowStep; label: string; href: string }[] = [
  { key: "food", label: "Food", href: "/onboarding/food" },
  { key: "space", label: "Space", href: "/onboarding/space" },
  { key: "recommendations", label: "Recommendations", href: "/recommendations" },
  { key: "garden", label: "Garden", href: "/garden" },
];

/** The 1-2-3-4 onboarding indicator shown above every step in the flow. */
export function ProgressHeader({ current }: { current: FlowStep }) {
  const { progress } = useGardenStore();
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="flex w-full flex-wrap items-center gap-y-3">
      {STEPS.map((step, index) => {
        const complete = progress[step.key] && index < currentIndex;
        const active = step.key === current;
        const reachable = complete || active || index <= currentIndex;

        const content = (
          <span
            className={cx(
              "flex items-center gap-2.5 rounded-pill py-1.5 pl-1.5 pr-4 transition-colors",
              active && "bg-forest text-cream",
              !active && complete && "text-forest hover:bg-sage",
              !active && !complete && "text-ink-faint",
            )}
          >
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                active && "bg-cream text-forest",
                !active && complete && "bg-moss text-white",
                !active && !complete && "border border-line bg-white text-ink-faint",
              )}
            >
              {complete ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className="text-sm font-medium">{step.label}</span>
          </span>
        );

        return (
          <li key={step.key} className="flex items-center">
            {reachable ? <Link href={step.href}>{content}</Link> : content}
            {index < STEPS.length - 1 ? (
              <span
                className={cx(
                  "mx-1 h-px w-6 sm:w-10",
                  index < currentIndex ? "bg-moss" : "bg-line",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

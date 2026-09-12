"use client";

import { useState } from "react";

import { cx } from "@/lib/format";
import type { CareTask } from "@/lib/types";
import { AlertIcon, CheckIcon, ClockIcon } from "@/components/ui/Icons";

const CATEGORY_STYLE = {
  "needs-attention": {
    label: "Needs attention",
    ring: "border-l-[#C9622F]",
    pill: "bg-[#FBEDE3] text-[#A0522A]",
    icon: <AlertIcon className="h-4 w-4" />,
  },
  "coming-soon": {
    label: "Coming soon",
    ring: "border-l-[#D2A03C]",
    pill: "bg-[#FBF3E1] text-[#8B6417]",
    icon: <ClockIcon className="h-4 w-4" />,
  },
  "on-track": {
    label: "On track",
    ring: "border-l-moss",
    pill: "bg-sage text-forest",
    icon: <CheckIcon className="h-4 w-4" />,
  },
} as const;

export function GardenTaskCard({
  task,
  onComplete,
}: {
  task: CareTask;
  /** Records the task as done against the signed-in account. Omitted when
   *  there is nobody to record it for, which is why the button disappears
   *  rather than failing on click. */
  onComplete?: (task: CareTask) => Promise<void>;
}) {
  const style = CATEGORY_STYLE[task.category];
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const complete = async () => {
    if (!onComplete || saving || done) return;
    setSaving(true);
    try {
      await onComplete(task);
      setDone(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={cx("card border-l-4 p-5 transition-shadow hover:shadow-lift", style.ring)}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg"
          style={{ backgroundColor: task.color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base text-forest">{task.crop}</h3>
            <span
              className={cx(
                "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                style.pill,
              )}
            >
              {style.icon}
              {style.label}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-forest">{task.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{task.reason}</p>

          {onComplete ? (
            <button
              type="button"
              onClick={complete}
              disabled={saving || done}
              className={cx(
                "mt-3 inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[11px] font-semibold transition-colors",
                done
                  ? "bg-sage text-forest"
                  : "border border-line bg-white text-ink-muted hover:border-moss hover:text-forest",
              )}
            >
              <CheckIcon className="h-3.5 w-3.5" />
              {done ? "Logged" : saving ? "Saving…" : "Mark done"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

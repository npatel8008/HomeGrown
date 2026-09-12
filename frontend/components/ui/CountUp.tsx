"use client";

import { useCountUp } from "@/lib/motion";

/**
 * A number that animates up from zero on mount.
 * Renders the final value immediately when the OS asks for reduced motion.
 */
export function CountUp({
  value,
  format,
  durationMs,
}: {
  value: number;
  /** Formatter for the in-flight value — usd(), lbs(), sqft(), etc. */
  format: (value: number) => string;
  durationMs?: number;
}) {
  const current = useCountUp(value, durationMs);
  return <>{format(current)}</>;
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Honour the OS "reduce motion" setting.
 *
 * Everything decorative in the app checks this: sway, camera easing, autoplay,
 * count-ups and staggered entrances all switch off. User-driven controls (the
 * season scrubber) keep working — they're not unsolicited movement.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * Animate a number up from zero on mount.
 *
 * Returns the target immediately when motion is reduced, or when the tab is
 * hidden — browsers pause requestAnimationFrame in background tabs, and a
 * headline metric stuck at "$0" is far worse than one that never animated.
 * A timer also snaps to the target if the frame loop stalls for any reason.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = usePrefersReducedMotion();
  const skip = reduced || (typeof document !== "undefined" && document.hidden);
  const [value, setValue] = useState(skip ? target : 0);
  const frame = useRef<number>();
  const safety = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (skip) {
      setValue(target);
      return;
    }

    const started = performance.now();
    const tick = (now: number) => {
      const t = clamp01((now - started) / durationMs);
      setValue(target * easeOutCubic(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    // Belt and braces: if rAF is throttled or never fires, land on the real
    // number anyway rather than sitting at zero.
    safety.current = setTimeout(() => setValue(target), durationMs + 400);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (safety.current) clearTimeout(safety.current);
    };
  }, [target, durationMs, skip]);

  return value;
}

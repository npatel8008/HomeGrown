"use client";

/**
 * Phone orientation, for pointing the AR camera.
 *
 * Readings land in a ref rather than React state on purpose: these fire at
 * 60Hz, and putting them through `setState` would re-render the whole scene
 * sixty times a second to move a camera the render loop could have read
 * directly.
 *
 * iOS specifics, all of which are load-bearing:
 *   - `DeviceOrientationEvent.requestPermission()` exists only on iOS and must
 *     be called from inside a user gesture, or it rejects.
 *   - Even with permission, Safari's Settings → Motion & Orientation Access can
 *     be off at the OS level, in which case the events simply never arrive.
 *     That is why `state` becomes "silent" if nothing has been heard shortly
 *     after granting — the UI offers drag-to-look instead of freezing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type OrientationState =
  | "idle"
  | "granted"
  | "denied"
  | "unsupported"
  /** Permission was given, but no events are arriving. */
  | "silent";

export interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
  /** Screen rotation, radians. */
  screen: number;
  received: boolean;
}

const DEGREES = Math.PI / 180;
/** Low-pass factor — raw readings jitter enough to look broken. */
const SMOOTHING = 0.22;
/** If nothing has arrived by now, orientation is not actually working. */
const SILENCE_TIMEOUT_MS = 1500;

function screenAngle(): number {
  if (typeof window === "undefined") return 0;
  const angle =
    window.screen?.orientation?.angle ??
    // Older Safari.
    (window as unknown as { orientation?: number }).orientation ??
    0;
  return (angle as number) * DEGREES;
}

/** Shortest path between two angles, so wrapping past ±180° doesn't spin. */
function blendAngle(current: number, next: number, factor: number): number {
  let delta = next - current;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return current + delta * factor;
}

export function useDeviceOrientation() {
  const sample = useRef<OrientationSample>({
    alpha: 0,
    beta: Math.PI / 2, // phone held upright
    gamma: 0,
    screen: 0,
    received: false,
  });
  const [state, setState] = useState<OrientationState>("idle");
  const listening = useRef(false);
  // Mirrors `state` for the event handler, which would otherwise close over a
  // stale value and never notice it had given up.
  const stateRef = useRef<OrientationState>("idle");

  const moveTo = useCallback((next: OrientationState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const handle = useCallback((event: DeviceOrientationEvent) => {
    if (event.alpha === null && event.beta === null && event.gamma === null) return;
    const next = sample.current;
    const alpha = (event.alpha ?? 0) * DEGREES;
    const beta = (event.beta ?? 0) * DEGREES;
    const gamma = (event.gamma ?? 0) * DEGREES;

    if (!next.received) {
      next.alpha = alpha;
      next.beta = beta;
      next.gamma = gamma;
    } else {
      next.alpha = blendAngle(next.alpha, alpha, SMOOTHING);
      next.beta = blendAngle(next.beta, beta, SMOOTHING);
      next.gamma = blendAngle(next.gamma, gamma, SMOOTHING);
    }
    next.screen = screenAngle();
    next.received = true;

    // Readings can start arriving after we had concluded none were coming —
    // a slow device, or the user granting motion access on a second attempt.
    // Recover instead of leaving them dragging with working sensors.
    if (stateRef.current === "silent") moveTo("granted");
  }, [moveTo]);

  const start = useCallback(async (): Promise<OrientationState> => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      moveTo("unsupported");
      return "unsupported";
    }

    const requestPermission = (
      window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      }
    ).requestPermission;

    if (typeof requestPermission === "function") {
      try {
        const result = await requestPermission();
        if (result !== "granted") {
          moveTo("denied");
          return "denied";
        }
      } catch {
        // Thrown when not called from a user gesture.
        moveTo("denied");
        return "denied";
      }
    }

    if (!listening.current) {
      // `absolute` is compass-referenced where available; either works here
      // because the garden is placed relative to where you are looking.
      window.addEventListener("deviceorientationabsolute", handle as EventListener, true);
      window.addEventListener("deviceorientation", handle as EventListener, true);
      listening.current = true;
    }

    moveTo("granted");

    // Confirm events actually arrive — permission granted is not the same as
    // motion access being switched on at the OS level.
    window.setTimeout(() => {
      if (!sample.current.received) moveTo("silent");
    }, SILENCE_TIMEOUT_MS);

    return "granted";
  }, [handle, moveTo]);

  useEffect(() => {
    return () => {
      if (!listening.current) return;
      window.removeEventListener("deviceorientationabsolute", handle as EventListener, true);
      window.removeEventListener("deviceorientation", handle as EventListener, true);
      listening.current = false;
    };
  }, [handle]);

  return { sample, state, start };
}

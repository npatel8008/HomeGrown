"use client";

/**
 * Can this device do real, world-tracked AR in the browser?
 *
 * The honest answer is platform-dependent and worth stating plainly:
 *
 *   Android / Chrome  — yes. WebXR `immersive-ar` is backed by ARCore, which
 *                       gives 6DOF tracking, plane detection and hit testing.
 *   iOS (any browser) — no. Apple has never shipped WebXR `immersive-ar`, and
 *                       every iOS browser is required to use WebKit, so Chrome
 *                       and Firefox there are Safari with a different toolbar
 *                       and inherit the same gap. The only true AR on iOS is
 *                       AR Quick Look, which needs a USDZ file and takes over
 *                       the screen.
 *   Desktop           — no, and there is no camera pose to track anyway.
 *
 * Everything else — orientation-only overlays included — is a preview, not
 * AR, and this app says so rather than pretending.
 */

import { useEffect, useState } from "react";

export type ARSupport =
  /** Still asking the browser. */
  | "checking"
  /** WebXR immersive-ar with hit testing: the real thing. */
  | "webxr"
  /** No WebXR. A rotation-only preview is the best available. */
  | "preview-only";

export function useARSupport(): ARSupport {
  const [support, setSupport] = useState<ARSupport>("checking");

  useEffect(() => {
    let cancelled = false;

    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr?.isSessionSupported) {
      setSupport("preview-only");
      return;
    }

    xr.isSessionSupported("immersive-ar")
      .then((ok) => {
        if (!cancelled) setSupport(ok ? "webxr" : "preview-only");
      })
      .catch(() => {
        if (!cancelled) setSupport("preview-only");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return support;
}

/** What the session needs, and what it will use if offered. */
export function arSessionInit(overlayRoot: HTMLElement | null): XRSessionInit {
  return {
    // Without hit testing there is nowhere to put the garden.
    requiredFeatures: ["hit-test", "local-floor"],
    optionalFeatures: [
      // Lets the placed garden hold its spot as tracking refines itself.
      "anchors",
      // Keeps our own React UI on screen during the session.
      ...(overlayRoot ? ["dom-overlay"] : []),
    ],
    ...(overlayRoot ? { domOverlay: { root: overlayRoot } } : {}),
  } as XRSessionInit;
}

/** True on a phone, where this feature is actually meant to be used. */
export function isProbablyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

/** iOS specifically, so the UI can explain *why* rather than just refusing. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac, but with touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

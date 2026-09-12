"use client";

/**
 * Client half of the AR route: pulls the current layout out of the store and
 * hands it to the AR screen.
 *
 * The layout is whatever the planner produced — and for a signed-in user with
 * a saved garden, `GardenSync` will have already restored it, so opening this
 * on a phone after signing in shows the garden they planned on a laptop.
 */

import { DEMO_SEASON_DAY } from "@/lib/demo";
import { useGardenStore } from "@/lib/store";
import { ARScreen } from "./ARScreen";
import { ARWorldScreen } from "./ARWorldScreen";
import { isIOS, useARSupport } from "./useARSupport";

export function ARClient() {
  const { state, hydrated } = useGardenStore();
  const support = useARSupport();

  if (!hydrated || support === "checking") {
    return (
      <div className="section flex min-h-[60vh] items-center justify-center">
        <span className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sage-deep border-t-forest" />
          Loading your garden…
        </span>
      </div>
    );
  }

  // Real, world-tracked AR when the device can do it. Everything else gets
  // the rotation-only preview, labelled as a preview rather than sold as AR.
  if (support === "webxr" && state.layout) {
    return (
      <div className="section space-y-4 pt-6">
        <ARWorldScreen layout={state.layout} seasonDay={DEMO_SEASON_DAY} />
        <p className="text-xs leading-relaxed text-ink-faint">
          Point at the floor until the ring appears, then tap to place. Once placed, the garden is
          anchored to that spot on the real floor — walk around it and the view changes with you.
        </p>
      </div>
    );
  }

  return (
    <>
      {support === "preview-only" ? <PreviewNotice /> : null}
      <ARScreen layout={state.layout} seasonDay={DEMO_SEASON_DAY} />
    </>
  );
}

/**
 * Says plainly that this is not world-tracked AR, and why.
 *
 * The distinction matters: the preview cannot keep the garden on a spot of
 * floor while you walk, and finding that out by trying is worse than being
 * told.
 */
function PreviewNotice() {
  const ios = isIOS();
  return (
    <div className="section pt-6">
      <div className="flex items-start gap-3 rounded-card border border-[#F0DDBB] bg-[#FDF7EC] px-4 py-3.5 text-sm text-[#7A5418]">
        <span aria-hidden="true" className="mt-0.5 text-base leading-none">
          ⚠
        </span>
        <div>
          <p className="font-semibold">Preview mode — not world-tracked AR</p>
          <p className="mt-1 text-xs leading-relaxed">
            {ios
              ? "Safari on iOS doesn't support WebXR, so the garden can only follow the phone's rotation. Look around and it holds its bearing, but walking won't move you relative to it. Chrome on an Android device gives the full version: tap the floor to place the garden and walk around it."
              : "This device or browser has no WebXR AR support, so the garden follows the phone's rotation only — walking won't move you relative to it. Chrome on a recent Android phone gives the full version."}
          </p>
        </div>
      </div>
    </div>
  );
}

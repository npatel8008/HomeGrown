"use client";

/**
 * The WebXR AR screen: start a session, find the floor, place the garden,
 * then walk around it.
 *
 * Everything the user sees during the session lives in `overlayRef`, which is
 * handed to WebXR as the `dom-overlay` root. That is how ordinary React UI
 * survives on top of an immersive session.
 */

import { ARButton } from "@react-three/xr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { usePrefersReducedMotion } from "@/lib/motion";
import type { SceneClock } from "@/components/garden/Garden3D";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { PlantDetailsPanel } from "@/components/garden/PlantDetailsPanel";
import type { ScaleChange } from "@/lib/use-voice-garden";
import { ARVoiceControl } from "./ARVoiceControl";
import { ARWorldCanvas, createWorldPlacement, type WorldPlacement } from "./ARWorldView";
import { arSessionInit } from "./useARSupport";

const MIN_SIZE = 1 / 24;
const MAX_SIZE = 1;

export function ARWorldScreen({
  layout,
  seasonDay,
}: {
  layout: GenerateLayoutResponse;
  seasonDay: number;
}) {
  // Callback ref into state, not useRef: the session needs this element, and
  // a ref assignment would not re-render to rebuild `sessionInit`.
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const clockRef = useRef<SceneClock>({ day: seasonDay, timeOfDay: 0.5 });

  const [placement, setPlacement] = useState<WorldPlacement>(createWorldPlacement);
  const [size, setSize] = useState(1);
  const [hasSurface, setHasSurface] = useState(false);
  const [selected, setSelected] = useState<PlacedPlant | null>(null);
  const [placeSignal, setPlaceSignal] = useState(0);

  // Rebuilt once the overlay element exists, so the session is told about it.
  const sessionInit = useMemo(() => arSessionInit(overlay), [overlay]);

  const reset = useCallback(() => {
    setPlacement(createWorldPlacement());
    setSelected(null);
  }, []);

  const rotate = useCallback((radians: number) => {
    setPlacement((previous) =>
      previous.placed ? { ...previous, yaw: previous.yaw + radians } : previous,
    );
  }, []);

  const resize = useCallback((factor: number) => {
    setSize((previous) => THREE.MathUtils.clamp(previous * factor, MIN_SIZE, MAX_SIZE));
  }, []);

  const sizeLabel = size >= 0.99 ? "Life size" : `1:${Math.round(1 / size)}`;

  /**
   * Voice resizing, matching the Bigger/Smaller buttons above.
   *
   * Clamped the same way, so "make it life size" tops out at true scale rather
   * than growing past it — in world-tracked AR, larger than life-size is not a
   * bigger garden, it is a wrong one.
   */
  const applyVoiceScale = useCallback((change: ScaleChange): string | null => {
    if (typeof change.percent === "number") {
      const target = THREE.MathUtils.clamp(change.percent / 100, MIN_SIZE, MAX_SIZE);
      setSize(target);
      return target >= 0.99 ? "Now life size" : `Now 1:${Math.round(1 / target)}`;
    }
    if (typeof change.factor === "number") {
      resize(change.factor);
      return change.factor >= 1 ? "Bigger" : "Smaller";
    }
    return null;
  }, [resize]);

  // A voice edit regenerates the layout and every plant id with it, so a
  // details panel left open would be describing a plant that no longer exists.
  useEffect(() => {
    setSelected((current) =>
      current && layout.plants.some((plant) => plant.id === current.id) ? current : null,
    );
  }, [layout]);

  return (
    <div ref={setOverlay} className="relative h-[80vh] w-full overflow-hidden rounded-card bg-black">
      <ARWorldCanvas
        layout={layout}
        size={size}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        clockRef={clockRef}
        reducedMotion={reducedMotion}
        placement={placement}
        setPlacement={setPlacement}
        onTrackingChange={setHasSurface}
        placeSignal={placeSignal}
      />

      {/* Status line: says what the tracker is doing, so a blank screen never
          looks like a crash. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
        <p className="rounded-pill bg-black/65 px-4 py-2 text-center text-[13px] font-medium text-white backdrop-blur">
          {placement.placed
            ? "Walk around it — it stays where you put it"
            : hasSurface
              ? "Tap to place your garden"
              : "Point at the floor and move your phone slowly"}
        </p>
      </div>

      {/* Controls. `pointer-events-auto` on the buttons only, so taps on empty
          space still reach WebXR as a select. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-3 p-4">
        {selected ? (
          <div className="pointer-events-auto mx-auto max-w-sm">
            <PlantDetailsPanel plant={selected} onClose={() => setSelected(null)} />
          </div>
        ) : null}

        {/* Voice editing, once there is a garden on the floor to edit. Same
            pipeline as the planner and the preview view. */}
        {placement.placed ? (
          <div className="pointer-events-none flex justify-center">
            <ARVoiceControl onScale={applyVoiceScale} />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Enters the session, and becomes the way out once inside. */}
          <ARButton
            sessionInit={sessionInit}
            className="pointer-events-auto rounded-pill bg-forest px-6 py-3 text-sm font-semibold text-cream shadow-lift"
          />

          {!placement.placed ? (
            <button
              type="button"
              disabled={!hasSurface}
              onClick={() => setPlaceSignal((value) => value + 1)}
              className="pointer-events-auto rounded-pill bg-white px-6 py-3 text-sm font-semibold text-forest shadow-lift disabled:opacity-50"
            >
              Place garden
            </button>
          ) : (
            <>
              <ControlButton onClick={() => rotate(-Math.PI / 8)}>Rotate ↺</ControlButton>
              <ControlButton onClick={() => rotate(Math.PI / 8)}>Rotate ↻</ControlButton>
              <ControlButton onClick={() => resize(1 / 1.25)}>Smaller</ControlButton>
              <ControlButton onClick={() => resize(1.25)}>Bigger</ControlButton>
              <ControlButton onClick={reset}>Move it</ControlButton>
              <span className="pointer-events-none rounded-pill bg-black/65 px-3 py-2 text-[11px] font-medium text-white backdrop-blur">
                {sizeLabel}
              </span>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

function ControlButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto rounded-pill bg-white/90 px-4 py-2.5 text-xs font-semibold text-forest shadow-card backdrop-blur"
    >
      {children}
    </button>
  );
}

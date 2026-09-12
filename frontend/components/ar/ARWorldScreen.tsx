"use client";

/**
 * The WebXR AR screen: start a session, find the floor, place the garden,
 * then walk around it.
 *
 * Everything the user sees during the session lives in `overlayRef`, which is
 * handed to WebXR as the `dom-overlay` root. That is how ordinary React UI
 * survives on top of an immersive session.
 */

import { startSession, stopSession } from "@react-three/xr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { usePrefersReducedMotion } from "@/lib/motion";
import type { SceneClock } from "@/components/garden/Garden3D";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { PlantDetailsPanel } from "@/components/garden/PlantDetailsPanel";
import type { ScaleChange } from "@/lib/use-voice-garden";
import { ARVoiceControl } from "./ARVoiceControl";
import { ARGrowthSlider } from "./ARGrowthSlider";
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
  // Live yaw. State would re-render every plant on each drag step; the scene
  // reads this ref in its frame loop instead. `yawDegrees` exists only to
  // drive the slider thumb and its label.
  const yawRef = useRef(0);
  const [yawDegrees, setYawDegrees] = useState(0);
  const [inSession, setInSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Rebuilt once the overlay element exists, so the session is told about it.
  const sessionInit = useMemo(() => arSessionInit(overlay), [overlay]);

  const reset = useCallback(() => {
    setPlacement(createWorldPlacement());
    setSelected(null);
    yawRef.current = 0;
    setYawDegrees(0);
  }, []);

  const setYaw = useCallback((degrees: number) => {
    yawRef.current = THREE.MathUtils.degToRad(degrees);
    setYawDegrees(degrees);
  }, []);

  const resize = useCallback((factor: number) => {
    setSize((previous) => THREE.MathUtils.clamp(previous * factor, MIN_SIZE, MAX_SIZE));
  }, []);

  const sizeLabel = size >= 0.99 ? "Life size" : `1:${Math.round(1 / size)}`;

  /**
   * Session control, driven here rather than by <ARButton>.
   *
   * The library button renders wherever it is placed in the flow, which meant
   * "Exit AR" sat in the same wrapping row as rotate/resize/move and collided
   * with them on a phone. Owning the session lets "Enter AR" be a centred
   * call to action and "Exit AR" a corner chip, with nothing overlapping.
   */
  const enterAR = useCallback(async () => {
    setSessionError(null);
    try {
      const session = await startSession("immersive-ar", sessionInit);
      if (!session) return;
      setInSession(true);
      session.addEventListener(
        "end",
        () => {
          setInSession(false);
          setPlacement(createWorldPlacement());
        },
        { once: true },
      );
    } catch (error) {
      setSessionError(
        error instanceof Error ? error.message : "Couldn't start AR on this device.",
      );
    }
  }, [sessionInit]);

  const exitAR = useCallback(() => {
    void stopSession();
  }, []);

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
        yawRef={yawRef}
        onTrackingChange={setHasSurface}
        placeSignal={placeSignal}
      />

      {/* Zones, deliberately separated so nothing can overlap:
          top-left status · top-right exit · bottom stack of controls. */}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <p className="max-w-[70%] rounded-pill bg-black/65 px-3.5 py-2 text-[12px] font-medium leading-snug text-white backdrop-blur">
          {!inSession
            ? "Start AR, then point at the floor"
            : placement.placed
              ? "Walk around it — it stays where you put it"
              : hasSurface
                ? "Tap to place your garden"
                : "Point at the floor and move slowly"}
        </p>

        {inSession ? (
          <button
            type="button"
            onClick={exitAR}
            className="pointer-events-auto shrink-0 rounded-pill bg-white/90 px-3.5 py-2 text-[12px] font-semibold text-forest shadow-card backdrop-blur"
          >
            Exit AR
          </button>
        ) : null}
      </div>

      {/* Bottom stack. Each row is its own flex line, so a long row wraps
          within itself instead of pushing into its neighbour. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2.5 p-3">
        {selected ? (
          <div className="pointer-events-auto mx-auto w-full max-w-sm">
            <PlantDetailsPanel plant={selected} onClose={() => setSelected(null)} />
          </div>
        ) : null}

        {inSession && placement.placed ? (
          <ARGrowthSlider layout={layout} clockRef={clockRef} initialDay={seasonDay} />
        ) : null}

        {/* Voice editing, once there is a garden on the floor to edit. Same
            pipeline as the planner and the preview view. */}
        {inSession && placement.placed ? (
          <div className="pointer-events-none flex justify-center">
            <ARVoiceControl onScale={applyVoiceScale} />
          </div>
        ) : null}

        {inSession && !placement.placed ? (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={!hasSurface}
              onClick={() => setPlaceSignal((value) => value + 1)}
              className="pointer-events-auto rounded-pill bg-white px-7 py-3.5 text-sm font-semibold text-forest shadow-lift disabled:opacity-50"
            >
              Place garden
            </button>
          </div>
        ) : null}

        {inSession && placement.placed ? (
          <div className="pointer-events-auto mx-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-black/65 px-4 py-2.5 backdrop-blur">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-white">
              Rotate
            </span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={yawDegrees}
              aria-label="Rotate the garden"
              className="min-w-0 flex-1"
              onChange={(event) => setYaw(Number(event.target.value))}
            />
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/80">
              {yawDegrees}°
            </span>
          </div>
        ) : null}

        {inSession && placement.placed ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ControlButton onClick={() => resize(1 / 1.25)}>Smaller</ControlButton>
            <ControlButton onClick={() => resize(1.25)}>Bigger</ControlButton>
            <ControlButton onClick={reset}>Move it</ControlButton>
            <span className="pointer-events-none rounded-pill bg-black/65 px-3 py-2 text-[11px] font-medium text-white backdrop-blur">
              {sizeLabel}
            </span>
          </div>
        ) : null}
      </div>

      {/* Entry CTA, centred and alone until the session starts. */}
      {!inSession ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
          <button
            type="button"
            onClick={enterAR}
            className="pointer-events-auto rounded-pill bg-forest px-8 py-4 text-sm font-semibold text-cream shadow-lift"
          >
            Start AR
          </button>
          {sessionError ? (
            <p className="max-w-xs text-center text-xs text-white/80">{sessionError}</p>
          ) : null}
        </div>
      ) : null}
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

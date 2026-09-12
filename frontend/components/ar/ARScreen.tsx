"use client";

/**
 * The full-screen AR experience.
 *
 * Structure, back to front: the camera video, the transparent WebGL canvas,
 * then the controls. Everything degrades rather than dead-ends —
 *
 *   camera refused  → the ordinary 3D garden, with a line saying why
 *   motion refused  → drag to look around instead
 *   no plan yet     → a link to build one
 *
 * Permissions are requested inside the tap on "Start", because iOS rejects
 * `DeviceOrientationEvent.requestPermission()` outside a user gesture.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import type { SceneClock } from "@/components/garden/GardenScene";
import { ArrowRightIcon, LeafIcon } from "@/components/ui/Icons";
import {
  ARGardenView,
  clampSize,
  createPlacement,
  describeSize,
  DEFAULT_SIZE,
  placementInFront,
  type Placement,
} from "./ARGardenView";
import { ARVoiceControl } from "./ARVoiceControl";
import { useCameraStream } from "./useCameraStream";
import { useDeviceOrientation } from "./useDeviceOrientation";

const Garden3D = dynamic(() => import("@/components/garden/Garden3D"), { ssr: false });

const DRAG_SPEED = 0.005;
const MAX_PITCH = Math.PI / 2.2;

export function ARScreen({
  layout,
  seasonDay,
}: {
  layout: GenerateLayoutResponse | null;
  seasonDay: number;
}) {
  const camera = useCameraStream();
  const orientation = useDeviceOrientation();

  const [started, setStarted] = useState(false);
  // Fraction of life-size. Pinch or voice changes it; there are no presets,
  // because the right size depends entirely on the room you are standing in.
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [sizeHint, setSizeHint] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement>(createPlacement);
  const [selected, setSelected] = useState<PlacedPlant | null>(null);

  const clockRef = useRef<SceneClock>({ day: seasonDay, timeOfDay: 0.5 });
  const cameraQuaternion = useRef(new THREE.Quaternion());
  const dragRef = useRef({ yaw: 0, pitch: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const sizeHintTimer = useRef<ReturnType<typeof setTimeout>>();
  /** Live touch points, so two fingers can be told from one. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; size: number } | null>(null);

  const sensorsWorking = orientation.state === "granted";
  const cameraLive = camera.state === "live";

  // A voice edit regenerates the layout and every plant id with it, so a
  // details sheet left open would be describing a plant that no longer exists.
  useEffect(() => {
    setSelected((current) =>
      current && layout?.plants.some((plant) => plant.id === current.id) ? current : null,
    );
  }, [layout]);

  const start = useCallback(async () => {
    setStarted(true);
    // Both inside the gesture. Camera first: it is the one that matters, and
    // stacking two prompts at once reads as an app misbehaving.
    await camera.start();
    await orientation.start();
  }, [camera, orientation]);

  const place = useCallback(() => {
    if (!layout) return;
    setPlacement(placementInFront(cameraQuaternion.current, layout, size));
  }, [layout, size]);

  /** Shows the size briefly, so pinching has a readout without permanent chrome. */
  const flashSize = useCallback((next: number) => {
    setSizeHint(describeSize(next));
    clearTimeout(sizeHintTimer.current);
    sizeHintTimer.current = setTimeout(() => setSizeHint(null), 1400);
  }, []);

  const resize = useCallback(
    (updater: (current: number) => number) => {
      setSize((current) => {
        const next = clampSize(updater(current));
        flashSize(next);
        return next;
      });
    },
    [flashSize],
  );

  /** Voice: "make it bigger", "life size". Returns the line to show. */
  const applyVoiceScale = useCallback(
    (change: { factor?: number | null; percent?: number | null }) => {
      if (typeof change.percent === "number") {
        const target = change.percent / 100;
        resize(() => target);
        return `Now ${describeSize(clampSize(target))}`;
      }
      if (typeof change.factor === "number") {
        const factor = change.factor;
        let shown = "";
        setSize((current) => {
          const next = clampSize(current * factor);
          shown = describeSize(next);
          flashSize(next);
          return next;
        });
        return factor >= 1 ? "Bigger" : "Smaller";
      }
      return null;
    },
    [flashSize, resize],
  );

  /* ---- drag-to-look, when the sensors are not available ---- */

  const spread = (): number => {
    const [a, b] = Array.from(pointers.current.values());
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      // Second finger down: start pinching, and abandon any look-drag so the
      // view does not lurch while resizing.
      pinch.current = { distance: spread(), size };
      dragging.current = null;
      return;
    }
    if (sensorsWorking) return;
    dragging.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinch.current && pointers.current.size >= 2) {
      const distance = spread();
      if (distance > 0 && pinch.current.distance > 0) {
        const next = clampSize(pinch.current.size * (distance / pinch.current.distance));
        setSize(next);
        flashSize(next);
      }
      return;
    }

    if (!dragging.current) return;
    const dx = event.clientX - dragging.current.x;
    const dy = event.clientY - dragging.current.y;
    dragging.current = { x: event.clientX, y: event.clientY };
    dragRef.current.yaw -= dx * DRAG_SPEED;
    dragRef.current.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, dragRef.current.pitch - dy * DRAG_SPEED),
    );
  };

  const endDrag = (event?: React.PointerEvent) => {
    if (event) pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    dragging.current = null;
  };

  /** Trackpad and mouse wheel resize too — this is how it gets developed. */
  const onWheel = (event: React.WheelEvent) => {
    if (!placement.placed) return;
    resize((current) => current * (event.deltaY > 0 ? 0.92 : 1.08));
  };

  /* ---- nothing to show ---- */

  if (!layout) {
    return (
      <Shell>
        <div className="card mx-auto mt-24 max-w-sm p-8 text-center">
          <h1 className="font-display text-xl text-forest">No garden to show yet</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Build a plan first — the AR view renders the same layout as the planner.
          </p>
          <Link href="/onboarding/food" className="btn-primary mt-5">
            Build my garden
            <ArrowRightIcon />
          </Link>
        </div>
      </Shell>
    );
  }

  /* ---- priming ---- */

  if (!started) {
    return (
      <Shell>
        <div className="card mx-auto mt-16 max-w-sm p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-forest text-cream">
            <LeafIcon className="h-7 w-7" />
          </span>
          <h1 className="mt-5 font-display text-2xl text-forest">See it where you stand</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Your garden, placed in the room through the camera. Two things get asked for:
          </p>
          <ul className="mt-4 space-y-2 text-left text-sm text-ink-muted">
            <li className="flex gap-2">
              <span aria-hidden="true">📷</span>
              <span>
                <strong className="text-forest">Camera</strong> — the view behind the plants.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">🧭</span>
              <span>
                <strong className="text-forest">Motion</strong> — so the garden stays put when you
                turn. Optional; without it you can drag to look.
              </span>
            </li>
          </ul>
          <button type="button" onClick={start} className="btn-primary mt-6 w-full !py-3">
            Start AR
          </button>
          <p className="mt-3 text-[11px] text-ink-faint">
            Nothing is recorded or uploaded — the feed stays on your phone.
          </p>
        </div>
      </Shell>
    );
  }

  /* ---- camera unavailable: fall back to the ordinary 3D view ---- */

  if (!cameraLive && camera.state !== "starting") {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl px-4 pt-6">
          <div className="card-quiet mb-4 p-4 text-sm text-ink-muted">
            <p className="font-semibold text-forest">Showing the 3D garden instead</p>
            <p className="mt-1">
              {camera.state === "denied"
                ? "Camera access was blocked, so there is nothing to place the garden on. Allow it in your browser's site settings and reload."
                : camera.state === "insecure"
                  ? "The camera needs an https connection — open the tunnel URL rather than the local IP."
                  : camera.message || "The camera could not be started on this device."}
            </p>
          </div>
          <Garden3D
            layout={layout}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            clockRef={clockRef}
          />
        </div>
      </Shell>
    );
  }

  /* ---- the AR view ---- */

  return (
    <div
      className="fixed inset-0 z-50 touch-none overflow-hidden bg-black"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onWheel={onWheel}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={camera.videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      <ARGardenView
        layout={layout}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        clockRef={clockRef}
        sample={orientation.sample}
        dragRef={dragRef}
        cameraQuaternion={cameraQuaternion}
        useSensors={sensorsWorking}
        size={size}
        placement={placement}
      />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <Link
          href="/garden"
          className="pointer-events-auto rounded-pill bg-black/55 px-4 py-2 text-sm font-medium text-white backdrop-blur"
        >
          ← Exit
        </Link>
        {!sensorsWorking ? (
          <span className="pointer-events-none rounded-pill bg-black/55 px-3 py-2 text-[11px] text-white/90 backdrop-blur">
            Drag to look around
          </span>
        ) : null}
      </div>

      {/* selected plant */}
      {selected ? (
        <div className="pointer-events-auto absolute inset-x-3 bottom-32 rounded-card bg-white/95 p-4 shadow-lift backdrop-blur">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 h-9 w-9 shrink-0 rounded-lg"
              style={{ backgroundColor: selected.color }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base text-forest">{selected.crop}</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {selected.expected_yield_lbs} lbs expected · ready in about{" "}
                {selected.days_to_harvest} days · {selected.water_requirement} water
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-muted"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 pb-6">
        {placement.placed ? <ARVoiceControl onScale={applyVoiceScale} /> : null}

        {!placement.placed ? (
          <p className="mx-auto w-fit rounded-pill bg-black/55 px-4 py-2 text-xs text-white backdrop-blur">
            Point at the floor, then tap Place
          </p>
        ) : null}

        <div className="flex items-center justify-center gap-2">
          {sizeHint ? (
            <span className="rounded-pill bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur">
              {sizeHint}
            </span>
          ) : placement.placed ? (
            <span className="rounded-pill bg-black/45 px-3.5 py-2 text-[11px] text-white/85 backdrop-blur">
              Pinch to resize
            </span>
          ) : null}

          <button
            type="button"
            onClick={place}
            className="rounded-pill bg-white px-5 py-2.5 text-sm font-semibold text-forest shadow-lift"
          >
            {placement.placed ? "Move here" : "Place garden"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="section pb-16 pt-6">{children}</div>;
}

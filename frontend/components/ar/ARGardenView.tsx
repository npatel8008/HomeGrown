"use client";

/**
 * The garden, composited over the phone's camera feed.
 *
 * How the illusion works, and its honest limits:
 *
 *   The camera sits at the world origin and only ever *rotates*, driven by the
 *   phone's orientation sensors. The garden is a group parked at a fixed point
 *   in world space. Turn around and the garden stays where you left it, which
 *   is what sells it.
 *
 *   What this does NOT do is track you walking: there is no SLAM and no depth,
 *   so stepping forward does not bring you closer, and plants are drawn over
 *   real objects rather than behind them. That is the same trick Pokémon Go's
 *   basic AR mode uses, and it is plenty for "see your garden in the room".
 *
 * Scene units are FEET (the layout is authored in feet), so the group scale
 * converts to metres: 0.3048 for life-size, a twelfth of that for tabletop.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import { usePrefersReducedMotion } from "@/lib/motion";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { GardenSceneContent, type SceneClock } from "@/components/garden/GardenScene";
import type { OrientationSample } from "./useDeviceOrientation";

const FEET_TO_METRES = 0.3048;
/** Roughly where a phone is held, in metres above the floor. */
const EYE_HEIGHT_M = 1.5;

/**
 * How big the garden is drawn, as a fraction of life-size.
 *
 * Continuous rather than a couple of presets: a fixed "tabletop" size is wrong
 * in most rooms, and the natural way to fix that on a phone is to pinch. 1 is
 * true scale — a 12ft plot really 12ft across.
 */
export const LIFE_SIZE = 1;
export const MIN_SIZE = 0.02;
export const MAX_SIZE = 1.6;
/** Small enough to sit on a floor in a normal room, which is where this gets demoed. */
export const DEFAULT_SIZE = 0.08;

export function clampSize(size: number): number {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));
}

/** "1:12" / "Life-size" — what to show while pinching. */
export function describeSize(size: number): string {
  if (size >= 0.95 && size <= 1.05) return "Life-size";
  const ratio = Math.round(1 / size);
  return `1:${ratio}`;
}

export interface Placement {
  /** Where the garden's centre sits, in metres, world space. */
  position: THREE.Vector3;
  /** Rotation about Y so the plot faces the viewer. */
  yaw: number;
  placed: boolean;
}

export function createPlacement(): Placement {
  return { position: new THREE.Vector3(0, -EYE_HEIGHT_M, -1.2), yaw: 0, placed: false };
}

/** Scene units are feet; the group scale converts to metres at the chosen size. */
export function scaleFactor(size: number): number {
  return FEET_TO_METRES * clampSize(size);
}

/* ------------------------------------------------------------------ */
/* Camera rig                                                          */
/* ------------------------------------------------------------------ */

const ZEE = new THREE.Vector3(0, 0, 1);
const EULER = new THREE.Euler();
const Q0 = new THREE.Quaternion();
/** -90° about X: device space is z-up, three.js is y-up. */
const Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

/** The standard device-orientation → camera quaternion conversion. */
function applyDeviceQuaternion(
  quaternion: THREE.Quaternion,
  { alpha, beta, gamma, screen }: OrientationSample,
) {
  EULER.set(beta, alpha, -gamma, "YXZ");
  quaternion.setFromEuler(EULER);
  quaternion.multiply(Q1);
  quaternion.multiply(Q0.setFromAxisAngle(ZEE, -screen));
}

function CameraRig({
  sample,
  dragRef,
  useSensors,
}: {
  sample: MutableRefObject<OrientationSample>;
  dragRef: MutableRefObject<{ yaw: number; pitch: number }>;
  useSensors: boolean;
}) {
  const { camera } = useThree();

  useFrame(() => {
    if (useSensors && sample.current.received) {
      applyDeviceQuaternion(camera.quaternion, sample.current);
    } else {
      // Drag-to-look: the fallback when motion is denied, and how this is
      // developed on a laptop.
      EULER.set(dragRef.current.pitch, dragRef.current.yaw, 0, "YXZ");
      camera.quaternion.setFromEuler(EULER);
    }
  });

  return null;
}

/** Publishes the live camera quaternion so "place" can read where you look. */
function CameraProbe({ target }: { target: MutableRefObject<THREE.Quaternion> }) {
  const { camera } = useThree();
  useFrame(() => target.current.copy(camera.quaternion));
  return null;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export function ARGardenView({
  layout,
  selectedId,
  onSelect,
  clockRef,
  sample,
  dragRef,
  cameraQuaternion,
  useSensors,
  size,
  placement,
}: {
  layout: GenerateLayoutResponse;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
  clockRef: MutableRefObject<SceneClock>;
  sample: MutableRefObject<OrientationSample>;
  dragRef: MutableRefObject<{ yaw: number; pitch: number }>;
  cameraQuaternion: MutableRefObject<THREE.Quaternion>;
  useSensors: boolean;
  /** Fraction of life-size; see DEFAULT_SIZE. */
  size: number;
  placement: Placement;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const factor = useMemo(() => scaleFactor(size), [size]);

  return (
    <Canvas
      // Transparent, so the video behind shows through.
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      // Shadow maps are the most expensive thing a phone GPU does here, and
      // shadows cast onto an invisible floor read as grey smudges anyway.
      shadows={false}
      dpr={[1, 1.5]}
      camera={{ fov: 70, near: 0.01, far: 200, position: [0, 0, 0] }}
      style={{ position: "absolute", inset: 0, background: "transparent" }}
    >
      <Suspense fallback={null}>
        <CameraRig sample={sample} dragRef={dragRef} useSensors={useSensors} />
        <CameraProbe target={cameraQuaternion} />

        <group
          position={placement.position}
          rotation={[0, placement.yaw, 0]}
          scale={factor}
          visible={placement.placed}
        >
          <GardenSceneContent
            layout={layout}
            selectedId={selectedId}
            onSelect={onSelect}
            clockRef={clockRef}
            reducedMotion={reducedMotion}
            shadows={false}
            // Same reason as the WebXR view: the garden is scaled to metres
            // and sits about a metre away, where a distance-scaled label
            // overflows the screen.
            labelDistanceFactor={null}
            // The real floor is already visible through the camera; drawing a
            // grey plane over it is what makes cheap AR look pasted on.
            showGround={false}
          />
        </group>
      </Suspense>
    </Canvas>
  );
}

/**
 * Where to drop the garden, given where the viewer is currently looking.
 *
 * Reads the camera's forward vector rather than deriving angles by hand, which
 * keeps it correct no matter how the device quaternion was assembled.
 */
export function placementInFront(
  cameraQuaternion: THREE.Quaternion,
  layout: GenerateLayoutResponse,
  size: number,
): Placement {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();

  // Stand far enough back that the whole plot is in shot, whatever size it is.
  const plotDepthM = layout.plot.length_ft * scaleFactor(size);
  const distance = Math.max(0.9, plotDepthM * 0.75);

  const position = forward.clone().multiplyScalar(distance);
  // Always on the floor. A model resting on the ground reads as real; one
  // floating at table height only works if there is actually a table there.
  position.y = -EYE_HEIGHT_M;

  return {
    position,
    // Face the plot back towards the viewer.
    yaw: Math.atan2(forward.x, forward.z),
    placed: true,
  };
}

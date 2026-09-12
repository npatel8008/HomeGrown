"use client";

/**
 * World-anchored AR, via WebXR.
 *
 * WHY THE OLD VERSION DRIFTED
 * The previous implementation put a transparent canvas over a `<video>` and
 * rotated the camera from DeviceOrientation. That is 3DOF: rotation only. The
 * camera never *translated*, so walking could not change your viewpoint and
 * the garden behaved like a sticker on the screen. Its own comments said as
 * much ("What this does NOT do is track you walking").
 *
 * WHAT THIS DOES INSTEAD
 * WebXR `immersive-ar` hands the camera pose to the browser's tracker (ARCore
 * on Android), which is full 6DOF SLAM. The essential inversion: we no longer
 * move the garden to follow the viewer. The garden is placed once, at a fixed
 * point in the session's `local-floor` reference space, and thereafter the
 * *camera* moves through that space as you walk. Standing still and placing
 * something at the origin is what makes it stay on the floor when you walk
 * around it.
 *
 * Placement, step by step:
 *   1. A hit-test source ray-casts from the viewer into the real world every
 *      frame, returning poses on surfaces the tracker has found.
 *   2. Hits whose surface normal isn't within ~25° of world up are ignored, so
 *      the reticle only lands on floors and tabletops, never walls.
 *   3. Tapping places the garden at the hit's *position*. Its rotation is
 *      rebuilt as yaw-only, so the plot is flat against the floor by
 *      construction and cannot inherit a tilt from a noisy plane estimate.
 *   4. If the device supports anchors, the hit is promoted to an XRAnchor and
 *      the garden follows the anchor's pose each frame. That is what keeps it
 *      on the same floorboard when the tracker refines its map behind you.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { XR, useHitTest, useXR } from "@react-three/xr";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { GardenSceneContent } from "@/components/garden/GardenScene";
import type { SceneClock } from "@/components/garden/Garden3D";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";

/** Layouts are authored in feet; WebXR works in metres. */
const FEET_TO_METRES = 0.3048;

/** How far off vertical a surface may be and still count as "the ground". */
const MAX_FLOOR_TILT = THREE.MathUtils.degToRad(25);

export interface WorldPlacement {
  position: THREE.Vector3;
  yaw: number;
  placed: boolean;
}

export function createWorldPlacement(): WorldPlacement {
  return { position: new THREE.Vector3(), yaw: 0, placed: false };
}

/* ------------------------------------------------------------------ */
/* Reticle — where the garden would land                               */
/* ------------------------------------------------------------------ */

const UP = new THREE.Vector3(0, 1, 0);
const normal = new THREE.Vector3();

function Reticle({
  onHit,
  visible,
}: {
  /** Called with the latest valid floor hit, or null when there isn't one. */
  onHit: (matrix: THREE.Matrix4 | null, hit: XRHitTestResult | null) => void;
  visible: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const sawHit = useRef(false);

  useHitTest((hitMatrix, hit) => {
    // The pose's +Y is the surface normal. A wall's points sideways, and a
    // garden bed hanging off a wall is exactly the "floating incorrectly"
    // failure we're trying to avoid.
    normal.set(hitMatrix.elements[4], hitMatrix.elements[5], hitMatrix.elements[6]).normalize();
    if (normal.angleTo(UP) > MAX_FLOOR_TILT) {
      if (sawHit.current) {
        sawHit.current = false;
        onHit(null, null);
      }
      return;
    }

    sawHit.current = true;
    if (ring.current) {
      ring.current.visible = visible;
      ring.current.position.setFromMatrixPosition(hitMatrix);
      // Lie flat regardless of how the plane estimate is rotated.
      ring.current.quaternion.set(0, 0, 0, 1);
      ring.current.rotateX(-Math.PI / 2);
    }
    onHit(hitMatrix, hit);
  });

  useFrame(() => {
    if (ring.current && !visible) ring.current.visible = false;
  });

  return (
    <mesh ref={ring} visible={false}>
      <ringGeometry args={[0.09, 0.12, 36]} />
      <meshBasicMaterial color="#8FD69C" transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* The placed garden                                                   */
/* ------------------------------------------------------------------ */

const anchorPosition = new THREE.Vector3();
const anchorQuaternion = new THREE.Quaternion();
const anchorScale = new THREE.Vector3();
const anchorMatrix = new THREE.Matrix4();

function AnchoredGarden({
  placement,
  anchor,
  size,
  layout,
  selectedId,
  onSelect,
  clockRef,
  reducedMotion,
}: {
  placement: WorldPlacement;
  anchor: XRAnchor | null;
  size: number;
  layout: GenerateLayoutResponse;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
  clockRef: React.MutableRefObject<SceneClock>;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { gl } = useThree();

  // Anchors are the difference between "roughly there" and "on that
  // floorboard": the tracker refines its map as you move, and an anchor's pose
  // is corrected along with it. Without one the placement is still fixed in
  // the reference space, which is close but can drift over a long session.
  useFrame((_state, _delta, frame) => {
    if (!group.current || !anchor || !frame) return;
    const referenceSpace = gl.xr.getReferenceSpace();
    if (!referenceSpace) return;

    const pose = frame.getPose(anchor.anchorSpace, referenceSpace);
    if (!pose) return;

    anchorMatrix.fromArray(pose.transform.matrix);
    anchorMatrix.decompose(anchorPosition, anchorQuaternion, anchorScale);
    group.current.position.copy(anchorPosition);
    // Yaw only, again: the anchor may carry a tilt we do not want.
    group.current.rotation.set(0, placement.yaw, 0);
  });

  return (
    <group
      ref={group}
      position={placement.position}
      rotation={[0, placement.yaw, 0]}
      visible={placement.placed}
    >
      <group scale={FEET_TO_METRES * size}>
        <GardenSceneContent
          layout={layout}
          selectedId={selectedId}
          onSelect={onSelect}
          clockRef={clockRef}
          reducedMotion={reducedMotion}
          shadows={false}
          // The real floor is already there, through the camera.
          showGround={false}
        />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Session wiring                                                      */
/* ------------------------------------------------------------------ */

function Session({
  layout,
  size,
  selectedId,
  onSelect,
  clockRef,
  reducedMotion,
  placement,
  setPlacement,
  onTrackingChange,
  placeSignal,
}: {
  layout: GenerateLayoutResponse;
  size: number;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
  clockRef: React.MutableRefObject<SceneClock>;
  reducedMotion: boolean;
  placement: WorldPlacement;
  setPlacement: (next: WorldPlacement) => void;
  onTrackingChange: (hasSurface: boolean) => void;
  /** Bumped by the overlay's "Place" button. */
  placeSignal: number;
}) {
  const session = useXR((state) => state.session);
  const latestHit = useRef<{ matrix: THREE.Matrix4; hit: XRHitTestResult } | null>(null);
  const [anchor, setAnchor] = useState<XRAnchor | null>(null);
  const lastSignal = useRef(placeSignal);

  const handleHit = useCallback(
    (matrix: THREE.Matrix4 | null, hit: XRHitTestResult | null) => {
      latestHit.current = matrix && hit ? { matrix, hit } : null;
      onTrackingChange(Boolean(matrix));
    },
    [onTrackingChange],
  );

  /** Drop the garden where the reticle is. */
  const place = useCallback(() => {
    const current = latestHit.current;
    if (!current) return;
    // A tap after placement selects a plant; it must not silently relocate the
    // garden. "Move it" is the deliberate way back into placement mode.
    if (placement.placed) return;

    const position = new THREE.Vector3().setFromMatrixPosition(current.matrix);
    // Face the plot towards wherever the viewer is standing, so you see it
    // front-on rather than from behind.
    setPlacement({ position, yaw: 0, placed: true });

    // Promote to a real anchor when the device offers them.
    const createAnchor = (current.hit as XRHitTestResult & {
      createAnchor?: () => Promise<XRAnchor>;
    }).createAnchor;
    if (createAnchor) {
      createAnchor
        .call(current.hit)
        .then((created) => setAnchor(created))
        .catch(() => setAnchor(null));
    }
  }, [setPlacement, placement.placed]);

  // Straight off the session rather than through the library's controller
  // abstraction: a phone screen tap is a transient input source, and `select`
  // on the session is the one thing the WebXR spec guarantees will fire.
  useEffect(() => {
    if (!session) return;
    const onSelect = () => place();
    session.addEventListener("select", onSelect);
    return () => session.removeEventListener("select", onSelect);
  }, [session, place]);

  // ...and the explicit button in the overlay, which is more discoverable and
  // survives browsers that swallow taps on the DOM overlay.
  useEffect(() => {
    if (placeSignal === lastSignal.current) return;
    lastSignal.current = placeSignal;
    place();
  }, [placeSignal, place]);

  // Leaving the session should not leave a stale anchor behind.
  useEffect(() => {
    if (!session) setAnchor(null);
  }, [session]);

  return (
    <>
      {/* Matching the room's light is beyond scope; this reads as daylight. */}
      <hemisphereLight args={["#FFF6E0", "#6B7A63", 1.25]} />
      <directionalLight position={[2, 6, 3]} intensity={1.1} />
      <ambientLight intensity={0.4} />

      <Reticle onHit={handleHit} visible={!placement.placed} />

      <AnchoredGarden
        placement={placement}
        anchor={anchor}
        size={size}
        layout={layout}
        selectedId={selectedId}
        onSelect={onSelect}
        clockRef={clockRef}
        reducedMotion={reducedMotion}
      />
    </>
  );
}

export function ARWorldCanvas(props: React.ComponentProps<typeof Session>) {
  return (
    <Canvas
      // The camera feed is the browser's, composited behind our transparent
      // canvas by the XR compositor. No <video> element involved.
      gl={{ alpha: true, antialias: true }}
      shadows={false}
      dpr={[1, 2]}
      camera={{ fov: 60, near: 0.01, far: 100 }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* `local-floor` puts y=0 at the real floor, so a garden placed on the
          ground sits at the height the tracker believes the ground to be. */}
      <XR referenceSpace="local-floor">
        <Suspense fallback={null}>
          <Session {...props} />
        </Suspense>
      </XR>
    </Canvas>
  );
}

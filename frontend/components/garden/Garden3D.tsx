"use client";

/**
 * 3D garden visualization — the orbit camera presentation.
 *
 * The garden itself lives in `GardenScene.tsx` and is shared with the AR view.
 * What is left here is only what makes this the *desk* view: a painted
 * background, an orbit camera, and the director that eases it around.
 *
 * Import with `next/dynamic` and `ssr: false`; three.js has no business
 * running on the server.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import { lerp, usePrefersReducedMotion } from "@/lib/motion";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { BED_HEIGHT, GardenSceneContent, plotCentring, type SceneClock } from "./GardenScene";

// Re-exported because SceneControls (and anything else) has always imported
// them from here.
export { growthFactor } from "./GardenScene";
export type { SceneClock } from "./GardenScene";

/** Eases the camera in on load, and glides to a plant when one is selected. */
function CameraDirector({
  focus,
  home,
  reducedMotion,
}: {
  focus: [number, number, number] | null;
  home: [number, number, number];
  reducedMotion: boolean;
}) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const target = useRef(new THREE.Vector3(0, 0.5, 0));
  const introDone = useRef(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    // Start pulled back and slightly high, then settle into the home shot.
    camera.position.set(home[0] * 1.9, home[1] * 2.1, home[2] * 1.9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const step = Math.min(1, delta * 3.2);

    const wanted = focus ? new THREE.Vector3(...focus) : new THREE.Vector3(0, 0.5, 0);
    if (reducedMotion) {
      target.current.copy(wanted);
    } else {
      target.current.lerp(wanted, step);
    }
    if (controls) {
      controls.target.copy(target.current);
      controls.update();
    }

    if (!introDone.current) {
      camera.position.set(
        lerp(camera.position.x, home[0], step),
        lerp(camera.position.y, home[1], step),
        lerp(camera.position.z, home[2], step),
      );
      if (camera.position.distanceTo(new THREE.Vector3(...home)) < 0.25) {
        introDone.current = true;
      }
    }
  });

  return null;
}

function Scene({
  layout,
  selectedId,
  onSelect,
  clockRef,
  reducedMotion,
}: {
  layout: GenerateLayoutResponse;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
  clockRef: MutableRefObject<SceneClock>;
  reducedMotion: boolean;
}) {
  const { width, length, toScene, raised } = plotCentring(layout);
  const plantY = raised ? BED_HEIGHT : 0.06;

  const selected = layout.plants.find((plant) => plant.id === selectedId) ?? null;
  const focus: [number, number, number] | null = selected
    ? [
        toScene(selected.x, selected.z)[0],
        plantY + Math.max(0.5, selected.height * 0.45),
        toScene(selected.x, selected.z)[1],
      ]
    : null;

  const home: [number, number, number] = [width * 0.85, Math.max(6, length * 1.1), length * 1.5];

  return (
    <>
      <CameraDirector focus={focus} home={home} reducedMotion={reducedMotion} />
      <GardenSceneContent
        layout={layout}
        selectedId={selectedId}
        onSelect={onSelect}
        clockRef={clockRef}
        reducedMotion={reducedMotion}
      />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={Math.max(30, width * 3)}
        maxPolarAngle={Math.PI / 2.15}
      />
    </>
  );
}

export default function Garden3D({
  layout,
  selectedId,
  onSelect,
  clockRef,
}: {
  layout: GenerateLayoutResponse;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
  /** Season day + time of day, mutated by the controls without re-rendering. */
  clockRef: MutableRefObject<SceneClock>;
}) {
  const width = layout.plot.width_ft;
  const length = layout.plot.length_ft;
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-card border border-line bg-gradient-to-b from-[#EAF1E6] to-[#DCE6D6]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [width * 0.85, Math.max(6, length * 1.1), length * 1.5], fov: 42 }}
      >
        <Suspense fallback={null}>
          <Scene
            layout={layout}
            selectedId={selectedId}
            onSelect={onSelect}
            clockRef={clockRef}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>

      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-pill bg-white/85 px-3.5 py-1.5 text-[11px] font-medium text-ink-muted shadow-card backdrop-blur">
        Drag to rotate · Scroll to zoom · Right-drag to pan · Click a plant for details
      </p>
    </div>
  );
}

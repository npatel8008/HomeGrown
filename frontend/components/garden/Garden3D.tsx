"use client";

/**
 * 3D garden visualization.
 *
 * Reads the exact same layout JSON as the 2D planner in `GardenGrid` — the
 * backend is the only place plant positions are decided.
 *
 * Animation is driven by ONE `useFrame` loop that mutates object refs
 * directly. Nothing here re-renders React per frame: the season scrubber
 * writes into a ref, and the loop reads it. With ~80 plants that keeps the
 * scene at 60fps instead of reconciling the whole tree 60 times a second.
 *
 * Import with `next/dynamic` and `ssr: false`; three.js has no business
 * running on the server.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import { clamp01, easeInOutCubic, lerp, usePrefersReducedMotion } from "@/lib/motion";
import { plantVariation } from "@/lib/random";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { PlantModel } from "./PlantModels";

const BED_HEIGHT = 0.6;
/** A seedling is this fraction of its mature size on day 0. */
const SEEDLING_SCALE = 0.14;
/** Fruit starts showing at this fraction of the way to harvest. */
const FRUIT_ONSET = 0.62;

export interface SceneClock {
  /** Day of the growing season. */
  day: number;
  /** 0 = dawn, 0.5 = noon, 1 = dusk. */
  timeOfDay: number;
}

/** How far along this crop is, 0-1, with a natural slow start and plateau. */
export function growthFactor(daysToHarvest: number, day: number): number {
  const raw = clamp01(day / Math.max(1, daysToHarvest));
  // Crops keep filling out a little after first harvest, hence the 1.08 cap.
  return Math.min(1.08, easeInOutCubic(raw) * 1.08);
}

/* ------------------------------------------------------------------ */
/* Static set dressing                                                 */
/* ------------------------------------------------------------------ */

function Ground({ width, length }: { width: number; length: number }) {
  const span = Math.max(width, length) * 2.4;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[span, span]} />
      <meshStandardMaterial color="#CFD8C4" roughness={1} />
    </mesh>
  );
}

function Plot({ width, length }: { width: number; length: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color="#E7E1D0" roughness={1} />
    </mesh>
  );
}

function Bed({
  x,
  z,
  width,
  length,
  raised,
}: {
  x: number;
  z: number;
  width: number;
  length: number;
  raised: boolean;
}) {
  const height = raised ? BED_HEIGHT : 0.08;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial color={raised ? "#B08150" : "#8A6A45"} roughness={0.95} />
      </mesh>
      <mesh position={[0, height + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width - 0.16, length - 0.16]} />
        <meshStandardMaterial color="#5A4632" roughness={1} />
      </mesh>
    </group>
  );
}

function Path({ x, z, width, length }: { x: number; z: number; width: number; length: number }) {
  return (
    <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color="#C6BFAC" roughness={1} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Plants                                                              */
/* ------------------------------------------------------------------ */

interface PlantHandle {
  plant: PlacedPlant;
  group: THREE.Group;
  fruit: THREE.Group | null;
  phase: number;
  swayAmount: number;
  baseScale: number;
}

function Plant({
  plant,
  y,
  position,
  selected,
  onSelect,
  register,
}: {
  plant: PlacedPlant;
  y: number;
  position: [number, number];
  selected: boolean;
  onSelect: (plant: PlacedPlant) => void;
  register: (handle: PlantHandle | null, id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const fruitRef = useRef<THREE.Group>(null);
  const variation = useMemo(() => plantVariation(plant.id), [plant.id]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    register(
      {
        plant,
        group,
        fruit: fruitRef.current,
        phase: variation.phase,
        // Tall plants catch more wind; a lettuce barely moves.
        swayAmount: 0.012 + Math.min(0.05, plant.height * 0.011),
        baseScale: variation.scale,
      },
      plant.id,
    );
    return () => register(null, plant.id);
  }, [plant, register, variation]);

  return (
    <group
      position={[position[0], y, position[1]]}
      rotation={[variation.leanX, variation.yaw, variation.leanZ]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(plant);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <group ref={groupRef} scale={variation.scale}>
        <PlantModel ref={fruitRef} plant={plant} />
      </group>

      {selected ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[plant.spacing_ft / 2 - 0.08, plant.spacing_ft / 2, 28]} />
            <meshBasicMaterial color="#1B3B2A" transparent opacity={0.55} />
          </mesh>
          <Html center distanceFactor={11} position={[0, Math.max(0.9, plant.height) + 0.35, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded-lg bg-forest px-2.5 py-1.5 text-[11px] font-medium text-cream shadow-lift">
              {plant.crop} · {plant.expected_yield_lbs} lbs
            </div>
          </Html>
        </>
      ) : null}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The single animation loop                                           */
/* ------------------------------------------------------------------ */

function GardenAnimator({
  handles,
  clockRef,
  reducedMotion,
}: {
  handles: MutableRefObject<Map<string, PlantHandle>>;
  clockRef: MutableRefObject<SceneClock>;
  reducedMotion: boolean;
}) {
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const { day } = clockRef.current;

    handles.current.forEach((handle) => {
      const growth = growthFactor(handle.plant.days_to_harvest, day);
      const scale = handle.baseScale * (SEEDLING_SCALE + (1 - SEEDLING_SCALE) * growth);
      handle.group.scale.setScalar(scale);

      if (!reducedMotion) {
        // Two offset sines so the motion doesn't read as a metronome.
        const sway = handle.swayAmount;
        handle.group.rotation.z =
          Math.sin(time * 0.9 + handle.phase) * sway +
          Math.sin(time * 2.3 + handle.phase * 1.7) * sway * 0.28;
        handle.group.rotation.x = Math.cos(time * 0.7 + handle.phase) * sway * 0.55;
      }

      if (handle.fruit) {
        const ripeness = clamp01((growth - FRUIT_ONSET) / (1 - FRUIT_ONSET));
        handle.fruit.scale.setScalar(ripeness);
        handle.fruit.visible = ripeness > 0.02;
      }
    });
  });

  return null;
}

/** Sun position and colour across the day, plus the light the sky throws back. */
function Sun({ clockRef, span }: { clockRef: MutableRefObject<SceneClock>; span: number }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    const t = clamp01(clockRef.current.timeOfDay);
    // Sweep from east to west over a shallow arc.
    const angle = Math.PI * (1 - t);
    const elevation = Math.sin(Math.PI * t);
    light.position.set(
      Math.cos(angle) * span * 1.3,
      0.6 + elevation * span * 1.5,
      span * 0.55,
    );
    light.intensity = 0.35 + elevation * 1.35;
    // Warm at the edges of the day, neutral overhead.
    const warmth = 1 - elevation;
    light.color.setRGB(1, 1 - warmth * 0.22, 1 - warmth * 0.45);

    if (hemiRef.current) {
      hemiRef.current.intensity = 0.55 + elevation * 0.6;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={["#FFF6E0", "#5A6B52", 1.1]} />
      <directionalLight
        ref={lightRef}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-far={span * 6}
        shadow-bias={-0.0012}
      />
      <ambientLight intensity={0.32} />
    </>
  );
}

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

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

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
  const width = layout.plot.width_ft;
  const length = layout.plot.length_ft;
  const span = Math.max(width, length);
  const toScene = (x: number, z: number): [number, number] => [x - width / 2, z - length / 2];

  const raised = layout.garden_type === "raised-beds" || layout.garden_type === "containers";
  const plantY = raised ? BED_HEIGHT : 0.06;

  const handles = useRef(new Map<string, PlantHandle>());
  const register = useMemo(
    () => (handle: PlantHandle | null, id: string) => {
      if (handle) handles.current.set(id, handle);
      else handles.current.delete(id);
    },
    [],
  );

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
      <Sun clockRef={clockRef} span={span} />
      <GardenAnimator handles={handles} clockRef={clockRef} reducedMotion={reducedMotion} />
      <CameraDirector focus={focus} home={home} reducedMotion={reducedMotion} />

      <group onPointerMissed={() => onSelect(null)}>
        <Ground width={width} length={length} />
        <Plot width={width} length={length} />

        {layout.beds.map((bed) => {
          const [x, z] = toScene(bed.x + bed.width / 2, bed.z + bed.length / 2);
          return (
            <Bed key={bed.id} x={x} z={z} width={bed.width} length={bed.length} raised={raised} />
          );
        })}

        {layout.paths.map((path, index) => {
          const [x, z] = toScene(path.x + path.width / 2, path.z + path.length / 2);
          return <Path key={`path-${index}`} x={x} z={z} width={path.width} length={path.length} />;
        })}

        {layout.plants.map((plant) => (
          <Plant
            key={plant.id}
            plant={plant}
            y={plantY}
            position={toScene(plant.x, plant.z)}
            selected={plant.id === selectedId}
            onSelect={onSelect}
            register={register}
          />
        ))}
      </group>

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

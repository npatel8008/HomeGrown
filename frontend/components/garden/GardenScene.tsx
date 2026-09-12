"use client";

/**
 * The garden itself — ground, beds, paths, plants, sun and the animation loop.
 *
 * Deliberately knows nothing about the camera, the controls or what is behind
 * it. `Garden3D` renders this under an orbit camera on a painted background;
 * the AR view renders the exact same thing under a device-orientation camera
 * with the phone's video feed behind it. One implementation, two presentations
 * — if a plant looks right in one it looks right in the other.
 *
 * Animation is driven by ONE `useFrame` loop that mutates object refs
 * directly. Nothing re-renders React per frame: the season scrubber writes into
 * a ref and the loop reads it. With ~80 plants that is the difference between
 * 60fps and a slideshow, and it matters far more on a phone than on a laptop.
 */

import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import { clamp01, easeInOutCubic } from "@/lib/motion";
import { plantVariation } from "@/lib/random";
import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { PlantModel } from "./PlantModels";

export const BED_HEIGHT = 0.6;
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

/** Beyond this, a crop is a perennial rather than something sown each spring. */
const PERENNIAL_DAYS = 365;
/** How large a perennial is drawn the day it goes in the ground. */
const ESTABLISHED_SCALE = 0.7;

/**
 * How far along this crop is, 0-1, with a natural slow start and plateau.
 *
 * Annuals are scaled against their own days-to-harvest, which is what the
 * season scrubber is for. Perennials cannot be: an apple takes about three
 * years to crop, so a 150-day season divided by 1,095 days drew every tree,
 * berry bush and bramble in the library as an invisible twig. They are also
 * not sown — you buy a two- or three-year-old plant and put it in the ground
 * already established, so that is how they are drawn, and they fill out from
 * there.
 */
export function growthFactor(daysToHarvest: number, day: number): number {
  const raw = clamp01(day / Math.max(1, daysToHarvest));
  // Crops keep filling out a little after first harvest, hence the 1.08 cap.
  const grown = Math.min(1.08, easeInOutCubic(raw) * 1.08);
  if (daysToHarvest <= PERENNIAL_DAYS) return grown;
  return Math.max(grown, ESTABLISHED_SCALE + raw * (1 - ESTABLISHED_SCALE));
}

/** Plot feet → scene units, and the origin moved to the plot's centre. */
export function plotCentring(layout: GenerateLayoutResponse) {
  const width = layout.plot.width_ft;
  const length = layout.plot.length_ft;
  return {
    width,
    length,
    span: Math.max(width, length),
    toScene: (x: number, z: number): [number, number] => [x - width / 2, z - length / 2],
    raised:
      layout.garden_type === "raised-beds" || layout.garden_type === "containers",
  };
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

export interface PlantHandle {
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
  labels,
  labelDistanceFactor,
}: {
  plant: PlacedPlant;
  y: number;
  position: [number, number];
  selected: boolean;
  onSelect: (plant: PlacedPlant) => void;
  register: (handle: PlantHandle | null, id: string) => void;
  labels: boolean;
  /** drei scales by distanceFactor/distance; null means fixed pixel size. */
  labelDistanceFactor: number | null;
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
          {labels ? (
            <Html
              center
              // In the 3D view the camera sits ~17 scene units away, so scaling
              // with distance keeps the label in proportion. In AR you stand
              // about a metre from a garden that has been scaled to metres, and
              // the same factor blows the label off the screen — so AR passes
              // null and gets a constant, readable pixel size instead.
              {...(labelDistanceFactor !== null ? { distanceFactor: labelDistanceFactor } : {})}
              position={[0, Math.max(0.9, plant.height) + 0.35, 0]}
              zIndexRange={[100, 0]}
            >
              <div className="pointer-events-none max-w-[60vw] truncate whitespace-nowrap rounded-lg bg-forest px-2.5 py-1.5 text-[11px] font-medium text-cream shadow-lift">
                {plant.crop} · {plant.expected_yield_lbs} lbs
              </div>
            </Html>
          ) : null}
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
export function Sun({
  clockRef,
  span,
  shadows = true,
}: {
  clockRef: MutableRefObject<SceneClock>;
  span: number;
  shadows?: boolean;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    const t = clamp01(clockRef.current.timeOfDay);
    // Sweep from east to west over a shallow arc.
    const angle = Math.PI * (1 - t);
    const elevation = Math.sin(Math.PI * t);
    light.position.set(Math.cos(angle) * span * 1.3, 0.6 + elevation * span * 1.5, span * 0.55);
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
        castShadow={shadows}
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

/* ------------------------------------------------------------------ */
/* The reusable scene body                                             */
/* ------------------------------------------------------------------ */

export function GardenSceneContent({
  layout,
  selectedId,
  onSelect,
  clockRef,
  reducedMotion,
  shadows = true,
  labels = true,
  labelDistanceFactor = 11,
  showGround = true,
}: {
  layout: GenerateLayoutResponse;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
  clockRef: MutableRefObject<SceneClock>;
  reducedMotion: boolean;
  /** Off in AR: shadow maps are the single most expensive thing on a phone. */
  shadows?: boolean;
  labels?: boolean;
  /**
   * How the floating plant label is sized. A number scales it with camera
   * distance (right for the desktop 3D view); `null` pins it to a constant
   * pixel size, which is what AR needs.
   */
  labelDistanceFactor?: number | null;
  /** Off in AR, where the real ground is already visible through the camera. */
  showGround?: boolean;
}) {
  const { width, length, span, toScene, raised } = plotCentring(layout);
  const plantY = raised ? BED_HEIGHT : 0.06;

  const handles = useRef(new Map<string, PlantHandle>());
  const register = useMemo(
    () => (handle: PlantHandle | null, id: string) => {
      if (handle) handles.current.set(id, handle);
      else handles.current.delete(id);
    },
    [],
  );

  return (
    <>
      <Sun clockRef={clockRef} span={span} shadows={shadows} />
      <GardenAnimator handles={handles} clockRef={clockRef} reducedMotion={reducedMotion} />

      <group onPointerMissed={() => onSelect(null)}>
        {showGround ? <Ground width={width} length={length} /> : null}
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
            labels={labels}
            labelDistanceFactor={labelDistanceFactor}
          />
        ))}
      </group>
    </>
  );
}

"use client";

/**
 * 3D garden visualization.
 *
 * Reads the exact same layout JSON as the 2D planner in `GardenGrid` — the
 * backend is the only place plant positions are decided.
 *
 * Import this with `next/dynamic` and `ssr: false`; three.js has no business
 * running on the server.
 */

import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { Suspense, useState } from "react";

import type { GenerateLayoutResponse, PlacedPlant } from "@/lib/types";
import { PlantModel } from "./PlantModels";

const BED_HEIGHT = 0.6;

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
      {/* soil surface, inset slightly so the frame reads as a frame */}
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

function Plant({
  plant,
  y,
  position,
  selected,
  onSelect,
}: {
  plant: PlacedPlant;
  y: number;
  position: [number, number];
  selected: boolean;
  onSelect: (plant: PlacedPlant) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={[position[0], y, position[1]]}
      scale={hovered || selected ? 1.08 : 1}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(plant);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <PlantModel plant={plant} />

      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[plant.spacing_ft / 2 - 0.08, plant.spacing_ft / 2, 24]} />
          <meshBasicMaterial color="#1B3B2A" transparent opacity={0.55} />
        </mesh>
      ) : null}

      {hovered ? (
        <Html center distanceFactor={11} position={[0, Math.max(0.8, plant.height) + 0.3, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-lg bg-forest px-2.5 py-1.5 text-[11px] font-medium text-cream shadow-lift">
            {plant.crop} · {plant.expected_yield_lbs} lbs
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function Scene({
  layout,
  selectedId,
  onSelect,
}: {
  layout: GenerateLayoutResponse;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
}) {
  const width = layout.plot.width_ft;
  const length = layout.plot.length_ft;
  // Layout coordinates start at the plot corner; three.js is happier centred.
  const toScene = (x: number, z: number): [number, number] => [x - width / 2, z - length / 2];

  const raised = layout.garden_type === "raised-beds" || layout.garden_type === "containers";
  const plantY = raised ? BED_HEIGHT : 0.06;

  return (
    <>
      <hemisphereLight args={["#FFF6E0", "#5A6B52", 1.1]} />
      <directionalLight
        position={[width * 0.7, Math.max(8, width), length]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <ambientLight intensity={0.35} />

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
          />
        ))}
      </group>

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        minDistance={3}
        maxDistance={Math.max(30, width * 3)}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

export default function Garden3D({
  layout,
  selectedId,
  onSelect,
}: {
  layout: GenerateLayoutResponse;
  selectedId: string | null;
  onSelect: (plant: PlacedPlant | null) => void;
}) {
  const width = layout.plot.width_ft;
  const length = layout.plot.length_ft;

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-card border border-line bg-gradient-to-b from-[#EAF1E6] to-[#DCE6D6]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [width * 0.85, Math.max(6, length * 1.1), length * 1.5], fov: 42 }}
      >
        <Suspense fallback={null}>
          <Scene layout={layout} selectedId={selectedId} onSelect={onSelect} />
        </Suspense>
      </Canvas>

      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-pill bg-white/85 px-3.5 py-1.5 text-[11px] font-medium text-ink-muted shadow-card backdrop-blur">
        Drag to rotate · Scroll to zoom · Right-drag to pan · Click a plant for details
      </p>
    </div>
  );
}

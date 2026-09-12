"use client";

/**
 * Stylized low-poly plants. Deliberately simple — the point of the 3D view is
 * spatial understanding, not photorealism. Each model is built from primitives
 * and sized from the same `height` that the layout JSON carries.
 */

import { useMemo } from "react";
import type { PlacedPlant } from "@/lib/types";

function Stem({ height, radius = 0.03 }: { height: number; radius?: number }) {
  return (
    <mesh position={[0, height / 2, 0]} castShadow>
      <cylinderGeometry args={[radius, radius * 1.35, height, 6]} />
      <meshStandardMaterial color="#3F6B45" roughness={0.85} />
    </mesh>
  );
}

/** Tall staked crops: tomatoes, cherry tomatoes. */
function VineModel({ height, color }: { height: number; color: string }) {
  const scale = height / 5;
  return (
    <group>
      <Stem height={height * 0.9} radius={0.035} />
      {/* cage / stake */}
      <mesh position={[0.12, height * 0.45, 0]}>
        <cylinderGeometry args={[0.012, 0.012, height * 0.95, 5]} />
        <meshStandardMaterial color="#9A7B4F" roughness={1} />
      </mesh>
      <mesh position={[0, height * 0.62, 0]} castShadow>
        <sphereGeometry args={[0.42 * scale * 1.6, 12, 10]} />
        <meshStandardMaterial color="#4C8B52" roughness={0.9} />
      </mesh>
      <mesh position={[0.16, height * 0.4, 0.1]} castShadow>
        <sphereGeometry args={[0.3 * scale * 1.6, 10, 8]} />
        <meshStandardMaterial color="#57A05E" roughness={0.9} />
      </mesh>
      {/* fruit */}
      {[
        [0.2, 0.6, 0.12],
        [-0.18, 0.5, -0.1],
        [0.05, 0.72, -0.2],
      ].map(([dx, ratio, dz], index) => (
        <mesh key={index} position={[dx * scale * 1.6, height * (ratio as number), dz * scale * 1.6]}>
          <sphereGeometry args={[0.09 * scale * 1.8, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Bushy mid-height crops: peppers, jalapeños. */
function BushModel({ height, color }: { height: number; color: string }) {
  const scale = height / 3;
  return (
    <group>
      <Stem height={height * 0.4} radius={0.03} />
      <mesh position={[0, height * 0.55, 0]} castShadow>
        <icosahedronGeometry args={[0.34 * scale * 1.5, 1]} />
        <meshStandardMaterial color="#3E7D46" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.14 * scale, height * 0.42, 0.1 * scale]}>
        <capsuleGeometry args={[0.05 * scale, 0.14 * scale, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[-0.13 * scale, height * 0.4, -0.08 * scale]}>
        <capsuleGeometry args={[0.05 * scale, 0.14 * scale, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Herbs: basil, cilantro — small leafy clusters. */
function HerbModel({ height, color }: { height: number; color: string }) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => {
        const angle = (index / 5) * Math.PI * 2;
        return [Math.cos(angle) * 0.13, 0.55 + (index % 2) * 0.18, Math.sin(angle) * 0.13] as const;
      }),
    [],
  );
  return (
    <group>
      <Stem height={height * 0.55} radius={0.022} />
      {leaves.map(([dx, ratio, dz], index) => (
        <mesh key={index} position={[dx * height, height * ratio, dz * height]} castShadow>
          <sphereGeometry args={[0.13 * height, 8, 6]} />
          <meshStandardMaterial color={index % 2 ? color : "#5FA968"} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Low rosettes: spinach, lettuce. */
function RosetteModel({ height, color }: { height: number; color: string }) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2;
        return { angle, dx: Math.cos(angle) * 0.11, dz: Math.sin(angle) * 0.11 };
      }),
    [],
  );
  return (
    <group>
      {leaves.map((leaf, index) => (
        <mesh
          key={index}
          position={[leaf.dx, height * 0.35, leaf.dz]}
          rotation={[Math.PI / 2.6, leaf.angle, 0]}
          castShadow
        >
          <sphereGeometry args={[0.14, 8, 6]} />
          <meshStandardMaterial color={index % 2 ? color : "#57A05E"} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, height * 0.42, 0]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Grassy uprights: green onions. */
function SpikeModel({ height, color }: { height: number; color: string }) {
  const blades = useMemo(
    () =>
      Array.from({ length: 4 }, (_, index) => ({
        dx: (index % 2 ? 1 : -1) * 0.035 * (1 + index * 0.3),
        dz: (index < 2 ? 1 : -1) * 0.03,
        tilt: (index - 1.5) * 0.12,
      })),
    [],
  );
  return (
    <group>
      {blades.map((blade, index) => (
        <mesh
          key={index}
          position={[blade.dx, height * 0.45, blade.dz]}
          rotation={[0, 0, blade.tilt]}
          castShadow
        >
          <cylinderGeometry args={[0.018, 0.028, height * 0.9, 5]} />
          <meshStandardMaterial color={index % 2 ? color : "#79C182"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Sprawling vines: cucumber. */
function SprawlModel({ height, color }: { height: number; color: string }) {
  return (
    <group>
      <mesh position={[0, height * 0.28, 0]} castShadow>
        <icosahedronGeometry args={[0.4, 1]} />
        <meshStandardMaterial color="#4C8F52" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.22, height * 0.16, 0.16]} rotation={[0, 0.6, Math.PI / 2.2]}>
        <capsuleGeometry args={[0.06, 0.28, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
}

const MODEL_BY_CROP: Record<string, "vine" | "bush" | "herb" | "rosette" | "spike" | "sprawl"> = {
  tomato: "vine",
  "cherry-tomato": "vine",
  basil: "herb",
  cilantro: "herb",
  jalapeno: "bush",
  "bell-pepper": "bush",
  spinach: "rosette",
  lettuce: "rosette",
  "green-onion": "spike",
  cucumber: "sprawl",
};

export function PlantModel({ plant }: { plant: PlacedPlant }) {
  const kind = MODEL_BY_CROP[plant.crop_id] ?? "bush";
  const height = Math.max(0.4, plant.height);

  switch (kind) {
    case "vine":
      return <VineModel height={height} color={plant.color} />;
    case "herb":
      return <HerbModel height={height} color={plant.color} />;
    case "rosette":
      return <RosetteModel height={height} color={plant.color} />;
    case "spike":
      return <SpikeModel height={height} color={plant.color} />;
    case "sprawl":
      return <SprawlModel height={height} color={plant.color} />;
    default:
      return <BushModel height={height} color={plant.color} />;
  }
}

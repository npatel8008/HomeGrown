"use client";

/**
 * Procedural plant models.
 *
 * Six archetypes cover the ten crops. Each is assembled from the shared
 * geometry in `plantGeometry.ts` and varied per plant by a seed derived from
 * the plant id, so no two tomatoes are identical clones.
 *
 * Still not photorealistic, and not trying to be — the goal is that a glance
 * tells you which crop is which and how much room it takes.
 *
 * Fruit is grouped under a ref the scene can scale independently, so it can
 * emerge as the season progresses (see Garden3D's growth loop).
 */

import { forwardRef, useMemo } from "react";
import * as THREE from "three";

import { jitterColor, plantVariation, type PlantVariation } from "@/lib/random";
import type { PlacedPlant } from "@/lib/types";
import {
  BROAD_LEAF,
  BULB,
  CALYX,
  FOLIAGE_CLUMP,
  FRUIT_SPHERE,
  HERB_LEAF,
  ROSETTE_LEAF,
  TENDRIL,
  THIN_CYLINDER,
  makeStem,
} from "./plantGeometry";

const STEM_GREEN = "#3F6B45";
const LEAF_DARK = "#35703F";
const STAKE_BROWN = "#9A7B4F";

type ModelProps = {
  height: number;
  color: string;
  variation: PlantVariation;
};

/** Leaves spiralling up a stem, each drooping outward. */
function StemLeaves({
  count,
  height,
  size,
  geometry,
  color,
  startAt = 0.18,
  droop = 0.55,
}: {
  count: number;
  height: number;
  size: number;
  geometry: THREE.BufferGeometry;
  color: string;
  startAt?: number;
  droop?: number;
}) {
  const leaves = useMemo(() => {
    const out = [];
    for (let index = 0; index < count; index += 1) {
      const t = startAt + (index / Math.max(1, count - 1)) * (1 - startAt) * 0.92;
      // Golden-angle phyllotaxis — how leaves actually arrange around a stem.
      const angle = index * 2.399;
      out.push({ t, angle, scale: size * (1 - t * 0.35) });
    }
    return out;
  }, [count, size, startAt]);

  return (
    <>
      {leaves.map((leaf, index) => (
        <mesh
          key={index}
          position={[
            Math.cos(leaf.angle) * 0.04 * height,
            height * leaf.t,
            Math.sin(leaf.angle) * 0.04 * height,
          ]}
          rotation={[droop, -leaf.angle, 0]}
          scale={leaf.scale}
          geometry={geometry}
          castShadow
        >
          <meshStandardMaterial
            color={index % 3 === 0 ? LEAF_DARK : color}
            roughness={0.82}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}

/** A single fruit with its calyx. */
function Fruit({
  size,
  color,
  position,
}: {
  size: number;
  color: string;
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      <mesh geometry={FRUIT_SPHERE} scale={size} castShadow>
        <meshStandardMaterial color={color} roughness={0.34} metalness={0.02} />
      </mesh>
      <mesh geometry={CALYX} scale={size} position={[0, size * 0.72, 0]}>
        <meshStandardMaterial color="#4A7C3F" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Archetypes                                                          */
/* ------------------------------------------------------------------ */

/** Tall, staked, fruiting — tomato and cherry tomato. */
const VineModel = forwardRef<THREE.Group, ModelProps>(function VineModel(
  { height, color, variation },
  fruitRef,
) {
  const { random } = variation;
  const stem = useMemo(
    () => makeStem(height * 0.94, 0.028, 0.1 + random() * 0.12, (random() - 0.5) * 0.2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height],
  );
  const leafColor = jitterColor("#4C8B52", variation.tint);
  const fruit = useMemo(() => {
    const out: { position: [number, number, number]; size: number }[] = [];
    const clusters = 2 + Math.floor(random() * 2);
    for (let index = 0; index < clusters; index += 1) {
      const t = 0.35 + (index / clusters) * 0.45;
      const angle = index * 2.1 + random();
      out.push({
        position: [Math.cos(angle) * 0.2, height * t, Math.sin(angle) * 0.2],
        size: height * (0.035 + random() * 0.015),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  return (
    <group>
      <mesh geometry={stem} castShadow>
        <meshStandardMaterial color={STEM_GREEN} roughness={0.9} />
      </mesh>

      {/* stake, leaning very slightly out of true */}
      <mesh
        geometry={THIN_CYLINDER}
        position={[0.14, height * 0.48, -0.04]}
        rotation={[0, 0, 0.03]}
        scale={[0.012, height * 0.96, 0.012]}
      >
        <meshStandardMaterial color={STAKE_BROWN} roughness={1} />
      </mesh>

      <StemLeaves
        count={11 + variation.extraLeaves}
        height={height * 0.94}
        size={height * 0.23}
        geometry={BROAD_LEAF}
        color={leafColor}
        droop={0.8}
      />

      <group ref={fruitRef}>
        {fruit.map((item, index) => (
          <Fruit key={index} position={item.position} size={item.size} color={color} />
        ))}
      </group>
    </group>
  );
});

/** Compact and branching, with hanging pods — peppers. */
const BushModel = forwardRef<THREE.Group, ModelProps>(function BushModel(
  { height, color, variation },
  fruitRef,
) {
  const { random } = variation;
  const stem = useMemo(
    () => makeStem(height * 0.5, 0.032, 0.05, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height],
  );
  const leafColor = jitterColor("#3E7D46", variation.tint);
  const pods = useMemo(() => {
    const out: { position: [number, number, number]; scale: number }[] = [];
    const count = 2 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.4 + random();
      out.push({
        position: [Math.cos(angle) * 0.16, height * (0.36 + random() * 0.2), Math.sin(angle) * 0.16],
        scale: height * 0.07,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  return (
    <group>
      <mesh geometry={stem} castShadow>
        <meshStandardMaterial color={STEM_GREEN} roughness={0.9} />
      </mesh>

      {/* a small inner mass just to stop you seeing daylight through the
          middle — the leaves, not this, define the silhouette */}
      <mesh
        geometry={FOLIAGE_CLUMP}
        position={[0, height * 0.44, 0]}
        rotation={[variation.leanX * 4, variation.yaw, 0]}
        scale={[height * 0.17, height * 0.12, height * 0.16]}
        castShadow
      >
        <meshStandardMaterial color={LEAF_DARK} roughness={0.95} flatShading />
      </mesh>

      <StemLeaves
        count={9 + variation.extraLeaves}
        height={height * 0.78}
        size={height * 0.26}
        geometry={BROAD_LEAF}
        color={leafColor}
        startAt={0.22}
        droop={1.0}
      />

      <group ref={fruitRef}>
        {pods.map((pod, index) => (
          <mesh
            key={index}
            position={pod.position}
            rotation={[Math.PI, index * 0.7, 0]}
            scale={pod.scale}
            castShadow
          >
            <capsuleGeometry args={[0.55, 1.1, 4, 10]} />
            <meshStandardMaterial color={color} roughness={0.35} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

/** Opposite leaf pairs on a short stem — basil, cilantro. */
const HerbModel = forwardRef<THREE.Group, ModelProps>(function HerbModel(
  { height, color, variation },
  fruitRef,
) {
  const leafColor = jitterColor(color, variation.tint);
  const tiers = useMemo(() => {
    const out = [];
    const count = 4 + variation.extraLeaves;
    for (let index = 0; index < count; index += 1) {
      const t = 0.2 + (index / count) * 0.72;
      // Basil sets each leaf pair at 90° to the pair below it.
      out.push({ t, angle: index * (Math.PI / 2), scale: height * (0.58 - index * 0.06) });
    }
    return out;
  }, [height, variation.extraLeaves]);

  return (
    <group>
      <mesh geometry={makeStem(height * 0.85, 0.018, 0.03, 0)} castShadow>
        <meshStandardMaterial color={STEM_GREEN} roughness={0.9} />
      </mesh>

      {tiers.map((tier, index) =>
        [0, Math.PI].map((side) => (
          <mesh
            key={`${index}-${side}`}
            position={[0, height * tier.t, 0]}
            rotation={[0.5, tier.angle + side, 0]}
            scale={Math.max(0.08, tier.scale)}
            geometry={HERB_LEAF}
            castShadow
          >
            <meshStandardMaterial
              color={index % 2 ? LEAF_DARK : leafColor}
              roughness={0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
        )),
      )}

      {/* flower spike — the thing you're told to pinch off */}
      <group ref={fruitRef}>
        <mesh position={[0, height * 0.92, 0]} scale={[height * 0.05, height * 0.14, height * 0.05]}>
          <coneGeometry args={[1, 1, 6]} />
          <meshStandardMaterial color="#C9D6A8" roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
});

/** Leaves radiating from a crown — spinach, lettuce. */
/* Leafy crops have no separate fruit — the leaves are the harvest — so these
   two deliberately leave `fruitRef` unattached. The scene null-checks it and
   the plant just grows as a whole. Attaching it here would apply the growth
   scale twice. */
const RosetteModel = forwardRef<THREE.Group, ModelProps>(function RosetteModel(
  { height, color, variation },
  _fruitRef,
) {
  const leafColor = jitterColor(color, variation.tint);
  const leaves = useMemo(() => {
    const out = [];
    const count = 9 + variation.extraLeaves * 2;
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399;
      const ring = index / count;
      out.push({
        angle,
        // Outer leaves lie flatter, inner ones stand up — a real rosette.
        tilt: 1.15 - ring * 0.55,
        scale: height * (0.75 - ring * 0.22),
      });
    }
    return out;
  }, [height, variation.extraLeaves]);

  return (
    <group>
      {leaves.map((leaf, index) => (
        <mesh
          key={index}
          position={[Math.cos(leaf.angle) * height * 0.06, height * 0.1, Math.sin(leaf.angle) * height * 0.06]}
          rotation={[leaf.tilt, -leaf.angle, 0]}
          scale={leaf.scale}
          geometry={ROSETTE_LEAF}
          castShadow
        >
          <meshStandardMaterial
            color={index % 3 === 0 ? LEAF_DARK : leafColor}
            roughness={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
});

/** Hollow blades from a white base — green onion. */
const SpikeModel = forwardRef<THREE.Group, ModelProps>(function SpikeModel(
  { height, color, variation },
  _fruitRef,
) {
  const { random } = variation;
  const blades = useMemo(() => {
    const out = [];
    const count = 4 + variation.extraLeaves;
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399;
      out.push({
        geometry: makeStem(height * (0.72 + random() * 0.28), 0.016, 0.18 + random() * 0.16, 0),
        angle,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, variation.extraLeaves]);

  return (
    <group>
      {/* pale bulb at soil level */}
      <mesh geometry={BULB} position={[0, height * 0.05, 0]} scale={[0.05, 0.08, 0.05]} castShadow>
        <meshStandardMaterial color="#EDF0DF" roughness={0.85} />
      </mesh>
      {blades.map((blade, index) => (
        <mesh
          key={index}
          geometry={blade.geometry}
          rotation={[0, blade.angle, 0]}
          position={[0, height * 0.06, 0]}
          castShadow
        >
          <meshStandardMaterial color={index % 2 ? color : "#79C182"} roughness={0.86} />
        </mesh>
      ))}
    </group>
  );
});

/** Trailing vine with big lobed leaves and a tendril — cucumber. */
const SprawlModel = forwardRef<THREE.Group, ModelProps>(function SprawlModel(
  { height, color, variation },
  fruitRef,
) {
  const { random } = variation;
  const leafColor = jitterColor("#4C8F52", variation.tint);
  const leaves = useMemo(() => {
    const out = [];
    const count = 5 + variation.extraLeaves;
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399;
      out.push({
        angle,
        radius: 0.16 + random() * 0.2,
        tilt: 1.25 - random() * 0.35,
        scale: height * (0.42 + random() * 0.14),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, variation.extraLeaves]);

  return (
    <group>
      {leaves.map((leaf, index) => (
        <mesh
          key={index}
          position={[
            Math.cos(leaf.angle) * leaf.radius,
            height * 0.22,
            Math.sin(leaf.angle) * leaf.radius,
          ]}
          rotation={[leaf.tilt, -leaf.angle, 0]}
          scale={leaf.scale}
          geometry={BROAD_LEAF}
          castShadow
        >
          <meshStandardMaterial
            color={index % 3 === 0 ? LEAF_DARK : leafColor}
            roughness={0.88}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      <mesh geometry={TENDRIL} position={[0.2, height * 0.24, 0.1]}>
        <meshStandardMaterial color="#6FA86B" roughness={0.9} />
      </mesh>

      <group ref={fruitRef}>
        <mesh
          position={[0.24, height * 0.12, 0.14]}
          rotation={[0, 0.6, Math.PI / 2.1]}
          scale={height * 0.16}
          castShadow
        >
          <capsuleGeometry args={[0.3, 1.5, 4, 10]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
});

/** Root crops — a leafy top with the shoulder of the root just showing. */
const RootModel = forwardRef<THREE.Group, ModelProps>(function RootModel(
  { height, color, variation },
  fruitRef,
) {
  const leafColor = jitterColor("#4F8B4A", variation.tint);
  const tops = useMemo(() => {
    const out = [];
    const count = 5 + variation.extraLeaves;
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399;
      out.push({ angle, tilt: 0.45 + (index % 3) * 0.12, scale: height * (0.5 - (index % 3) * 0.06) });
    }
    return out;
  }, [height, variation.extraLeaves]);

  return (
    <group>
      {tops.map((top, index) => (
        <mesh
          key={index}
          position={[Math.cos(top.angle) * height * 0.05, height * 0.18, Math.sin(top.angle) * height * 0.05]}
          rotation={[top.tilt, -top.angle, 0]}
          scale={top.scale}
          geometry={HERB_LEAF}
          castShadow
        >
          <meshStandardMaterial
            color={index % 2 ? LEAF_DARK : leafColor}
            roughness={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {/* the root shoulder, the bit you actually see before pulling it */}
      <group ref={fruitRef}>
        <mesh position={[0, height * 0.05, 0]} scale={[height * 0.16, height * 0.1, height * 0.16]} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
});

/** Climbing legumes — a trellised column of leaves with hanging pods. */
const ClimberModel = forwardRef<THREE.Group, ModelProps>(function ClimberModel(
  { height, color, variation },
  fruitRef,
) {
  const { random } = variation;
  const leafColor = jitterColor(color, variation.tint);
  const pods = useMemo(() => {
    const out: { position: [number, number, number] }[] = [];
    const count = 4 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399;
      const t = 0.3 + (index / count) * 0.55;
      out.push({ position: [Math.cos(angle) * 0.12, height * t, Math.sin(angle) * 0.12] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  return (
    <group>
      {/* the cane it climbs */}
      <mesh geometry={THIN_CYLINDER} position={[0, height * 0.5, 0]} scale={[0.014, height, 0.014]}>
        <meshStandardMaterial color={STAKE_BROWN} roughness={1} />
      </mesh>
      <mesh geometry={makeStem(height * 0.95, 0.016, 0.06, 0.5)} castShadow>
        <meshStandardMaterial color={STEM_GREEN} roughness={0.9} />
      </mesh>
      <StemLeaves
        count={10 + variation.extraLeaves}
        height={height * 0.95}
        size={height * 0.14}
        geometry={BROAD_LEAF}
        color={leafColor}
        droop={0.6}
      />
      <group ref={fruitRef}>
        {pods.map((pod, index) => (
          <mesh key={index} position={pod.position} rotation={[0.25, index, 0]} scale={height * 0.055} castShadow>
            <capsuleGeometry args={[0.16, 1.5, 4, 8]} />
            <meshStandardMaterial color="#6DAA4E" roughness={0.55} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

type Archetype = "vine" | "bush" | "herb" | "rosette" | "spike" | "sprawl" | "root" | "climber";

const MODEL_BY_CROP: Record<string, Archetype> = {
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
  // Expanded library
  "bok-choy": "rosette",
  kale: "rosette",
  "swiss-chard": "rosette",
  arugula: "rosette",
  carrot: "root",
  radish: "root",
  beet: "root",
  zucchini: "sprawl",
  "green-beans": "climber",
  peas: "climber",
  broccoli: "bush",
  garlic: "spike",
  parsley: "herb",
  mint: "herb",
  strawberry: "rosette",
  eggplant: "bush",
};

/**
 * `fruitRef` receives the group holding whatever should emerge late in the
 * season (fruit, pods, a flower spike). The scene scales it from 0 as the crop
 * approaches its harvest date.
 */
export const PlantModel = forwardRef<THREE.Group, { plant: PlacedPlant }>(function PlantModel(
  { plant },
  fruitRef,
) {
  const variation = useMemo(() => plantVariation(plant.id), [plant.id]);
  const kind = MODEL_BY_CROP[plant.crop_id] ?? "bush";
  const height = Math.max(0.4, plant.height);
  const props = { height, color: plant.color, variation };

  switch (kind) {
    case "vine":
      return <VineModel ref={fruitRef} {...props} />;
    case "herb":
      return <HerbModel ref={fruitRef} {...props} />;
    case "rosette":
      return <RosetteModel ref={fruitRef} {...props} />;
    case "spike":
      return <SpikeModel ref={fruitRef} {...props} />;
    case "sprawl":
      return <SprawlModel ref={fruitRef} {...props} />;
    case "root":
      return <RootModel ref={fruitRef} {...props} />;
    case "climber":
      return <ClimberModel ref={fruitRef} {...props} />;
    default:
      return <BushModel ref={fruitRef} {...props} />;
  }
});



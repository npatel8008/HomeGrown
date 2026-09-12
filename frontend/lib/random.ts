/**
 * Deterministic pseudo-randomness, seeded from a plant id.
 *
 * Every plant of the same crop was previously an exact clone, which is the
 * single biggest reason a procedural garden reads as fake. Seeding from the id
 * gives each plant its own lean, leaf count and colour without making the
 * scene non-deterministic — the same layout always renders the same garden.
 */

/** FNV-1a. Small, fast, good enough spread for a handful of draws. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — tiny seeded PRNG returning [0, 1). */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A per-plant bundle of stable random draws. */
export interface PlantVariation {
  /** Whole-plant yaw, so neighbours don't face the same way. */
  yaw: number;
  /** Overall size multiplier, ±10%. */
  scale: number;
  /** Permanent lean, in radians. */
  leanX: number;
  leanZ: number;
  /** Phase offset so plants don't sway in lockstep. */
  phase: number;
  /** Hue/lightness jitter applied to foliage, in [-1, 1]. */
  tint: number;
  /** Extra leaves beyond the archetype's base count. */
  extraLeaves: number;
  random: () => number;
}

export function plantVariation(id: string): PlantVariation {
  const random = makeRandom(hashString(id));
  return {
    yaw: random() * Math.PI * 2,
    scale: 0.9 + random() * 0.2,
    leanX: (random() - 0.5) * 0.16,
    leanZ: (random() - 0.5) * 0.16,
    phase: random() * Math.PI * 2,
    tint: (random() - 0.5) * 2,
    extraLeaves: Math.floor(random() * 3),
    random,
  };
}

/** Nudge a hex colour's lightness/saturation a little. `amount` is [-1, 1]. */
export function jitterColor(hex: string, amount: number): string {
  const value = parseInt(hex.replace("#", ""), 16);
  const shift = Math.round(amount * 14);
  const clamp = (channel: number) => Math.max(0, Math.min(255, channel + shift));
  const r = clamp((value >> 16) & 0xff);
  const g = clamp((value >> 8) & 0xff);
  const b = clamp(value & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

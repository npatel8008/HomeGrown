/**
 * Shared procedural geometry for the garden's plants.
 *
 * Built once at module scope and reused by every plant in the scene — there
 * are hundreds of leaves out there, and they should not each allocate their
 * own buffers.
 *
 * The scene has no asset pipeline (no GLTF, no textures), so realism here
 * comes from shape rather than detail: real leaf outlines with a cupped
 * cross-section and a drooping tip, curved tapered stems, and squashed fruit
 * with a calyx — instead of spheres impaled on sticks.
 */

import * as THREE from "three";

/** A leaf outline, 1 unit long, tip at +Y, drawn with two bezier halves. */
function leafOutline(width: number, shoulder: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width, shoulder * 0.4, width * 0.85, shoulder, 0, 1);
  shape.bezierCurveTo(-width * 0.85, shoulder, -width, shoulder * 0.4, 0, 0);
  return shape;
}

/**
 * Flat shapes read as paper. Cup the blade around its midrib and let the tip
 * fall away, so it catches light like a real leaf.
 */
function sculptLeaf(geometry: THREE.BufferGeometry, cup: number, droop: number) {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    // Cup across the blade, and droop along its length.
    const z = -cup * x * x - droop * y * y;
    position.setZ(index, z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function makeLeaf(width: number, shoulder: number, cup: number, droop: number, segments = 14) {
  return sculptLeaf(new THREE.ShapeGeometry(leafOutline(width, shoulder), segments), cup, droop);
}

/** Broad, softly cupped — tomatoes, cucumbers, peppers. Wide relative to its
    length, otherwise it reads as a banana rather than a leaf. */
export const BROAD_LEAF = makeLeaf(0.54, 0.58, 0.5, 0.22);
/** Small and pointed — basil, cilantro. */
export const HERB_LEAF = makeLeaf(0.34, 0.55, 0.7, 0.15);
/** Long and strappy, strongly cupped — spinach and lettuce rosettes. */
export const ROSETTE_LEAF = makeLeaf(0.3, 0.5, 0.85, 0.3, 16);

/** A stem that leans and curves, rather than a perfectly vertical rod. */
export function makeStem(
  height: number,
  radius: number,
  bend: number,
  twist = 0,
): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bend * 0.15, height * 0.35, twist * 0.15),
    new THREE.Vector3(bend * 0.5, height * 0.72, twist * 0.4),
    new THREE.Vector3(bend * 0.9, height, twist * 0.7),
  ]);
  return new THREE.TubeGeometry(curve, 10, radius, 6, false);
}

/** A curling tendril — the detail that sells a cucumber vine. */
export const TENDRIL = (() => {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const angle = t * Math.PI * 5;
    const radius = 0.09 * (1 - t * 0.55);
    points.push(new THREE.Vector3(Math.cos(angle) * radius, t * 0.42, Math.sin(angle) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, 0.008, 4, false);
})();

/** Slightly squashed, like fruit that has sat on a vine. */
export const FRUIT_SPHERE = new THREE.SphereGeometry(1, 14, 12);
FRUIT_SPHERE.scale(1, 0.88, 1);

/** The little green star where fruit meets stem. */
export const CALYX = new THREE.ConeGeometry(0.62, 0.32, 5, 1, true);

/** Chunky, irregular foliage mass used to bulk out bushes. */
export const FOLIAGE_CLUMP = new THREE.IcosahedronGeometry(1, 1);

export const THIN_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 6);
export const BULB = new THREE.SphereGeometry(1, 10, 8);

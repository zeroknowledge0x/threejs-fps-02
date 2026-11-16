// Harbor Line, the map: a fish-market compound at dusk, built from boxes only. Three lanes
// (west quay, mid auction hall, east cold store) meet a cross corridor, and the planted charge
// goes off at one of two sites. Each box is a collider for bodies and a surface a bullet stops
// on; the painted floor squares and the lamps are not.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// width, height, depth, x, y, z, material for every solid box of the map.
const BOXES = [
  [40.6, 0.4, 36.6, 0, -0.2, 0, 'hairline'],
  [40.6, 4.6, 0.6, 0, 2.3, 18, 'surface'],
  [40.6, 4.6, 0.6, 0, 2.3, -18, 'surface'],
  [0.6, 4.6, 36.6, -20, 2.3, 0, 'surface'],
  [0.6, 4.6, 36.6, 20, 2.3, 0, 'surface'],

  // Mid: one long container down the auction hall, banquettes either side of the mouth.
  [3.4, 2.9, 11, 0, 1.45, 3, 'hairline'],
  [3, 1.1, 0.6, -6.4, 0.55, 6.6, 'hairline'],
  [3, 1.1, 0.6, 6.4, 0.55, 6.6, 'hairline'],
  [3, 1.6, 2, -6.2, 0.8, -5.6, 'hairline'],
  [3, 1.6, 2, 6.2, 0.8, -5.6, 'hairline'],
  [1.2, 3, 1.2, -3.6, 1.5, -9.4, 'surface'],
  [1.2, 3, 1.2, 3.6, 1.5, -9.4, 'surface'],
  [2.6, 2.6, 6, -8, 1.3, 0.5, 'hairline'],
  [2.6, 2.6, 6, 8, 1.3, 0.5, 'hairline'],

  // West quay: the lane wall with a doorway onto the hall, a container to break the sightline.
  [0.6, 3.4, 7.5, -10.5, 1.7, 5.75, 'surface'],
  [0.6, 3.4, 1.6, -10.5, 1.7, 15.2, 'surface'],
  [2.2, 2.4, 3.2, -18.4, 1.2, 1.5, 'hairline'],
  [0.6, 3, 4, -18.6, 1.5, -6, 'surface'],
  [1.6, 1.4, 1.6, -15.6, 0.7, -11.6, 'hairline'],
  [1.6, 1.4, 1.6, -11.4, 0.7, -8.4, 'hairline'],
  [0.6, 2.6, 5, -9.4, 1.3, -11.4, 'surface'],

  // East cold store: mirrored, but the container sits further back so B opens wider.
  [0.6, 3.4, 7.5, 10.5, 1.7, 5.75, 'surface'],
  [0.6, 3.4, 1.6, 10.5, 1.7, 15.2, 'surface'],
  [2.2, 2.4, 3.2, 18.4, 1.2, 1.5, 'hairline'],
  [0.6, 3, 4, 18.6, 1.5, -6, 'surface'],
  [1.6, 1.4, 1.6, 15.6, 0.7, -11.6, 'hairline'],
  [1.6, 1.4, 1.6, 11.4, 0.7, -8.4, 'hairline'],
  [0.6, 2.6, 5, 9.4, 1.3, -11.4, 'surface'],
  [1.4, 1.2, 1.4, 12.6, 0.6, -13.2, 'hairline'],

  // South spawn: the market's shut stalls, cover that never blocks the lane mouths.
  [1.4, 1.2, 1.4, -4.5, 0.6, 10.4, 'hairline'],
  [1.4, 1.2, 1.4, 4.5, 0.6, 10.4, 'hairline'],
  [4.2, 1, 0.8, 0, 0.5, 13.2, 'surface'],
  [1.2, 2.2, 1.2, -8.2, 1.1, 15.4, 'hairline'],
  [1.2, 2.2, 1.2, 8.2, 1.1, 15.4, 'hairline'],

  // North spawn: the ice house, with a doorway either side of the mid pillars.
  [6, 1, 0.8, 0, 0.5, -14.4, 'surface'],
  [1.4, 1.2, 1.4, -7.2, 0.6, -17.2, 'hairline'],
  [1.4, 1.2, 1.4, 7.2, 0.6, -17.2, 'hairline'],
];

// Painted floor squares mark the two plant sites; the lamps stand at their corners.
const PAINT = [
  [5.4, 0.02, 4.6, -14, 0.02, -10, 'accent'],
  [5.4, 0.02, 4.6, 14, 0.02, -10, 'accent'],
];

// Trim: ceiling lines and the two site boards. Nothing here collides with a body, and each board
// hangs off a ceiling beam, so it reads as a sign over the site's mouth rather than a block in
// mid-air.
const TRIMS = [
  [40.6, 0.3, 0.5, 0, 4.4, -6.5, 'hairline'],
  [40.6, 0.3, 0.5, 0, 4.4, -13.5, 'hairline'],
  [40.6, 0.3, 0.5, 0, 4.4, 9.5, 'hairline'],
  [0.5, 0.3, 36.6, -13.5, 4.4, 0, 'hairline'],
  [0.5, 0.3, 36.6, 13.5, 4.4, 0, 'hairline'],
  [3.8, 1.2, 0.3, -14, 3.6, -6.5, 'accent'],
  [3.8, 1.2, 0.3, 14, 3.6, -6.5, 'accent'],
];

const LAMPS = [
  [-14, 3.4, -13.2],
  [-14, 3.4, -6.8],
  [14, 3.4, -13.2],
  [14, 3.4, -6.8],
  [0, 3.4, 11],
];

export const SITES = {
  A: { x: -14, z: -10, radius: 3.2 },
  B: { x: 14, z: -10, radius: 3.2 },
};

export const SPAWNS = {
  tide: [
    { x: 0, z: 15.4 },
    { x: -3, z: 15.8 },
    { x: 3, z: 15.8 },
  ],
  salt: [
    { x: 0, z: -15.6 },
    { x: -5, z: -15.2 },
    { x: 5, z: -15.2 },
  ],
};

// Waypoint lanes. A route is a list of floor points a body walks in order; the last point is
// where it holds. They keep clear of every solid box, so a bot that follows one never clips.
export const ROUTES = {
  quayToA: [[0, 14.4], [-15.6, 12.6], [-16.4, 6], [-16.4, 1], [-15.8, -4], [-14, -8.6]],
  yardToB: [[0, 14.4], [15.6, 12.6], [16.4, 6], [16.4, 1], [15.8, -4], [14, -8.6]],
  hallToMid: [[0, 14.4], [0, 11], [-5.4, 7.4], [-5.4, 1], [-5.4, -4.4], [-4.6, -8.2]],
  holdA: [[-6.2, -15.4], [-11.4, -15.4], [-14.6, -12.6]],
  holdB: [[6.2, -15.4], [11.4, -15.4], [13.4, -11.6]],
  holdMid: [[-5.2, -15.4], [-2.6, -12.2], [-2.6, -8.4]],
  rotateAToB: [[-14.6, -12.6], [-8, -13.6], [0, -13.8], [8, -13.6], [13.4, -11.6]],
  rotateBToA: [[13.4, -11.6], [8, -13.6], [0, -13.8], [-8, -13.6], [-14.6, -12.6]],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.9,
      metalness: name === 'surface' ? 0.12 : 0.03,
    });
  }
  materials.accent.emissive = new THREE.Color(PALETTE.accent);
  materials.accent.emissiveIntensity = 0.14;

  const colliders = [];
  const shootables = [];

  function solid(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Trim: the pieces that are looked at, never bumped into. They sit out of body height (beams
  // overhead, boards on a wall) so nothing the bodies do needs them as a collider, and they cast
  // no shadow, which keeps the one shadow map on the map itself.
  function trim(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  for (const spec of BOXES) solid(...spec);
  for (const spec of TRIMS) trim(...spec);
  for (const spec of PAINT) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec[0], spec[1], spec[2]), materials[spec[6]]);
    mesh.position.set(spec[3], spec[4], spec[5]);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Lamps: a thin post and a warm point light, the only lights below roof height.
  const postMaterial = materials.hairline;
  for (const [x, y, z] of LAMPS) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, y, 0.16), postMaterial);
    post.position.set(x, y / 2, z);
    post.castShadow = true;
    group.add(post);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), materials.accent);
    bulb.position.set(x, y, z);
    group.add(bulb);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 16, 26, 2);
    light.position.set(x, y - 0.2, z);
    scene.add(light);
  }

  const ambient = new THREE.AmbientLight(new THREE.Color(PALETTE.muted), 0.7);
  scene.add(ambient);

  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.muted), new THREE.Color(PALETTE.surface), 4.2);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 3.0);
  key.position.set(12, 18, 10);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 2.2);
  fill.position.set(-10, 11, 12);
  scene.add(fill);

  return { colliders, shootables, group };
}
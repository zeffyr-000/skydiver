/**
 * Bakes the Mode 7 sprite sheets from voxel models (see tools/lib/voxel.mjs):
 * the biplane, the canopy rig, the diver, the drop-zone props, balloons and
 * clouds — each rendered at the yaw/elevation steps the renderer picks from.
 *
 * Writes public/assets/sprites/baked/*.png and the generated manifest
 * src/app/features/game/engine/baked-sprites.ts (frame sizes, anchors,
 * pixels-per-metre, yaw/elevation layout).
 *
 * Run: node tools/bake-voxels.mjs  (deterministic: no diff on re-run)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.mjs';
import { IDENTITY, Materials, mul, renderView, rotX, rotY, rotZ, strip, VoxelModel } from './lib/voxel.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Pixels-per-metre multiplier for every sheet. The ppm values below were set for
 * a 216-line canvas; the game now renders 360 lines (viewport.ts BASE_H), so the
 * sheets are baked 360/216 denser to keep one sheet pixel ≈ one screen pixel at
 * the distances each sprite is usually seen from. Keep every model's voxel size
 * under ~1/ppm (after this factor) or its surface splats leave holes.
 */
const DENSITY = 360 / 216;
const OUT_DIR = join(ROOT, 'public', 'assets', 'sprites', 'baked');
const MANIFEST = join(ROOT, 'src', 'app', 'features', 'game', 'engine', 'baked-sprites.ts');
const DEG = Math.PI / 180;

// ------------------------------------------------------------- materials ---
// Golden-hour ramps: cool violet shadows → warm amber highlights, anchored on
// the project palette (_tokens.scss / generate-sprites.mjs).
const M = new Materials();
const red = M.add('red', ['#3a1020', '#6a1a22', '#8f231c', '#c1352b', '#e0604a', '#f6a070']);
const redDark = M.add('redDark', ['#2a0c16', '#4e1420', '#6a1a22', '#8f231c', '#b0402e']);
const cream = M.add('cream', ['#4e4052', '#857288', '#c9b285', '#e8d8b0', '#fff1d0', '#fffbf0']);
const brass = M.add('brass', ['#3a2614', '#6a4a1e', '#a9781f', '#d9a441', '#f2c866', '#fff2b8']);
const leather = M.add('leather', ['#24160f', '#432a1a', '#6a4426', '#8f5e34', '#b8824a']);
const skin = M.add('skin', ['#4a2a26', '#7a4a3a', '#b07a56', '#e0a878', '#f8cc98']);
const leaf = M.add('leaf', ['#16241a', '#24401e', '#365a28', '#4f7a34', '#729a44', '#b2c260']);
const leafDark = M.add('leafDark', ['#101a14', '#1a2e1c', '#284628', '#386030', '#56803e']);
const poplar = M.add('poplar', ['#1a2a18', '#2e4a22', '#44682c', '#5e8838', '#8aac4c', '#c4cc6a']);
const wood = M.add('wood', ['#22140e', '#3e2618', '#62402a', '#86603a', '#b08654']);
const stone = M.add('stone', ['#26222e', '#44404e', '#666070', '#8e8682', '#b8ae98', '#e0d2b2']);
const hay = M.add('hay', ['#3e2a12', '#6e5020', '#a07c34', '#d0a84a', '#ecca6a', '#fff0a8']);
const barnRed = M.add('barnRed', ['#2e0e14', '#561a1e', '#7e2622', '#a63a2c', '#cc6644', '#eaa070']);
const slate = M.add('slate', ['#16141e', '#26242e', '#3a3646', '#524c5e', '#746a7a']);
const tile = M.add('tile', ['#3a1812', '#64281a', '#904024', '#bc5e34', '#de8a52']);
const wall = M.add('wall', ['#4c4048', '#7e7070', '#b4a48a', '#ddd0b0', '#f8eccc']);
const black = M.add('black', ['#0c0c12', '#18181f', '#26262e', '#3a3a42']);
const glass = M.add('glass', ['#141c2a', '#22304a', '#38507a', '#5878a8'], { flat: true });
const navy = M.add('navy', ['#10162a', '#1c2a50', '#2c4478', '#4a6aa4', '#7a9acc']);
const green = M.add('green', ['#122416', '#1e3e22', '#2e5e30', '#4a8040', '#76a85a']);
const mustard = M.add('mustard', ['#3a2a10', '#6a4e18', '#9c7428', '#c89c38', '#e8c45a']);
const gold = M.add('gold', ['#3e2a0c', '#74521a', '#b08228', '#e0b03c', '#f8d860', '#fff4b0']);
const sky = M.add('sky', ['#141e3a', '#22346a', '#34508a', '#5b7bb0', '#8aaad0']);
const cloud = M.add('cloud', ['#5e5470', '#857a96', '#b4a6b4', '#dccabe', '#f6e4cc', '#fff6e6', '#ffffff']);
const tin = M.add('tin', ['#1e2228', '#363c42', '#545a5c', '#76786e', '#a29c84', '#cec2a0']);
const tinDark = M.add('tinDark', ['#14161c', '#24282e', '#363c42', '#4c5052']);
const propBlur = M.add('propBlur', ['#c9b285', '#e8d8b0', '#fff1d0'], { dither: 0.16, flat: true });
const straw = M.add('straw', ['#4a3416', '#80602a', '#c09a48', '#e6c46c', '#fae49a']);

/** Stable hash → [0, 1) for voxel noise. */
function h3(x, y, z, s = 0) {
  let n = Math.imul((x * 73.1) | 0, 374761393) ^ Math.imul((y * 91.7) | 0, 668265263) ^ Math.imul((z * 57.3) | 0, 2246822519) ^ s;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------- humanoid ---

/**
 * A 1920s aviator (leather helmet, brass goggles, cream scarf, red suit) built
 * from joint positions. `j` maps joint names to [x, y, z]; missing ones use the
 * standing defaults. Returns nothing: paints into `m`.
 */
function aviator(m, j, opts = {}) {
  const suit = opts.suit ?? red;
  const P = {
    head: [0, 0, 1.62],
    neck: [0, 0, 1.45],
    pelvis: [0, 0, 0.95],
    lShoulder: [-0.2, 0, 1.4],
    rShoulder: [0.2, 0, 1.4],
    lElbow: [-0.28, 0, 1.12],
    rElbow: [0.28, 0, 1.12],
    lHand: [-0.3, 0.02, 0.86],
    rHand: [0.3, 0.02, 0.86],
    lHip: [-0.1, 0, 0.92],
    rHip: [0.1, 0, 0.92],
    lKnee: [-0.11, 0.03, 0.5],
    rKnee: [0.11, 0.03, 0.5],
    lFoot: [-0.12, 0.02, 0.08],
    rFoot: [0.12, 0.02, 0.08],
    scarfTip: [0.12, -0.45, 1.3],
    ...j,
  };
  const mid = (a, b, t = 0.5) => a.map((v, i) => v + (b[i] - v) * t);
  // Torso: a tapered capsule from pelvis to neck.
  m.capsule(P.pelvis, mid(P.pelvis, P.neck, 0.85), 0.15, suit, 0.19);
  // Belt.
  m.capsule(mid(P.pelvis, P.neck, 0.12), mid(P.pelvis, P.neck, 0.2), 0.16, leather);
  // Limbs.
  for (const s of ['l', 'r']) {
    m.capsule(P[`${s}Shoulder`], P[`${s}Elbow`], 0.07, suit);
    m.capsule(P[`${s}Elbow`], P[`${s}Hand`], 0.06, suit);
    m.sphere(...P[`${s}Hand`], 0.065, leather);
    m.capsule(P[`${s}Hip`], P[`${s}Knee`], 0.09, suit);
    m.capsule(P[`${s}Knee`], P[`${s}Foot`], 0.075, suit);
    m.sphere(...P[`${s}Foot`], 0.085, leather);
  }
  // Head: leather helmet with ear flaps, brass goggles on the brow.
  m.sphere(...P.head, 0.13, skin);
  m.ellipsoid(P.head[0], P.head[1] - 0.01, P.head[2] + 0.03, 0.14, 0.14, 0.12, leather);
  const fwd = opts.face ?? [0, 1, 0];
  const g = P.head.map((v, i) => v + fwd[i] * 0.11);
  m.ellipsoid(g[0], g[1], g[2] + 0.03, 0.12, 0.05, 0.04, brass);
  // Scarf: knotted at the neck, its tail streaming in the wind.
  m.sphere(...P.neck, 0.08, cream);
  m.capsule(P.neck, P.scarfTip, 0.05, cream, 0.03);
}

// --------------------------------------------------------------- models ---

function biplane() {
  const m = new VoxelModel(0.07, [
    [-5, 5],
    [-4.2, 3.4],
    [-1.6, 2],
  ]);
  // Fuselage: tapering from the cowling to the tail.
  m.capsule([0, -3.7, 0.35], [0, 2.3, 0.05], 0.16, red, 0.55);
  m.capsule([0, -1.2, 0.52], [0, 2.0, 0.42], 0.06, cream); // cheat line
  // Brass cowling, spinner and the propeller disc.
  m.capsule([0, 2.25, 0.05], [0, 2.95, 0.05], 0.58, brass, 0.5, false);
  m.sphere(0, 3.05, 0.05, 0.2, brass);
  m.region(-1.35, 3.1, -1.3, 1.35, 3.2, 1.4, (x, _y, z) => (Math.hypot(x, z - 0.05) < 1.3 ? propBlur : 0));
  // Cockpit + pilot.
  m.carve(-0.3, -1.0, 0.45, 0.3, -0.1, 0.8);
  m.sphere(0, -0.55, 0.62, 0.17, leather);
  m.ellipsoid(0, -0.42, 0.66, 0.15, 0.05, 0.05, brass);
  m.capsule([-0.32, 0.1, 0.62], [0.32, 0.1, 0.62], 0.03, glass); // windscreen
  // Wings: cream with red tips and a red leading band; upper one staggered forward.
  const wingMat = (x, y, yLead) => (Math.abs(x) > 4.0 ? red : y > yLead - 0.18 ? red : cream);
  m.box(-4.75, -0.35, 1.35, 4.75, 0.95, 1.5, (x, y) => wingMat(x, y, 0.95));
  m.box(-4.4, -0.5, -0.32, 4.4, 0.75, -0.18, (x, y) => wingMat(x, y, 0.75));
  // Roundels on the upper wing.
  for (const s of [-1, 1]) {
    m.region(s * 3.3 - 0.5, -0.1, 1.49, s * 3.3 + 0.5, 0.8, 1.53, (x, y) => {
      const d = Math.hypot(x - s * 3.3, y - 0.3);
      return d < 0.42 ? (d < 0.18 ? red : d < 0.3 ? cream : navy) : 0;
    });
  }
  // Tail: stabiliser and fin.
  m.box(-1.7, -4.0, 0.3, 1.7, -3.25, 0.4, (x) => (Math.abs(x) > 1.3 ? red : cream));
  m.region(-0.05, -4.05, 0.35, 0.05, -3.1, 1.45, (_x, y, z) => (z - 0.35 < (y + 4.05) * 1.25 + 0.15 ? (z > 1.0 ? cream : red) : 0));
  // Wheels.
  for (const s of [-1, 1]) {
    m.region(s * 0.85 - 0.09, 1.05, -1.55, s * 0.85 + 0.09, 1.75, -0.85, (_x, y, z) => {
      const d = Math.hypot(y - 1.4, z - 1.2 * -1);
      return d < 0.34 ? (d < 0.14 ? brass : black) : 0;
    });
  }
  // Struts, cabane and rigging wires.
  const strut = '#5a3c24';
  for (const x of [-3.1, 3.1, -1.2, 1.2]) {
    m.line([x, 0.55, -0.18], [x, 0.7, 1.35], strut);
    m.line([x, -0.25, -0.18], [x, -0.1, 1.35], strut);
  }
  m.line([-0.25, 0.4, 0.45], [-0.6, 0.5, 1.35], strut);
  m.line([0.25, 0.4, 0.45], [0.6, 0.5, 1.35], strut);
  for (const s of [-1, 1]) {
    m.line([s * 0.4, 1.4, -0.4], [s * 0.85, 1.4, -1.2], strut);
    m.line([s * 0.4, 0.8, -0.3], [s * 0.85, 1.4, -1.2], strut);
    m.line([s * 3.1, 0.6, -0.18], [s * 1.2, 0.7, 1.35], '#a89e8c');
    m.line([s * 1.2, 0.6, -0.18], [s * 3.1, 0.7, 1.35], '#a89e8c');
  }
  return m;
}

/** Round silk canopy rig; `s` = inflation (1 = open), `stall` = collapsing. */
function canopyRig({ s = 1, stall = false } = {}) {
  const m = new VoxelModel(0.05, [
    [-4.2, 4.2],
    [-4.2, 4.2],
    [-1.2, 9],
  ]);
  const R = stall ? 2.4 : 3.75 * Math.pow(s, 0.85);
  const H = stall ? 1.1 : 2.3 + (1 - s) * 2.2;
  const skirt = stall ? 5.2 : 5.6 + (1 - s) * 0.4;
  const thick = 0.16;
  const gore = (x, y) => {
    const a = Math.atan2(y, x) + Math.PI;
    return Math.floor((a / (Math.PI * 2)) * 12) % 2 ? red : cream;
  };
  m.region(-R - 0.2, -R - 0.2, skirt, R + 0.2, R + 0.2, skirt + H + 0.2, (x, y, z) => {
    const wob = stall ? 0.35 * Math.sin(Math.atan2(y, x) * 5 + z * 3) : 0;
    const t = (z - skirt) / H;
    if (t < 0 || t > 1) return 0;
    // A shell between two ellipsoids: even thickness, crown included (a
    // horizontal-only thickness test left the near-flat crown hollow).
    const Rw = R + wob;
    const r = Math.hypot(x, y);
    const outer = (r / Rw) ** 2 + t * t;
    const inner = (r / Math.max(0.1, Rw - thick - 0.05)) ** 2 + ((z - skirt) / Math.max(0.1, H - thick)) ** 2;
    if (outer > 1 || inner < 1) return 0;
    return gore(x, y);
  });
  // Suspension lines to the risers at the shoulders.
  const lines = 12;
  for (let k = 0; k < lines; k++) {
    const a = (k / lines) * Math.PI * 2 + Math.PI / lines;
    const side = Math.cos(a) < 0 ? -1 : 1;
    const sl = stall ? 0.75 : 1;
    m.line([Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, skirt + 0.05], [side * 0.22 * sl, 0, 1.75], '#e8dcc0');
  }
  // The diver hangs from the risers, hands up on the toggles.
  aviator(m, {
    head: [0, 0.02, 0.72],
    neck: [0, 0, 0.56],
    pelvis: [0, 0, 0.02],
    lShoulder: [-0.2, 0, 0.5],
    rShoulder: [0.2, 0, 0.5],
    lElbow: [-0.27, 0.05, 0.85],
    rElbow: [0.27, 0.05, 0.85],
    lHand: [-0.22, 0.02, 1.2],
    rHand: [0.22, 0.02, 1.2],
    lHip: [-0.1, 0, -0.02],
    rHip: [0.1, 0, -0.02],
    lKnee: [-0.12, 0.1, -0.42],
    rKnee: [0.12, 0.06, -0.44],
    lFoot: [-0.12, 0.02, -0.85],
    rFoot: [0.13, -0.02, -0.86],
    scarfTip: [0.15, -0.5, 0.45],
  });
  m.line([-0.2, 0, 0.5], [-0.22, 0, 1.75], '#6a4426');
  m.line([0.2, 0, 0.5], [0.22, 0, 1.75], '#6a4426');
  return m;
}

/** Spent canopy: a crumpled heap of silk with its gores, lines running back to the diver. */
function canopyDown() {
  const m = new VoxelModel(0.05, [
    [-3.2, 3.2],
    [-0.6, 6.4],
    [0, 1.2],
  ]);
  const gore = (x, y) => {
    const a = Math.atan2(y - 3.2, x) + Math.PI;
    return Math.floor((a / (Math.PI * 2)) * 10) % 2 ? red : cream;
  };
  for (let k = 0; k <= 10; k++) {
    const y = 1.2 + k * 0.45;
    const x = Math.sin(k * 1.7) * 0.7;
    const r = 1.5 + Math.sin(k * 2.3) * 0.35 - Math.abs(k - 5) * 0.08;
    m.ellipsoid(x, y, 0.12 + (k % 3) * 0.06, r, 0.75, 0.42 + (k % 2) * 0.18, gore);
  }
  m.carve(-3.2, -0.6, 0, 3.2, 6.4, 0.03);
  for (let k = 0; k < 7; k++) m.line([0, 0, 0.1], [Math.sin(k * 0.9) * 1.3, 1.1, 0.25], '#e8dcc0');
  return m;
}

/** Free-fall diver, belly to earth, head forward; `t` 0 = full arch … 1 = full track. */
function diverFall(t) {
  const m = new VoxelModel(0.04, [
    [-1, 1],
    [-1.3, 1],
    [-0.5, 0.6],
  ]);
  const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * t);
  // Prone body: the "standing" skeleton rotated so the head points +y.
  aviator(
    m,
    {
      head: [0, 0.62, 0.04],
      neck: [0, 0.45, 0.02],
      pelvis: [0, -0.08, 0],
      lShoulder: [-0.21, 0.38, 0.02],
      rShoulder: [0.21, 0.38, 0.02],
      lElbow: lerp([-0.55, 0.45, 0.12], [-0.3, 0.02, 0.06]),
      rElbow: lerp([0.55, 0.45, 0.12], [0.3, 0.02, 0.06]),
      lHand: lerp([-0.6, 0.78, 0.18], [-0.27, -0.32, 0.08]),
      rHand: lerp([0.6, 0.78, 0.18], [0.27, -0.32, 0.08]),
      lHip: [-0.1, -0.12, 0],
      rHip: [0.1, -0.12, 0],
      lKnee: lerp([-0.36, -0.5, 0.08], [-0.1, -0.55, 0.02]),
      rKnee: lerp([0.36, -0.5, 0.08], [0.1, -0.55, 0.02]),
      lFoot: lerp([-0.4, -0.72, 0.38], [-0.08, -0.98, 0.05]),
      rFoot: lerp([0.4, -0.72, 0.38], [0.08, -0.98, 0.05]),
      scarfTip: [0.18, 0.2, 0.42],
    },
    { face: [0, 0, -1] },
  );
  return m;
}

/** Standing diver for the landing outro: 0 crouch, 1 rise, 2 stand, 3/4 wave, 5 arms up. */
function diverLand(k) {
  const m = new VoxelModel(0.04, [
    [-0.8, 0.8],
    [-0.8, 0.8],
    [0, 2.2],
  ]);
  const crouch = k === 0 ? 0.42 : k === 1 ? 0.18 : 0;
  const d = (p) => [p[0], p[1], p[2] - crouch * (p[2] > 0.5 ? 1 : 0.4)];
  const wave = k === 3 ? 0.25 : k === 4 ? -0.15 : 0;
  const up = k >= 3;
  const both = k === 5;
  aviator(m, {
    head: d([0, 0.02, 1.62]),
    neck: d([0, 0, 1.45]),
    pelvis: d([0, 0, 0.95]),
    lShoulder: d([-0.2, 0, 1.4]),
    rShoulder: d([0.2, 0, 1.4]),
    lElbow: both ? d([-0.38, 0, 1.68]) : d([-0.28, 0.08, 1.12]),
    rElbow: up ? d([0.38, 0, 1.68]) : d([0.28, 0.08, 1.12]),
    lHand: both ? d([-0.42, 0, 1.98]) : d([-0.3, 0.12, 0.88]),
    rHand: up ? d([0.44 + wave, 0, 1.98]) : d([0.3, 0.12, 0.88]),
    lKnee: [-0.12, 0.12 + crouch * 0.4, 0.5 - crouch * 0.2],
    rKnee: [0.12, 0.12 + crouch * 0.4, 0.5 - crouch * 0.2],
    lFoot: [-0.14, 0, 0.08],
    rFoot: [0.14, 0, 0.08],
    scarfTip: d([0.2, -0.4, 1.25]),
  });
  return m;
}

/** Crashed diver sprawled on the ground; `k` twitches the limbs. */
function diverCrash(k) {
  const m = new VoxelModel(0.04, [
    [-1.2, 1.2],
    [-1.3, 1.3],
    [0, 0.6],
  ]);
  const t = k % 2 ? 0.05 : 0;
  aviator(m, {
    head: [0.1, 0.72, 0.13],
    neck: [0.06, 0.55, 0.12],
    pelvis: [0, -0.05, 0.12],
    lShoulder: [-0.2, 0.48, 0.12],
    rShoulder: [0.22, 0.5, 0.12],
    lElbow: [-0.55, 0.62, 0.1 + t],
    rElbow: [0.5, 0.35, 0.1],
    lHand: [-0.7, 0.92, 0.1],
    rHand: [0.75, 0.2, 0.1 + t],
    lHip: [-0.1, -0.1, 0.12],
    rHip: [0.1, -0.1, 0.12],
    lKnee: [-0.3, -0.5, 0.1],
    rKnee: [0.25, -0.52, 0.12 + t],
    lFoot: [-0.25, -0.92, 0.1],
    rFoot: [0.5, -0.8, 0.1],
    scarfTip: [-0.3, 0.2, 0.08],
  });
  return m;
}

// Props (origin at the base, on the ground).

function oak(seed) {
  const m = new VoxelModel(0.1, [
    [-4.2, 4.2],
    [-4.2, 4.2],
    [0, 8.6],
  ]);
  m.cylinderZ(0, 0, 0, 3.6, 0.38, wood, 0.24);
  m.capsule([0, 0, 2.6], [1.2, 0.3, 3.8], 0.14, wood);
  const blobs = [
    [0, 0, 5.4, 2.7],
    [1.5, 0.6, 4.7, 1.9],
    [-1.4, -0.5, 4.9, 2.0],
    [0.4, -1.3, 5.7, 1.8],
    [-0.5, 1.2, 6.3, 1.7],
    [1.0, -0.2, 6.6, 1.5],
  ];
  for (const [x, y, z, r] of blobs) m.sphere(x, y, z, r * (0.92 + h3(x, y, seed) * 0.16), leaf);
  m.carve(-4.2, -4.2, 2.5, 4.2, 4.2, 8.6, (x, y, z) => h3(x * 10, y * 10, z * 10, seed) < 0.06);
  return m;
}

function poplarTree(seed) {
  const m = new VoxelModel(0.1, [
    [-1.8, 1.8],
    [-1.8, 1.8],
    [0, 12],
  ]);
  m.cylinderZ(0, 0, 0, 2.2, 0.25, wood, 0.18);
  m.ellipsoid(0, 0, 6.6, 1.45, 1.45, 5.2, poplar);
  m.carve(-1.8, -1.8, 1.5, 1.8, 1.8, 12, (x, y, z) => h3(x * 10, y * 10, z * 10, seed) < 0.05);
  return m;
}

function pine() {
  const m = new VoxelModel(0.1, [
    [-2.6, 2.6],
    [-2.6, 2.6],
    [0, 10.5],
  ]);
  m.cylinderZ(0, 0, 0, 1.6, 0.28, wood, 0.22);
  m.capsule([0, 0, 1.2], [0, 0, 5.2], 2.4, leafDark, 0.25, false);
  m.capsule([0, 0, 3.6], [0, 0, 7.8], 1.9, leafDark, 0.2, false);
  m.capsule([0, 0, 6.0], [0, 0, 10.2], 1.3, leafDark, 0.05, false);
  return m;
}

function bush(seed) {
  const m = new VoxelModel(0.08, [
    [-1.8, 1.8],
    [-1.8, 1.8],
    [0, 2.2],
  ]);
  m.sphere(0, 0, 0.8, 1.0, leaf);
  m.sphere(0.8, 0.3, 0.6, 0.75, leaf);
  m.sphere(-0.7, -0.2, 0.65, 0.8, leaf);
  m.carve(-1.8, -1.8, 0, 1.8, 1.8, 0.05);
  m.carve(-1.8, -1.8, 0.4, 1.8, 1.8, 2.2, (x, y, z) => h3(x * 12, y * 12, z * 12, seed) < 0.07);
  return m;
}

function rock() {
  const m = new VoxelModel(0.06, [
    [-1.2, 1.2],
    [-1.2, 1.2],
    [0, 1.3],
  ]);
  m.ellipsoid(0, 0, 0.35, 1.0, 0.8, 0.75, stone);
  m.ellipsoid(0.45, 0.2, 0.55, 0.55, 0.5, 0.55, stone);
  m.carve(-1.2, -1.2, 0, 1.2, 1.2, 0.02);
  return m;
}

function bale() {
  const m = new VoxelModel(0.06, [
    [-1, 1],
    [-1, 1],
    [0, 1.6],
  ]);
  m.region(-0.7, -0.8, 0, 0.7, 0.8, 1.6, (x, y, z) => {
    const r = Math.hypot(y, z - 0.78);
    if (r > 0.78) return 0;
    return Math.abs(x) > 0.62 && Math.floor(r * 9) % 2 ? straw : hay;
  });
  return m;
}

function marquee() {
  const m = new VoxelModel(0.08, [
    [-3, 3],
    [-3, 3],
    [0, 5.4],
  ]);
  const stripe = (x, y) => (Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 16) % 2 ? red : cream);
  m.region(-2.5, -2.5, 0, 2.5, 2.5, 2.2, (x, y) => (Math.hypot(x, y) < 2.4 ? stripe(x, y) : 0));
  m.region(-2.9, -2.9, 2.2, 2.9, 2.9, 4.4, (x, y, z) => (Math.hypot(x, y) < 2.8 * (1 - (z - 2.2) / 2.2) ? stripe(x, y) : 0));
  m.carve(-0.6, 2.0, 0, 0.6, 2.6, 1.7); // doorway
  m.region(-0.6, 2.0, 0, 0.6, 2.2, 1.7, () => leather);
  m.line([0, 0, 4.3], [0, 0, 5.3], '#5a3c24');
  m.box(0, -0.02, 4.85, 0.7, 0.02, 5.25, red);
  return m;
}

function spectator(shirt, cheer, hat) {
  const m = new VoxelModel(0.05, [
    [-0.7, 0.7],
    [-0.7, 0.7],
    [0, 2.3],
  ]);
  aviator(
    m,
    {
      lElbow: cheer ? [-0.36, 0, 1.66] : [-0.27, 0.05, 1.12],
      rElbow: cheer ? [0.36, 0, 1.66] : [0.27, 0.05, 1.12],
      lHand: cheer ? [-0.4, 0, 1.98] : [-0.28, 0.08, 0.88],
      rHand: cheer ? [0.4, 0, 1.98] : [0.28, 0.08, 0.88],
      scarfTip: [0, 0.1, 1.42],
    },
    { suit: shirt },
  );
  // Straw boater or cloth cap instead of a flying helmet.
  m.region(-0.3, -0.3, 1.66, 0.3, 0.3, 1.86, (x, y, z) => {
    const r = Math.hypot(x, y);
    if (hat === 'boater') return (z < 1.71 && r < 0.26) || (r < 0.15 && z < 1.84) ? straw : 0;
    return r < 0.16 && z < 1.8 ? leather : 0;
  });
  return m;
}

function windsock() {
  const m = new VoxelModel(0.05, [
    [-0.3, 2.8],
    [-0.6, 0.6],
    [0, 5.4],
  ]);
  m.cylinderZ(0, 0, 0, 5.1, 0.07, (_x, _y, z) => (Math.floor(z * 1.5) % 2 ? red : cream));
  m.region(0.05, -0.5, 4.2, 2.6, 0.5, 5.1, (x, y, z) => {
    const t = (x - 0.05) / 2.5;
    const r = 0.42 - t * 0.26;
    const cz = 4.85 - t * t * 0.35;
    const d = Math.hypot(y, z - cz);
    return d < r && d > r - 0.1 ? (Math.floor(t * 5) % 2 ? cream : red) : 0;
  });
  return m;
}

function barn() {
  const m = new VoxelModel(0.1, [
    [-4.6, 4.6],
    [-3.6, 3.6],
    [0, 7]
  ]);
  m.box(-4, -3, 0, 4, 3, 4, (x, y, z) => (Math.abs(x) > 3.85 || Math.abs(y) > 2.85 ? (z < 3.9 && Math.abs(x) > 3.85 && Math.abs(y) > 2.85 ? cream : barnRed) : barnRed));
  m.region(-4.3, -3.4, 4, 4.3, 3.4, 6.8, (x, _y, z) => (z <= 6.7 - Math.abs(x) * 0.68 ? slate : 0));
  // Big door with a white X brace, hayloft hatch.
  m.box(-1.6, 3.0, 0, 1.6, 3.1, 3.0, wood);
  m.line([-1.5, 3.12, 0.1], [1.5, 3.12, 2.9], '#f0e4c8');
  m.line([1.5, 3.12, 0.1], [-1.5, 3.12, 2.9], '#f0e4c8');
  m.line([-1.6, 3.12, 3.0], [1.6, 3.12, 3.0], '#f0e4c8');
  m.box(-0.7, 3.0, 4.3, 0.7, 3.12, 5.3, wood);
  return m;
}

function house() {
  const m = new VoxelModel(0.1, [
    [-3.6, 3.6],
    [-3.0, 3.0],
    [0, 6.4],
  ]);
  m.box(-3, -2.4, 0, 3, 2.4, 3.2, wall);
  m.region(-3.3, -2.8, 3.2, 3.3, 2.8, 5.6, (_x, y, z) => (z <= 5.5 - Math.abs(y) * 0.85 ? tile : 0));
  m.box(1.6, -1.0, 4.2, 2.2, -0.4, 6.2, (_x, _y, z) => (z > 6.0 ? slate : barnRed));
  for (const x of [-1.8, 1.8]) m.box(x - 0.45, 2.38, 1.2, x + 0.45, 2.45, 2.3, glass);
  m.box(-0.5, 2.38, 0, 0.5, 2.45, 2.1, wood);
  for (const x of [-1.6, 1.6]) m.box(x - 0.45, -2.45, 1.2, x + 0.45, -2.38, 2.3, glass);
  return m;
}

function windmill(anim) {
  const m = new VoxelModel(0.1, [
    [-6.2, 6.2],
    [-2.8, 3.2],
    [0, 15.4],
  ]);
  m.cylinderZ(0, 0, 0, 8, 2.3, stone, 1.55);
  m.ellipsoid(0, 0.1, 8.4, 1.8, 2.0, 1.2, wood);
  m.box(-0.5, 2.0, 0, 0.5, 2.2, 1.9, wood); // door
  m.box(-0.4, 1.7, 4.2, 0.4, 1.95, 5.0, glass);
  const hub = [0, 2.3, 8.5];
  m.sphere(...hub, 0.35, wood);
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2) + anim * (Math.PI / 4) + 0.3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    m.region(hub[0] - 6, hub[1] - 0.12, hub[2] - 6, hub[0] + 6, hub[1] + 0.12, hub[2] + 6, (x, _y, z) => {
      const u = (x - hub[0]) * ca + (z - hub[2]) * sa; // along the sail
      const v = -(x - hub[0]) * sa + (z - hub[2]) * ca; // across
      if (u < 0.4 || u > 5.8) return 0;
      if (Math.abs(v) < 0.08) return wood;
      if (v > 0.08 && v < 0.95 && u > 1.0) return Math.floor(u * 2.2) % 2 && Math.abs(v - 0.5) < 0.05 ? wood : cream;
      return 0;
    });
  }
  return m;
}

function hangar() {
  const m = new VoxelModel(0.12, [
    [-5.6, 5.6],
    [-7, 7],
    [0, 5.6],
  ]);
  m.region(-5.2, -6.5, 0, 5.2, 6.5, 5.3, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (r > 5.2) return 0;
    if (Math.abs(y) > 6.3) return r < 4.6 && Math.abs(y) > 6.4 && z < 4.2 && Math.abs(x) < 3.6 ? tinDark : tin;
    return Math.floor(Math.atan2(z, x) * 9) % 2 ? tin : tinDark;
  });
  m.line([0, 6.52, 0], [0, 6.52, 4.2], '#2a2e34');
  return m;
}

function grandstand(seed) {
  const m = new VoxelModel(0.1, [
    [-6.4, 6.4],
    [-3.4, 3.4],
    [0, 5.4],
  ]);
  for (let t = 0; t < 4; t++) {
    const y = 2.4 - t * 1.2;
    m.box(-6, y - 1.2, 0, 6, y, 0.6 + t * 0.7, wood);
    // Crowd heads on each tier.
    for (let x = -5.6; x <= 5.6; x += 0.55) {
      const c = h3(x, t, 0, seed);
      if (c < 0.2) continue;
      const shirt = [navy, red, mustard, green, cream][Math.floor(c * 5)];
      m.ellipsoid(x, y - 0.5, 0.9 + t * 0.7, 0.2, 0.2, 0.3, shirt);
      m.sphere(x, y - 0.5, 1.3 + t * 0.7, 0.14, c > 0.6 ? straw : skin);
    }
  }
  // Roof on posts, with bunting.
  m.box(-6.2, -3.2, 4.6, 6.2, 2.6, 4.8, (x) => (Math.floor((x + 6.2) / 1.0) % 2 ? red : cream));
  for (const x of [-6, 0, 6]) m.line([x, 2.4, 0], [x, 2.4, 4.6], '#3e2618');
  for (let x = -6; x < 6; x += 1) {
    m.line([x, 2.6, 4.55], [x + 0.5, 2.6, 4.1], '#c1352b');
    m.line([x + 0.5, 2.6, 4.1], [x + 1, 2.6, 4.55], '#d9a441');
  }
  return m;
}

/** The moving target: a fairground float with a painted target, drawn by a horse (+y). */
function targetWagon() {
  const m = new VoxelModel(0.06, [
    [-2.6, 2.6],
    [-3.6, 7.4],
    [0, 2.8],
  ]);
  // Wheels under the bed.
  for (const sx of [-1, 1]) {
    for (const wy of [-2.0, 2.0]) {
      m.region(sx * 2.2 - 0.1, wy - 0.7, 0, sx * 2.2 + 0.1, wy + 0.7, 1.4, (_x, y, z) => {
        const d = Math.hypot(y - wy, z - 0.65);
        return d < 0.65 ? (d > 0.5 ? black : d < 0.14 ? brass : (Math.floor(Math.atan2(z - 0.65, y - wy) * 2.5) % 2 ? wood : 0)) : 0;
      });
    }
  }
  // Bed with red-and-cream skirt, and the painted target on top.
  m.box(-2.1, -3.0, 0.75, 2.1, 3.0, 1.2, (x, y, z) =>
    z < 1.1 ? (Math.floor((x + y + 10) / 0.9) % 2 ? red : cream) : wood,
  );
  m.region(-2.1, -2.3, 1.2, 2.1, 2.3, 1.27, (x, y) => {
    const d = Math.hypot(x, y);
    if (d > 2.05) return 0;
    if (d < 0.6) return d < 0.25 ? cream : red;
    if (d < 1.1) return cream;
    if (d < 1.55) return red;
    return d < 1.75 ? cream : brass;
  });
  // Shafts and the horse.
  m.line([-0.5, 3.0, 1.0], [-0.4, 4.6, 1.3], '#5a3c24');
  m.line([0.5, 3.0, 1.0], [0.4, 4.6, 1.3], '#5a3c24');
  m.ellipsoid(0, 5.0, 1.5, 0.42, 1.05, 0.5, leather);
  m.capsule([0, 5.8, 1.75], [0, 6.35, 2.35], 0.22, leather);
  m.ellipsoid(0, 6.6, 2.35, 0.17, 0.35, 0.2, leather);
  m.capsule([0, 5.75, 2.0], [0, 6.25, 2.55], 0.08, black); // mane
  for (const lx of [-0.22, 0.22]) {
    for (const ly of [4.3, 5.6]) m.capsule([lx, ly, 1.3], [lx, ly + 0.05, 0.08], 0.09, leather);
  }
  m.capsule([0, 3.95, 1.6], [0, 3.7, 0.9], 0.07, black); // tail
  // Bunting on poles at the corners.
  for (const [x, y] of [
    [-2.0, -2.9],
    [2.0, -2.9],
    [-2.0, 2.9],
    [2.0, 2.9],
  ]) {
    m.line([x, y, 1.2], [x, y, 2.6], '#5a3c24');
  }
  m.line([-2.0, -2.9, 2.55], [2.0, -2.9, 2.55], '#d9a441');
  m.line([-2.0, 2.9, 2.55], [2.0, 2.9, 2.55], '#d9a441');
  return m;
}

function lighthouse() {
  const m = new VoxelModel(0.1, [
    [-4.2, 4.2],
    [-4.2, 4.2],
    [0, 17.5],
  ]);
  m.box(-3.6, 0.8, 0, -1.2, 3.8, 2.6, wall); // keeper's cottage
  m.region(-3.9, 0.5, 2.6, -0.9, 4.1, 4.0, (_x, y, z) => (z <= 4.0 - Math.abs(y - 2.3) * 0.9 ? tile : 0));
  m.cylinderZ(0, 0, 0, 13, 2.1, (_x, _y, z) => (Math.floor(z / 2.2) % 2 ? red : cream), 1.3);
  m.cylinderZ(0, 0, 13, 13.4, 1.8, black); // gallery
  m.cylinderZ(0, 0, 13.4, 14.8, 0.95, gold); // lamp room
  m.capsule([0, 0, 14.8], [0, 0, 16.2], 1.1, red, 0.1, false); // cupola
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    m.line([Math.cos(a) * 1.75, Math.sin(a) * 1.75, 13.4], [Math.cos(a) * 1.75, Math.sin(a) * 1.75, 13.9], '#2a2a32');
  }
  return m;
}

function balloon(palette) {
  const m = new VoxelModel(0.2, [
    [-7.5, 7.5],
    [-7.5, 7.5],
    [0, 22],
  ]);
  const stripe = (x, y) => palette[Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 12) % palette.length];
  m.ellipsoid(0, 0, 14, 6.6, 6.6, 7.2, stripe);
  m.region(-6.6, -6.6, 4.5, 6.6, 6.6, 14, (x, y, z) => {
    const t = (z - 4.5) / 9.5;
    return Math.hypot(x, y) < 1.3 + t * t * 5.3 ? stripe(x, y) : 0;
  });
  m.carve(-1.3, -1.3, 4.5, 1.3, 1.3, 6, (x, y) => Math.hypot(x, y) < 1.0);
  m.box(-0.7, -0.7, 0, 0.7, 0.7, 1.1, wood);
  for (const [x, y] of [
    [-0.7, -0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [0.7, 0.7],
  ]) {
    m.line([x, y, 1.1], [x * 1.6, y * 1.6, 4.6], '#3e2618');
  }
  return m;
}

function cumulus(seed) {
  const m = new VoxelModel(0.45, [
    [-34, 34],
    [-26, 26],
    [-2, 30],
  ]);
  const r = (k) => h3(k, seed, 7);
  const puffs = 9;
  for (let k = 0; k < puffs; k++) {
    const x = (r(k) * 2 - 1) * 22;
    const y = (r(k + 30) * 2 - 1) * 12;
    const rad = 7 + r(k + 60) * 9;
    m.ellipsoid(x, y, rad * 0.55 + r(k + 90) * 6, rad * 1.3, rad, rad * 0.95, cloud);
  }
  m.carve(-34, -26, -2, 34, 26, 0.5); // flat base
  return m;
}

// ------------------------------------------------------------------ bake ---

const sheets = [];

/**
 * Bake one sheet. `views(e, c)` → { model, yaw, pose } for elevation index e and
 * column c. Frames are laid out e-major (index = e * cols + c), auto-cropped to
 * the union of their bounding boxes; the anchor is where the model origin lands.
 */
function bake(name, { ppm: basePpm, elevs, cols, yaws = 1, anim = cols / yaws, views, normalRadius, edgeDepth }) {
  const ppm = Math.round(basePpm * DENSITY * 100) / 100;
  const SIZE = 480;
  const A = SIZE / 2;
  const frames = [];
  for (let e = 0; e < elevs.length; e++) {
    for (let c = 0; c < cols; c++) {
      const v = views(e, c);
      frames.push(
        renderView(v.model, M, {
          w: SIZE,
          h: SIZE,
          ax: A,
          ay: A,
          ppm,
          yaw: v.yaw ?? 0,
          elev: elevs[e] * DEG,
          pose: v.pose ?? IDENTITY,
          normalRadius,
          edgeDepth,
        }),
      );
    }
  }
  // Union bounding box.
  let x0 = SIZE;
  let y0 = SIZE;
  let x1 = -1;
  let y1 = -1;
  for (const f of frames) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (f[(y * SIZE + x) * 4 + 3]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  const fw = x1 - x0 + 2;
  const fh = y1 - y0 + 2;
  const cropped = frames.map((f) => {
    const out = Buffer.alloc(fw * fh * 4);
    for (let y = 0; y < fh; y++) {
      f.copy(out, y * fw * 4, ((y + y0) * SIZE + x0) * 4, ((y + y0) * SIZE + x0 + fw) * 4);
    }
    return out;
  });
  const s = strip(cropped, fw, fh);
  writeFileSync(join(OUT_DIR, `${name}.png`), encodePng(s.width, s.height, s.data));
  sheets.push({ name, fw, fh, ax: A - x0, ay: A - y0, ppm, cols, yaws, anim, elevs });
  console.log(`baked ${name}.png  ${frames.length} frames ${fw}x${fh}`);
}

mkdirSync(OUT_DIR, { recursive: true });

const yawOf = (c, yaws, anim = 1) => ((Math.floor(c / anim) % yaws) / yaws) * Math.PI * 2;

// Biplane: 16 headings × 3 elevations.
const plane = biplane();
bake('plane', { ppm: 7, elevs: [6, 28, 58], cols: 16, yaws: 16, views: (_e, c) => ({ model: plane, yaw: yawOf(c, 16) }) });

// Canopy rig: 5 banks, open / flaring; then the collapsing stall and the inflation.
const BANKS = [-0.5, -0.25, 0, 0.25, 0.5];
const CANOPY_ELEVS = [6, 20, 34, 50, 70];
const rig = canopyRig();
// edgeDepth: the shell's near-flat crown steps into voxel terraces at grazing
// angles — don't ink those as creases.
const SHELL_EDGE = 1.1;
bake('canopy', { ppm: 10, elevs: CANOPY_ELEVS, cols: 5, views: (_e, c) => ({ model: rig, pose: rotY(BANKS[c]) }), edgeDepth: SHELL_EDGE });
bake('canopy-flare', {
  ppm: 10,
  elevs: CANOPY_ELEVS,
  cols: 5,
  views: (_e, c) => ({ model: rig, pose: mul(rotY(BANKS[c]), rotX(0.3)) }),
  edgeDepth: SHELL_EDGE,
});
const stallRig = canopyRig({ stall: true });
bake('canopy-stall', { ppm: 10, elevs: CANOPY_ELEVS, cols: 2, views: (_e, c) => ({ model: stallRig, pose: rotY(c ? 0.15 : -0.15) }), edgeDepth: SHELL_EDGE });
const inflate = [0.12, 0.3, 0.55, 0.8].map((s) => canopyRig({ s }));
bake('canopy-open', { ppm: 10, elevs: CANOPY_ELEVS, cols: 4, views: (_e, c) => ({ model: inflate[c] }), edgeDepth: SHELL_EDGE });
const down = canopyDown();
bake('canopy-down', { ppm: 10, elevs: [18, 70], cols: 1, views: () => ({ model: down }) });

// Diver: 7 free-fall poses (arch → track), landing poses, crash.
const fall = [0, 1, 2, 3, 4, 5, 6].map((k) => diverFall(k / 6));
bake('diver-fall', { ppm: 14, elevs: [40, 78], cols: 7, views: (_e, c) => ({ model: fall[c] }), normalRadius: 2, edgeDepth: 0.12 });
const land = [0, 1, 2, 3, 4, 5].map(diverLand);
bake('diver-land', { ppm: 14, elevs: [18, 70], cols: 6, views: (_e, c) => ({ model: land[c] }), edgeDepth: 0.12 });
const crash = [0, 1].map(diverCrash);
bake('diver-crash', { ppm: 14, elevs: [18, 70], cols: 2, views: (_e, c) => ({ model: crash[c] }), edgeDepth: 0.12 });

// Props.
const PROP_ELEVS = [14, 38, 70];
const single = (name, model, ppm, extra = {}) =>
  bake(name, { ppm, elevs: PROP_ELEVS, cols: 1, views: () => ({ model }), ...extra });
single('oak', oak(1), 5);
single('poplar', poplarTree(2), 5);
single('pine', pine(), 5);
single('bush', bush(3), 6);
single('rock', rock(), 6);
single('marquee', marquee(), 6);
const baleM = bale();
bake('bale', { ppm: 8, elevs: PROP_ELEVS, cols: 8, yaws: 8, views: (_e, c) => ({ model: baleM, yaw: yawOf(c, 8) }), edgeDepth: 0.2 });
const crowd = [navy, green, mustard].flatMap((shirt, i) => [false, true].map((cheer) => spectator(shirt, cheer, i === 1 ? 'cap' : 'boater')));
bake('spectator', { ppm: 10, elevs: PROP_ELEVS, cols: 6, views: (_e, c) => ({ model: crowd[c], yaw: Math.PI }), edgeDepth: 0.15 });
const sock = windsock();
bake('windsock', { ppm: 7, elevs: PROP_ELEVS, cols: 8, yaws: 8, views: (_e, c) => ({ model: sock, yaw: yawOf(c, 8) }), edgeDepth: 0.2 });
for (const [name, fn, ppm] of [
  ['barn', barn, 4],
  ['house', house, 4],
  ['hangar', hangar, 3.5],
  ['grandstand', () => grandstand(5), 4],
]) {
  const model = fn();
  bake(name, { ppm, elevs: PROP_ELEVS, cols: 8, yaws: 8, views: (_e, c) => ({ model, yaw: yawOf(c, 8) }) });
}
const wagonM = targetWagon();
bake('wagon', { ppm: 8, elevs: PROP_ELEVS, cols: 16, yaws: 16, views: (_e, c) => ({ model: wagonM, yaw: yawOf(c, 16) }), edgeDepth: 0.25 });
single('lighthouse', lighthouse(), 3.5);
const mills = [windmill(0), windmill(1)];
bake('windmill', {
  ppm: 3.5,
  elevs: PROP_ELEVS,
  cols: 16,
  yaws: 8,
  anim: 2,
  views: (_e, c) => ({ model: mills[c % 2], yaw: yawOf(c, 8, 2) }),
});

// Sky dressing: balloons (seen from below too) and cumulus.
const balloons = [
  [red, cream],
  [gold, navy, gold, cream],
  [sky, cream, red],
].map(balloon);
bake('balloon', { ppm: 2.6, elevs: [-25, 2, 30, 65], cols: 3, views: (_e, c) => ({ model: balloons[c] }), edgeDepth: 1 });
const clouds = [11, 23, 37].map(cumulus);
bake('cloud', { ppm: 1.1, elevs: [-20, 12, 45, 80], cols: 3, views: (_e, c) => ({ model: clouds[c], yaw: c * 1.3 }), normalRadius: 4, edgeDepth: 4 });

// ------------------------------------------------------------- manifest ---

const body = sheets
  .map(
    (s) =>
      `  ${/^[a-z]+$/.test(s.name) ? s.name : `'${s.name}'`}: { fw: ${s.fw}, fh: ${s.fh}, ax: ${s.ax}, ay: ${s.ay}, ppm: ${s.ppm}, cols: ${s.cols}, yaws: ${s.yaws}, anim: ${s.anim}, elevs: [${s.elevs.join(', ')}] },`,
  )
  .join('\n');
writeFileSync(
  MANIFEST,
  `// GENERATED by tools/bake-voxels.mjs — do not edit by hand; re-run the tool.
//
// Pre-rendered (voxel-baked) sprite sheets in public/assets/sprites/baked/.
// Each sheet is a horizontal strip of fw×fh frames laid out elevation-major:
// frame = elevationIndex * cols + yawIndex * anim + animFrame. (ax, ay) is the
// pixel where the model's origin lands; ppm is pixels per metre at scale 1;
// elevs are the camera elevations (degrees) the rows were rendered at.

export const BAKED_SPECS = {
${body}
} as const;

export type BakedName = keyof typeof BAKED_SPECS;
`,
);
console.log(`wrote ${MANIFEST}`);

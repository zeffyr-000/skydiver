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
import { encodeCompactPng } from './lib/png.mjs';
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
// 1920s cloth: jodhpurs and parachute packs, felt hats, suits and summer dresses.
const khaki = M.add('khaki', ['#2a2416', '#4a4128', '#706440', '#9a8c5c', '#c2b47e', '#e4d8a6']);
const felt = M.add('felt', ['#1e1a1c', '#363034', '#54494a', '#766a62', '#9a8e80']);
const charcoal = M.add('charcoal', ['#141418', '#24242c', '#3a3a44', '#55555e', '#74747c']);
const tweed = M.add('tweed', ['#241c14', '#3e3222', '#5e4c32', '#806a46', '#a48c5e']);
const rose = M.add('rose', ['#3e1e2a', '#6e3446', '#a45a6a', '#d28a90', '#f0b8b0', '#fde0d4']);
const mint = M.add('mint', ['#16302a', '#285a48', '#468a6c', '#72b68e', '#a6dab0', '#d8f2d0']);
const hair = M.add('hair', ['#140e0a', '#24180e', '#3a2614', '#56381c']);
// Doped linen rib tapes on the Jenny's wings, a shade under the cream.
const linen = M.add('linen', ['#463a46', '#74667a', '#b49e78', '#d4c29a', '#eadab4', '#f4e8cc']);

/** Stable hash → [0, 1) for voxel noise. */
function h3(x, y, z, s = 0) {
  let n = Math.imul((x * 73.1) | 0, 374761393) ^ Math.imul((y * 91.7) | 0, 668265263) ^ Math.imul((z * 57.3) | 0, 2246822519) ^ s;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------- humanoid ---

/**
 * A 1920s exhibition jumper on a skeleton of joints (metres): a red leather
 * flying jacket with a sheepskin collar, khaki jodhpurs flaring at the thigh,
 * tall riding boots, gauntlet gloves, leather helmet and brass goggles, a long
 * white silk scarf — and, unless `pack: false`, the Type A parachute pack on
 * his back with the brass ripcord ring on his chest (`pack: 'open'` once it
 * has been pulled). `face` is where his face looks; the pack sits opposite.
 */
function aviator(m, j, opts = {}) {
  const jacket = opts.suit ?? red;
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
  const fwd = opts.face ?? [0, 1, 0];
  const off = (a, d, k) => a.map((v, i) => v + d[i] * k);
  // Jacket: a tapered capsule from pelvis to neck, belted, with a fleece collar.
  m.capsule(P.pelvis, mid(P.pelvis, P.neck, 0.85), 0.15, jacket, 0.19);
  m.capsule(mid(P.pelvis, P.neck, 0.12), mid(P.pelvis, P.neck, 0.2), 0.16, leather);
  m.capsule(mid(P.lShoulder, P.neck, 0.55), mid(P.rShoulder, P.neck, 0.55), 0.075, cream);
  for (const s of ['l', 'r']) {
    // Sleeves and gauntlet gloves.
    m.capsule(P[`${s}Shoulder`], P[`${s}Elbow`], 0.07, jacket);
    m.capsule(P[`${s}Elbow`], P[`${s}Hand`], 0.06, jacket);
    m.capsule(mid(P[`${s}Elbow`], P[`${s}Hand`], 0.65), P[`${s}Hand`], 0.07, leather);
    m.sphere(...P[`${s}Hand`], 0.065, leather);
    // Jodhpurs, flared at the thigh; tall riding boots below the knee.
    m.capsule(P[`${s}Hip`], P[`${s}Knee`], 0.09, khaki);
    m.sphere(...mid(P[`${s}Hip`], P[`${s}Knee`], 0.45), 0.125, khaki);
    m.capsule(P[`${s}Knee`], P[`${s}Foot`], 0.078, leather);
    m.sphere(...P[`${s}Foot`], 0.09, leather);
  }
  // Head: leather helmet with ear flaps, brass goggles on the brow.
  m.sphere(...P.head, 0.13, skin);
  m.ellipsoid(P.head[0], P.head[1] - 0.01, P.head[2] + 0.03, 0.14, 0.14, 0.12, leather);
  const g = P.head.map((v, i) => v + fwd[i] * 0.11);
  m.ellipsoid(g[0], g[1], g[2] + 0.03, 0.12, 0.05, 0.04, brass);
  // Silk scarf: knotted at the neck, its long tail streaming in the wind.
  m.sphere(...P.neck, 0.08, cream);
  m.capsule(P.neck, P.scarfTip, 0.05, cream, 0.03);
  // The parachute pack on his back, the ripcord ring on his chest.
  if (opts.pack !== false) {
    const r = opts.pack === 'open' ? 0.07 : 0.12;
    m.capsule(
      off(mid(P.pelvis, P.neck, 0.22), fwd, -(0.13 + r)),
      off(mid(P.pelvis, P.neck, 0.8), fwd, -(0.13 + r)),
      r,
      khaki,
    );
    if (opts.pack !== 'open') {
      m.sphere(...off(mid(P.pelvis, P.neck, 0.55), fwd, 0.17), 0.045, brass);
    }
  }
}

/**
 * A spectator in their Sunday best, 1920s style. `p.kind` is a man in a suit
 * (or in shirtsleeves and braces), a woman (drop-waist dress, cloche hat — its
 * colour is `p.hat` — perhaps a parasol) or a child in knickerbockers and a
 * cap; `cheer` throws the arms up, and the men wave their hats.
 */
function civilian(p, cheer) {
  const m = new VoxelModel(0.05, [
    [-0.9, 0.9],
    [-0.9, 0.9],
    [0, 2.5],
  ]);
  const k = p.kind === 'child' ? 0.66 : 1;
  const J = (x, y, z) => [x * k, y * k, z * k];
  const woman = p.kind === 'woman';
  const head = J(0, 0, 1.6);
  const neck = J(0, 0, 1.44);
  const pelvis = J(0, 0, 0.94);
  const mid = (a, b, t = 0.5) => a.map((v, i) => v + (b[i] - v) * t);
  // Arms down, or up in the air; a lady keeps one hand on her parasol.
  const arm = (s) => {
    if (p.parasol && s < 0) return { sh: J(-0.2, 0, 1.38), el: J(-0.3, 0.12, 1.12), ha: J(-0.24, 0.24, 1.28) };
    const up = cheer && (!woman || s > 0);
    return {
      sh: J(s * 0.2, 0, 1.38),
      el: up ? J(s * 0.36, 0, 1.66) : J(s * 0.26, 0.05, 1.1),
      ha: up ? J(s * 0.42, 0.02, 1.98) : J(s * 0.27, 0.08, 0.86),
    };
  };
  const top = woman ? p.dress : p.kind === 'shirt' ? cream : p.suit;
  const trousers = p.kind === 'shirt' ? charcoal : p.suit;
  for (const s of [-1, 1]) {
    const a = arm(s);
    m.capsule(a.sh, a.el, 0.065 * k, top);
    m.capsule(a.el, a.ha, 0.055 * k, woman ? skin : top);
    m.sphere(...a.ha, 0.055 * k, skin);
    if (woman) {
      // Stockings below the hem, little strap shoes.
      m.capsule(J(s * 0.09, 0, 0.5), J(s * 0.1, 0.02, 0.08), 0.055, cream);
      m.sphere(...J(s * 0.1, 0.04, 0.06), 0.065, black);
    } else {
      m.capsule(J(s * 0.1, 0, 0.92), J(s * 0.11, 0.03, 0.5), 0.085 * k, trousers);
      // A child's knickerbockers stop at the knee, over long socks.
      m.capsule(J(s * 0.11, 0.03, 0.5), J(s * 0.12, 0.02, 0.08), 0.075 * k, p.kind === 'child' ? cream : trousers);
      m.sphere(...J(s * 0.12, 0.05, 0.06), 0.08 * k, black);
    }
  }
  if (woman) {
    // A straight drop-waist dress to the knee, a sash low on the hips.
    m.region(-0.3, -0.3, 0.45, 0.3, 0.3, 1.46, (x, y, z) => {
      const r = z > 0.85 ? 0.16 + (1.46 - z) * 0.02 : 0.17 + (0.85 - z) * 0.08;
      return Math.hypot(x, y * 1.15) < r ? (Math.abs(z - 0.86) < 0.04 ? felt : p.dress) : 0;
    });
  } else {
    // Jacket (or shirt) from the belt to the collar; a white collar and a tie,
    // or braces over the shirt.
    m.capsule(pelvis, mid(pelvis, neck, 0.88), 0.15 * k, top, 0.18 * k);
    m.sphere(...J(0, 0.04, 1.45), 0.07 * k, cream);
    if (p.kind === 'shirt') {
      for (const s of [-1, 1]) m.line(J(s * 0.1, 0.17, 0.95), J(s * 0.1, 0.17, 1.38), '#3e2618');
    } else if (p.kind === 'man') {
      m.line(J(0, 0.19, 1.4), J(0, 0.19, 1.14), '#3a1418');
    }
  }
  // Head, hair, and the hat — in a man's raised hand when he cheers.
  m.sphere(...head, 0.12 * k, skin);
  m.ellipsoid(head[0], head[1] - 0.03, head[2] + 0.04 * k, 0.125 * k, 0.12 * k, 0.1 * k, hair);
  const waved = cheer && !woman && p.hat !== 'cap';
  const [hx, hy, hz] = waved ? mid(arm(1).ha, [arm(1).ha[0], arm(1).ha[1], 2.3], 0.4) : J(0, 0, 1.7);
  switch (p.hat) {
    case 'boater':
      m.region(hx - 0.22, hy - 0.22, hz - 0.02, hx + 0.22, hy + 0.22, hz + 0.16, (x, y, z) => {
        const r = Math.hypot(x - hx, y - hy);
        if (z < hz + 0.03) return r < 0.21 ? straw : 0;
        return r < 0.15 ? (z < hz + 0.07 ? red : straw) : 0;
      });
      break;
    case 'fedora':
      m.region(hx - 0.22, hy - 0.22, hz - 0.02, hx + 0.22, hy + 0.22, hz + 0.2, (x, y, z) => {
        const r = Math.hypot(x - hx, y - hy);
        if (z < hz + 0.03) return r < 0.21 ? felt : 0;
        return r < 0.14 && z < hz + 0.19 - Math.abs(x - hx) * 0.3 ? (z < hz + 0.07 ? black : felt) : 0;
      });
      break;
    case 'cap':
      m.ellipsoid(hx, hy + 0.02, hz - 0.02, 0.15 * k, 0.16 * k, 0.07 * k, tweed);
      m.box(hx - 0.1 * k, hy + 0.08 * k, hz - 0.05 * k, hx + 0.1 * k, hy + 0.2 * k, hz - 0.02 * k, tweed);
      break;
    default:
      // A cloche, pulled down to the brows.
      m.region(hx - 0.17, hy - 0.17, hz - 0.14, hx + 0.17, hy + 0.17, hz + 0.08, (x, y, z) => {
        const r = Math.hypot(x - hx, y - hy);
        return (z > hz - 0.1 && Math.hypot(r, z - hz + 0.06) < 0.15) || (z < hz - 0.08 && r < 0.165) ? p.hat : 0;
      });
  }
  if (p.parasol) {
    // A striped parasol on a long handle.
    const h = arm(-1).ha;
    m.line(h, [h[0], h[1], 2.18], '#3e2618');
    m.region(h[0] - 0.55, h[1] - 0.55, 2.0, h[0] + 0.55, h[1] + 0.55, 2.42, (x, y, z) => {
      const r = Math.hypot(x - h[0], y - h[1]);
      const roof = 2.4 - r * 0.6;
      if (r > 0.54 || z > roof || z < roof - 0.06) return 0;
      return Math.floor(((Math.atan2(y - h[1], x - h[0]) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? cream : red;
    });
  }
  return m;
}

/** Point (dx, dy) inside a five-pointed star of radius R, one point toward +y. */
function inStar(dx, dy, R) {
  const seg = Math.PI / 5;
  let a = Math.atan2(dx, dy) % (2 * seg);
  if (a < 0) a += 2 * seg;
  if (a > seg) a = 2 * seg - a;
  const ri = R * 0.382;
  return Math.hypot(dx, dy) <= (R * ri * Math.sin(seg)) / (R * Math.sin(a) + ri * Math.sin(seg - a));
}

// --------------------------------------------------------------- models ---

/**
 * The Curtiss JN-4 "Jenny", the barnstormers' war-surplus trainer: a fabric
 * box fuselage, the OX-5's flat radiator nose and exhaust stubs, tandem
 * cockpits (the pilot flies from the rear), unequal-span two-bay wings with
 * kingposts and bracing wires, US star roundels and a striped rudder. With
 * `jumper`, the jumper is out on the lower wing, a hand on the strut, waving
 * to the crowd before he lets go. Nose +y; origin at the lower wing root.
 */
function jenny(jumper) {
  const m = new VoxelModel(0.07, [
    [-6.5, 6.5],
    [-6.1, 3.5],
    [-1.95, 2.35],
  ]);
  const wire = '#b8b0a0';
  // Fuselage: square at the cockpits, tapering to a knife edge at the tail
  // post, a rounded turtle deck on top, the engine in tin panels up front.
  const taper = (y) => Math.min(1, Math.max(0, (0.6 - y) / 5.7));
  const halfW = (y) => 0.44 - taper(y) * 0.4;
  const longeron = (y) => 0.5 - taper(y) * 0.14;
  const deckZ = (x, y) => longeron(y) + 0.14 * (1 - taper(y)) * (1 - (x / halfW(y)) ** 2);
  m.region(-0.46, -5.15, -0.48, 0.46, 2.42, 0.66, (x, y, z) => {
    const t = taper(y);
    if (Math.abs(x) > halfW(y) || z < -0.46 + t * 0.48 || z > deckZ(x, y)) return 0;
    if (y > 1.55) return Math.floor(y * 11) % 3 === 0 && z > 0 && z < 0.4 ? tinDark : tin;
    return Math.abs(z - longeron(y)) < 0.04 ? cream : red;
  });
  // The flat radiator, honeycombed; the hub of the two-blade propeller, its blur.
  m.box(-0.4, 2.4, -0.44, 0.4, 2.58, 0.62, (x, _y, z) =>
    Math.abs(x) < 0.32 && z > -0.36 && z < 0.54 ? ((Math.floor(x * 14) + Math.floor(z * 14)) & 1 ? tinDark : black) : tin,
  );
  m.sphere(0, 2.68, 0.3, 0.12, wood);
  m.region(-1.35, 2.74, -1.05, 1.35, 2.8, 1.65, (x, _y, z) => (Math.hypot(x, z - 0.3) < 1.3 ? propBlur : 0));
  // The OX-5's exhaust stubs, four a side.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const y = 1.7 + k * 0.22;
      m.capsule([s * 0.43, y, 0.4], [s * 0.5, y - 0.12, 0.66], 0.05, black);
    }
  }
  // Tandem cockpits with leather coamings and little windscreens; the pilot
  // sits in the rear one. The front one is the jumper's — empty now.
  for (const [cy, len] of [
    [0.22, 0.36],
    [-1.05, 0.4],
  ]) {
    m.carve(-0.33, cy - len, 0.36, 0.33, cy + len, 0.7, (x, y) => (x / 0.31) ** 2 + ((y - cy) / len) ** 2 < 1);
    for (let k = 0; k < 20; k++) {
      const rim = (a) => {
        const x = Math.cos(a) * 0.33;
        const y = cy + Math.sin(a) * (len + 0.02);
        return [x, y, deckZ(x, y)];
      };
      m.capsule(rim((k / 20) * Math.PI * 2), rim(((k + 1) / 20) * Math.PI * 2), 0.045, leather);
    }
    m.box(-0.2, cy + len + 0.03, deckZ(0, cy + len), 0.2, cy + len + 0.07, deckZ(0, cy + len) + 0.17, glass);
  }
  m.capsule([0, -1.1, 0.3], [0, -1.1, 0.7], 0.2, leather);
  m.sphere(0, -1.05, 0.9, 0.14, skin);
  m.ellipsoid(0, -1.07, 0.93, 0.15, 0.15, 0.12, leather);
  m.ellipsoid(0, -0.93, 0.93, 0.13, 0.04, 0.04, brass);
  m.capsule([0, -1.1, 0.76], [0.12, -1.55, 0.84], 0.04, cream);
  // Wings in doped linen with rib tapes; the upper one longer and staggered
  // forward, its tips raked back, ailerons on the overhang.
  const UZ = 1.62;
  const ribbed = (x) => (Math.abs(x) % 0.42 < 0.07 ? linen : cream);
  m.box(-6.25, -0.6, UZ, 6.25, 0.92, UZ + 0.1, (x, y) => {
    const ax = Math.abs(x);
    if (ax > 6.25 - ((y + 0.6) / 1.52) * 0.5) return 0;
    return ax > 4.45 && Math.abs(y + 0.26) < 0.04 ? linen : ribbed(x);
  });
  m.box(-5, -0.88, -0.3, 5, 0.64, -0.2, (x, y) => (Math.abs(x) > 5 - ((y + 0.88) / 1.52) * 0.45 ? 0 : ribbed(x)));
  // The US star: white star in a blue disc, red centre.
  for (const s of [-1, 1]) {
    const cx = s * 4.9;
    m.region(cx - 0.65, -0.5, UZ + 0.06, cx + 0.65, 0.8, UZ + 0.1, (x, y) => {
      const dx = x - cx;
      const dy = y - 0.16;
      if (Math.hypot(dx, dy) > 0.62) return 0;
      if (Math.hypot(dx, dy) < 0.17) return red;
      return inStar(dx, dy, 0.58) ? cream : navy;
    });
  }
  // Two bays of struts each side, the cabane, kingposts over the overhang,
  // and the bracing wires.
  for (const s of [-1, 1]) {
    for (const x of [2.4, 4.45]) {
      m.capsule([s * x, 0.35, -0.2], [s * x, 0.62, UZ], 0.05, wood);
      m.capsule([s * x, -0.5, -0.2], [s * x, -0.23, UZ], 0.05, wood);
    }
    m.capsule([s * 0.4, 0.55, longeron(0.55)], [s * 0.55, 0.7, UZ], 0.045, wood);
    m.capsule([s * 0.38, -0.32, longeron(-0.32)], [s * 0.55, -0.2, UZ], 0.045, wood);
    m.capsule([s * 4.45, 0.2, UZ + 0.1], [s * 4.45, 0.2, UZ + 0.6], 0.04, wood);
    m.line([s * 4.45, 0.2, UZ + 0.6], [s * 6.0, 0.2, UZ + 0.08], wire);
    m.line([s * 4.45, 0.2, UZ + 0.6], [s * 2.4, 0.2, UZ + 0.1], wire);
    for (const [xa, xb] of [
      [0.45, 2.4],
      [2.4, 4.45],
    ]) {
      m.line([s * xa, 0.3, -0.22], [s * xb, 0.55, UZ], wire);
      m.line([s * xb, 0.3, -0.22], [s * xa, 0.55, UZ], wire);
    }
    // Landing gear: a V of struts down to the axle, fabric-covered wheels.
    m.capsule([s * 0.38, 1.25, -0.46], [s * 0.82, 0.95, -1.48], 0.045, wood);
    m.capsule([s * 0.38, 0.25, -0.46], [s * 0.82, 0.95, -1.48], 0.045, wood);
    m.region(s * 0.82 - 0.07, 0.5, -1.92, s * 0.82 + 0.07, 1.4, -1.04, (_x, y, z) => {
      const d = Math.hypot(y - 0.95, z + 1.48);
      return d < 0.43 ? (d > 0.34 ? black : d < 0.09 ? brass : cream) : 0;
    });
  }
  m.line([-0.82, 0.95, -1.48], [0.82, 0.95, -1.48], '#3a3a42');
  // Tailplane with rounded tips, a small fin, and the big rounded rudder in
  // the stripes of the day: blue at the post, white, red at the trailing edge.
  m.region(-1.8, -5.15, 0.14, 1.8, -4.25, 0.22, (x, y) => {
    const ax = Math.abs(x);
    if (ax > 1.3 && ((ax - 1.3) / 0.48) ** 2 + ((y + 4.7) / 0.45) ** 2 > 1) return 0;
    return Math.abs(y + 4.8) < 0.04 ? linen : ribbed(x);
  });
  m.region(-0.05, -5.12, 0.3, 0.05, -4.35, 1.12, (_x, y, z) => (z < 0.36 + ((-4.35 - y) / 0.77) * 0.74 ? red : 0));
  m.region(-0.05, -5.95, -0.18, 0.05, -5.1, 1.42, (_x, y, z) => {
    const d = -5.12 - y;
    if (d < 0 || (d / 0.83) ** 2 + ((z - 0.62) / 0.78) ** 2 > 1) return 0;
    return d < 0.28 ? navy : d < 0.55 ? cream : red;
  });
  m.capsule([0, -4.95, 0.02], [0, -5.2, -0.32], 0.04, wood); // tailskid
  if (jumper) {
    // Out on the right lower wing, against the slipstream.
    const B = (x, y, z) => [1.85 + x, 0.05 + y, -0.2 + z];
    aviator(m, {
      head: B(0, 0.14, 1.5),
      neck: B(0, 0.1, 1.34),
      pelvis: B(0, 0, 0.86),
      lShoulder: B(-0.2, 0.06, 1.3),
      rShoulder: B(0.2, 0.06, 1.3),
      lElbow: B(-0.4, 0.12, 1.4),
      lHand: B(-0.5, 0.16, 1.64),
      rElbow: B(0.42, 0.22, 1.12),
      rHand: B(0.55, 0.45, 1.05),
      lHip: B(-0.1, 0, 0.84),
      rHip: B(0.1, 0, 0.84),
      lKnee: B(-0.12, 0.16, 0.46),
      rKnee: B(0.12, 0.16, 0.46),
      lFoot: B(-0.13, 0.02, 0.08),
      rFoot: B(0.13, 0.02, 0.08),
      scarfTip: B(0.18, -0.65, 1.4),
    });
  }
  return m;
}

/**
 * Round silk canopy rig; `s` = inflation (1 = open), `stall` = collapsing;
 * without its `diver` it is a canopy cut away in a double drop.
 */
function canopyRig({ s = 1, stall = false, diver = true } = {}) {
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
  if (!diver) {
    // Cut away: the risers trail loose below the lines.
    m.line([-0.22, 0, 1.75], [-0.1, 0.1, 0.9], '#6a4426');
    m.line([0.22, 0, 1.75], [0.1, 0.1, 0.9], '#6a4426');
    return m;
  }
  // The diver hangs from the risers, hands up on the toggles.
  aviator(
    m,
    {
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
    },
    { pack: 'open' },
  );
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
  aviator(
    m,
    {
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
    },
    { pack: 'open' },
  );
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
  aviator(
    m,
    {
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
    },
    { face: [0, 0, -1] },
  );
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
    // The crowd on each tier, in Sunday best: boaters, felt hats, cloches.
    for (let x = -5.6; x <= 5.6; x += 0.55) {
      const c = h3(x, t, 0, seed);
      if (c < 0.2) continue;
      const z = 0.6 + t * 0.7;
      const coat = [navy, charcoal, cream, rose, tweed, mint, felt, mustard][Math.floor(c * 8)];
      m.ellipsoid(x, y - 0.5, z + 0.3, 0.2, 0.2, 0.3, coat);
      m.sphere(x, y - 0.5, z + 0.7, 0.13, skin);
      const hat = h3(x, t, 1, seed);
      if (hat < 0.35) {
        m.region(x - 0.24, y - 0.74, z + 0.78, x + 0.24, y - 0.26, z + 0.94, (hx, hy, hz) => {
          const r = Math.hypot(hx - x, hy - y + 0.5);
          return (hz < z + 0.84 && r < 0.24) || r < 0.14 ? straw : 0;
        });
      } else if (hat < 0.7) {
        m.ellipsoid(x, y - 0.5, z + 0.8, 0.17, 0.17, 0.11, hat < 0.52 ? felt : charcoal);
      } else {
        m.ellipsoid(x, y - 0.5, z + 0.76, 0.16, 0.16, 0.12, [rose, red, navy, cream][Math.floor((hat - 0.7) * 13.3)]);
      }
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

/**
 * A fairground Ferris wheel (the 1920s "big wheel"): two rims in red and
 * cream on a timber A-frame, spokes to a brass hub, eight swinging cars that
 * hang level. `step` (0–3) turns it a quarter of a car's spacing, so four
 * frames loop seamlessly.
 */
function ferrisWheel(step) {
  const m = new VoxelModel(0.12, [
    [-7.6, 7.6],
    [-2.2, 2.2],
    [0, 16],
  ]);
  const hz = 8.4;
  const R = 6.6;
  const cars = 8;
  const turn = (step / 4) * ((Math.PI * 2) / cars);
  for (const y of [-0.7, 0.7]) {
    m.region(-R - 0.2, y - 0.1, hz - R - 0.2, R + 0.2, y + 0.1, hz + R + 0.2, (x, _y, z) => {
      if (Math.abs(Math.hypot(x, z - hz) - R) > 0.15) return 0;
      const a = Math.atan2(z - hz, x) - turn + Math.PI * 4;
      return Math.floor((a / (Math.PI * 2)) * 16) % 2 ? red : cream;
    });
    for (let k = 0; k < 16; k++) {
      const a = turn + (k / 16) * Math.PI * 2;
      m.line([0, y, hz], [Math.cos(a) * R, y, hz + Math.sin(a) * R], '#e8dcc0');
    }
    for (const s of [-1, 1]) m.capsule([s * 4.4, y * 2.3, 0], [0, y * 1.1, hz], 0.14, wood);
    m.line([-2.6, y * 1.8, 3.4], [2.6, y * 1.8, 3.4], '#5a3c24');
  }
  m.capsule([0, -0.95, hz], [0, 0.95, hz], 0.32, brass);
  for (let k = 0; k < cars; k++) {
    const a = turn + (k / cars) * Math.PI * 2;
    const px = Math.cos(a) * R;
    const pz = hz + Math.sin(a) * R;
    m.line([px, -0.7, pz], [px, 0.7, pz], '#3e2618');
    m.line([px, 0, pz], [px, 0, pz - 0.45], '#3e2618');
    // An open car with a striped canopy over it.
    m.box(px - 0.6, -0.55, pz - 0.5, px + 0.6, 0.55, pz - 0.42, (x) => (Math.floor((x - px + 0.6) / 0.3) % 2 ? red : cream));
    m.box(px - 0.55, -0.5, pz - 1.4, px + 0.55, 0.5, pz - 0.9, navy);
    m.carve(px - 0.45, -0.4, pz - 1.2, px + 0.45, 0.4, pz - 0.9);
    for (const sx of [-0.5, 0.5]) m.line([px + sx, 0, pz - 0.92], [px + sx, 0, pz - 0.45], '#3e2618');
  }
  // The ticket booth at its foot.
  m.box(-0.9, 1.4, 0, 0.9, 2.1, 1.9, (_x, _y, z) => (z > 1.7 ? red : z > 1.1 && z < 1.5 ? glass : cream));
  return m;
}

/**
 * A travelling circus's big top: a long round-ended tent in red and cream
 * stripes, sagging between its two king poles, pennants flying, the entrance
 * flaps tied back on the +y side.
 */
function bigTop() {
  const m = new VoxelModel(0.12, [
    [-8.2, 8.2],
    [-5.8, 6.4],
    [0, 10.6],
  ]);
  const C = 2.6;
  const R = 5.2;
  // Stripes follow the tent's own outline: arc length around the stadium.
  const stripe = (x, y) => {
    const ax = Math.abs(x);
    let u;
    if (ax <= C) u = y >= 0 ? x + C : 2 * C + Math.PI * R + (C - x);
    else if (x > 0) u = 2 * C + (Math.PI / 2 - Math.atan2(y, x - C)) * R;
    else u = 4 * C + Math.PI * R + ((((-Math.PI / 2 - Math.atan2(y, x + C)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * R;
    return Math.floor(u / 0.8) % 2 ? red : cream;
  };
  const roof = (x, y) => {
    const dp = Math.hypot(Math.abs(x) - C, y);
    return 2.8 + 5.6 * Math.max(0, 1 - dp / R) ** 1.25;
  };
  m.region(-R - C, -R, 0, R + C, R, 8.5, (x, y, z) => {
    const d = Math.hypot(Math.max(Math.abs(x) - C, 0), y);
    if (d > R) return 0;
    if (z <= 2.8) return d > R - 0.3 ? stripe(x, y) : 0;
    return z <= roof(x, y) && z > roof(x, y) - 0.35 ? stripe(x, y) : 0;
  });
  // A scalloped valance round the eaves.
  m.region(-R - C - 0.1, -R - 0.1, 2.5, R + C + 0.1, R + 0.1, 2.9, (x, y, z) => {
    const d = Math.hypot(Math.max(Math.abs(x) - C, 0), y);
    return d > R - 0.1 && d < R + 0.1 && z > 2.8 - 0.25 * Math.abs(Math.sin((x + y) * 2.2)) ? gold : 0;
  });
  // The entrance, flaps tied back.
  m.carve(-0.9, R - 0.5, 0, 0.9, R + 0.2, 2.3);
  for (const s of [-1, 1]) m.box(s * 0.9, R - 0.2, 0, s * 1.15, R + 0.1, 2.3, red);
  // King poles with pennants.
  for (const s of [-1, 1]) {
    m.cylinderZ(s * C, 0, 7.5, 9.6, 0.1, wood);
    m.region(s * C, -0.04, 9.0, s * C + 1.2, 0.04, 9.55, (x, _y, z) => (Math.abs(z - 9.27) < 0.27 * (1 - (x - s * C) / 1.2) ? red : 0));
  }
  return m;
}

/** A Ford Model T tourer in any colour so long as it's black; `open` folds the hood. Nose +y. */
function modelT(open) {
  const m = new VoxelModel(0.05, [
    [-1, 1],
    [-1.9, 1.85],
    [0, 2.05],
  ]);
  // Wooden-spoked wheels with black tyres, mudguards and running boards.
  for (const sx of [-0.72, 0.72]) {
    for (const wy of [-1.1, 1.15]) {
      m.region(sx - 0.06, wy - 0.4, 0, sx + 0.06, wy + 0.4, 0.8, (_x, y, z) => {
        const d = Math.hypot(y - wy, z - 0.38);
        if (d > 0.38) return 0;
        if (d > 0.3) return black;
        if (d < 0.07) return brass;
        return Math.floor(((Math.atan2(z - 0.38, y - wy) + Math.PI) / (Math.PI * 2)) * 12) % 2 ? wood : 0;
      });
      m.region(sx - 0.12, wy - 0.52, 0.38, sx + 0.12, wy + 0.52, 0.92, (_x, y, z) => {
        const d = Math.hypot(y - wy, z - 0.38);
        return d > 0.44 && d < 0.5 ? black : 0;
      });
    }
  }
  for (const s of [-1, 1]) m.box(s * 0.62, -0.7, 0.42, s * 0.84, 0.75, 0.47, black);
  // Bonnet, the brass radiator and lamps.
  m.region(-0.38, 0.75, 0.48, 0.38, 1.55, 1.08, (x, _y, z) => (z < 1.0 || Math.abs(x) < 0.3 ? black : 0));
  m.box(-0.4, 1.55, 0.46, 0.4, 1.64, 1.16, (x, _y, z) => (Math.abs(x) < 0.3 && z > 0.56 && z < 1.06 ? black : brass));
  for (const s of [-1, 1]) m.sphere(s * 0.5, 1.6, 0.98, 0.09, brass);
  // The body tub, two bench seats in buttoned leather.
  m.box(-0.62, -1.4, 0.48, 0.62, 0.78, 1.16, black);
  for (const [y0, y1] of [
    [-0.05, 0.62],
    [-1.28, -0.45],
  ]) {
    m.carve(-0.54, y0, 0.86, 0.54, y1, 1.2);
    m.box(-0.54, y0, 0.84, 0.54, y1, 0.9, leather);
    m.box(-0.54, y0, 0.84, 0.54, y0 + 0.12, 1.22, leather);
  }
  // Windscreen, steering wheel (left-hand drive).
  m.box(-0.6, 0.76, 1.16, 0.6, 0.8, 1.56, (x, _y, z) => (Math.abs(x) > 0.56 || z > 1.52 ? brass : glass));
  m.region(-0.48, 0.38, 1.05, -0.12, 0.48, 1.4, (x, y, z) => {
    const d = Math.hypot(x + 0.3, z - 1.22);
    return d > 0.13 && d < 0.18 && Math.abs(y - 0.43) < 0.04 ? black : 0;
  });
  if (open) {
    m.capsule([-0.6, -1.42, 1.25], [0.6, -1.42, 1.25], 0.16, charcoal);
  } else {
    m.box(-0.64, -1.45, 1.62, 0.64, 0.74, 1.7, charcoal);
    for (const [x, y] of [
      [-0.6, -1.4],
      [0.6, -1.4],
      [-0.6, 0.72],
      [0.6, 0.72],
      [-0.6, -0.35],
      [0.6, -0.35],
    ]) {
      m.line([x, y, 1.16], [x, y, 1.62], '#26262e');
    }
  }
  return m;
}

/** A timber water tower: a hooped barrel tank on a braced trestle, a ladder up the side. */
function waterTower() {
  const m = new VoxelModel(0.1, [
    [-2.8, 2.8],
    [-2.8, 2.8],
    [0, 13.2],
  ]);
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    m.capsule([sx * 2.1, sy * 2.1, 0], [sx * 1.4, sy * 1.4, 8.1], 0.15, wood);
  }
  for (const z of [2.6, 5.4]) {
    const r = 2.1 - (z / 8.1) * 0.7;
    for (const [a, b] of [
      [
        [-r, -r],
        [r, -r],
      ],
      [
        [r, -r],
        [r, r],
      ],
      [
        [r, r],
        [-r, r],
      ],
      [
        [-r, r],
        [-r, -r],
      ],
    ]) {
      m.line([...a, z], [...b, z], '#5a3c24');
      m.line([...a, z], [...b, z + 2.7], '#5a3c24');
    }
  }
  m.cylinderZ(0, 0, 8, 11.2, 2.1, (_x, _y, z) => (((z - 8) % 0.8) < 0.1 ? black : wood), 2.05);
  m.region(-2.3, -2.3, 11.2, 2.3, 2.3, 12.8, (x, y, z) => (Math.hypot(x, y) < 2.3 * (1 - (z - 11.2) / 1.6) ? slate : 0));
  m.sphere(0, 0, 12.85, 0.14, brass);
  m.line([0, 2.15, 0.3], [0, 2.15, 11.2], '#3e2618');
  m.line([0.35, 2.15, 0.3], [0.35, 2.15, 11.2], '#3e2618');
  m.capsule([1.2, 1.4, 8.2], [1.6, 2.0, 6.6], 0.1, tinDark); // spout
  return m;
}

/** A village church: limestone nave, slate roof, a square tower with a slate spire and a gilded cock. Front +y. */
function church() {
  const m = new VoxelModel(0.12, [
    [-3.4, 3.4],
    [-8.6, 6.4],
    [0, 19.6],
  ]);
  m.box(-2.8, -6.4, 0, 2.8, 3, 5.2, wall);
  m.region(-3.2, -6.7, 5.2, 3.2, 3.1, 8.4, (x, _y, z) => (z <= 5.2 + (3.1 - Math.abs(x)) ? slate : 0));
  // The apse: a half-round with a cone roof.
  m.region(-2.4, -8.6, 0, 2.4, -6.4, 6.8, (x, y, z) => {
    const r = Math.hypot(x, y + 6.4);
    if (r > 2.4) return 0;
    return z <= 4.6 ? wall : z <= 4.6 + (2.5 - r) * 0.9 ? slate : 0;
  });
  // Tall windows down the nave.
  for (const y of [-5, -2.8, -0.6, 1.6]) {
    for (const s of [-1, 1]) m.box(s * 2.86, y - 0.4, 1.6, s * 2.8, y + 0.4, 3.9, glass);
  }
  // The tower: belfry openings, a clock, the door, then the spire.
  m.box(-1.9, 2.8, 0, 1.9, 6.4, 10.4, (_x, _y, z) => (Math.floor(z / 0.6) % 6 === 0 ? stone : wall));
  for (const [x0, y0, x1, y1] of [
    [-0.5, 6.3, 0.5, 6.5],
    [-0.5, 2.7, 0.5, 2.9],
    [1.8, 4.1, 2.0, 5.1],
    [-2.0, 4.1, -1.8, 5.1],
  ]) {
    m.region(x0, y0, 8.4, x1, y1, 9.8, () => black);
  }
  m.region(-0.75, 6.38, 6.3, 0.75, 6.46, 7.8, (x, _y, z) => {
    const d = Math.hypot(x, z - 7.05);
    return d < 0.72 ? (d > 0.6 ? gold : cream) : 0;
  });
  m.line([0, 6.48, 7.05], [0, 6.48, 7.5], '#18181f');
  m.line([0, 6.48, 7.05], [0.32, 6.48, 7.05], '#18181f');
  m.box(-0.6, 6.38, 0, 0.6, 6.46, 2.4, wood);
  m.region(-2.0, 2.7, 10.4, 2.0, 6.5, 17.6, (x, y, z) => {
    const r = 2.0 * (1 - (z - 10.4) / 7.2);
    return Math.abs(x) < r && Math.abs(y - 4.6) < r ? slate : 0;
  });
  m.line([0, 4.6, 17.5], [0, 4.6, 19.2], '#d9a441');
  m.box(-0.25, 4.55, 18.55, 0.25, 4.65, 18.85, gold);
  return m;
}

/** A row of four striped bathing huts on wheels, as they stood on the sands at Deauville. */
function bathingHuts() {
  const m = new VoxelModel(0.08, [
    [-4.8, 4.8],
    [-1.4, 1.8],
    [0, 3.8],
  ]);
  const paints = [red, navy, mint, mustard];
  for (let k = 0; k < 4; k++) {
    const cx = -3.45 + k * 2.3;
    const paint = paints[k];
    m.box(cx - 0.9, -1.1, 0.5, cx + 0.9, 1.1, 2.6, (x) => (Math.floor((x - cx + 0.9) / 0.3) % 2 ? paint : cream));
    m.region(cx - 1.05, -1.25, 2.6, cx + 1.05, 1.25, 3.5, (x, _y, z) => (z <= 2.6 + (1.05 - Math.abs(x - cx)) * 0.8 ? paint : 0));
    m.box(cx - 0.35, 1.1, 0.6, cx + 0.35, 1.18, 2.2, wood);
    m.box(cx - 0.4, 1.18, 0.15, cx + 0.4, 1.55, 0.3, wood); // step
    for (const [wx, wy] of [
      [-0.7, -0.8],
      [0.7, -0.8],
      [-0.7, 0.8],
      [0.7, 0.8],
    ]) {
      m.region(cx + wx - 0.3, wy - 0.05, 0, cx + wx + 0.3, wy + 0.05, 0.6, (x, _y, z) => {
        const d = Math.hypot(x - cx - wx, z - 0.3);
        return d < 0.3 ? (d > 0.22 ? black : d < 0.08 ? brass : 0) : 0;
      });
    }
  }
  return m;
}

/** An air-race pylon: a tall tapering octagon in black-and-white checks, a pennant on top. */
function racePylon() {
  const m = new VoxelModel(0.08, [
    [-1.3, 1.3],
    [-1.3, 1.3],
    [0, 11.2],
  ]);
  m.region(-1.2, -1.2, 0, 1.2, 1.2, 9.4, (x, y, z) => {
    const r = 1.1 - z * 0.075;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (Math.max(ax, ay, (ax + ay) / Math.SQRT2) > r) return 0;
    const face = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 8 + 0.5);
    return (Math.floor(z / 0.94) + face) % 2 ? black : cream;
  });
  m.line([0, 0, 9.4], [0, 0, 11], '#3e2618');
  m.region(0, -0.04, 10.3, 1.4, 0.04, 11, (x, _y, z) => (Math.abs(z - 10.65) < 0.35 * (1 - x / 1.4) ? red : 0));
  return m;
}

/**
 * A Bessonneau hangar, the canvas field hangar of the Great War: khaki canvas
 * over a timber frame (the ribs show through), its front curtains laced back
 * on a dark interior. Front +y.
 */
function bessonneau() {
  const m = new VoxelModel(0.14, [
    [-9.4, 9.4],
    [-10.6, 10.8],
    [0, 9],
  ]);
  const W = 8.8;
  const roofZ = (x) => 4.2 + (W - Math.abs(x)) * 0.5;
  m.region(-W - 0.3, -10.3, 0, W + 0.3, 10.3, 8.8, (x, y, z) => {
    const ax = Math.abs(x);
    // Eaves bow out a little over walls that lean in.
    const wall = W - (4.2 - Math.min(z, 4.2)) * 0.06;
    if (z <= 4.2 ? ax > wall : z > roofZ(x) || ax > W + 0.3) return 0;
    const shell = z <= 4.2 ? ax > wall - 0.3 : z > roofZ(x) - 0.4;
    const end = Math.abs(y) > 10.0;
    if (!shell && !end) return 0;
    return Math.abs(((y + 10.3) % 2.06) - 1.03) > 0.92 || (end && Math.abs(x) % 2.2 < 0.16) ? wood : khaki;
  });
  // The open front: dark inside, the curtains bunched at the sides.
  m.carve(-6.4, 9.9, 0, 6.4, 10.4, 5.6);
  m.box(-6.2, 8.6, 0, 6.2, 8.75, 5.4, tinDark);
  for (const s of [-1, 1]) m.capsule([s * 6.9, 10.2, 0], [s * 6.9, 10.2, 5.4], 0.4, khaki, 0.2);
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

/**
 * The fairground professor's smoke balloon (no basket, no burner): a sooty
 * canvas envelope in red and cream gores, a trapeze on two ropes, the furled
 * parachute hanging at the side. Origin at the trapeze bar; with `jumper` the
 * professor hangs from it by his hands (the canopy rig's pose, 1.2 m lower).
 */
function smokeBalloon(jumper) {
  const m = new VoxelModel(0.1, [
    [-5.2, 5.2],
    [-5.2, 5.2],
    [-2.3, 15.2],
  ]);
  const mouth = 4.2;
  const top = mouth + 6.4;
  const canvas = (x, y, z) => {
    if (z < mouth + 1.4) return stone; // soot from the fire it was filled over
    return Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 10) % 2 ? red : cream;
  };
  m.ellipsoid(0, 0, top, 4.4, 4.4, 4.6, canvas);
  m.region(-4.4, -4.4, mouth, 4.4, 4.4, top, (x, y, z) => {
    const t = (z - mouth) / (top - mouth);
    return Math.hypot(x, y) < 0.9 + t * t * 3.5 ? canvas(x, y, z) : 0;
  });
  // Hollow it (only the shell shows) and open the mouth.
  m.carve(-4.2, -4.2, mouth + 1, 4.2, 4.2, top + 4.4, (x, y, z) => (x / 4.1) ** 2 + (y / 4.1) ** 2 + ((z - top) / 4.3) ** 2 < 1);
  m.carve(-1, -1, mouth, 1, 1, mouth + 0.7, (x, y) => Math.hypot(x, y) < 0.75);
  // Trapeze bar on two ropes up to the mouth.
  m.box(-0.45, -0.04, -0.04, 0.45, 0.04, 0.04, wood);
  m.line([-0.45, 0, 0], [-0.8, 0, mouth], '#3e2618');
  m.line([0.45, 0, 0], [0.8, 0, mouth], '#3e2618');
  // The furled parachute tied up beside the mouth, its lines down to the bar.
  m.ellipsoid(1.4, 0, mouth - 0.5, 0.34, 0.34, 1.1, cream);
  m.line([1.4, 0, mouth - 1.6], [0.3, 0, 0.05], '#e8dcc0');
  if (jumper) {
    // The professor wears no pack: his parachute is the one tied to the balloon.
    aviator(
      m,
      {
      head: [0, 0.02, -0.48],
      neck: [0, 0, -0.64],
      pelvis: [0, 0, -1.18],
      lShoulder: [-0.2, 0, -0.7],
      rShoulder: [0.2, 0, -0.7],
      lElbow: [-0.27, 0.05, -0.35],
      rElbow: [0.27, 0.05, -0.35],
      lHand: [-0.22, 0.02, 0],
      rHand: [0.22, 0.02, 0],
      lHip: [-0.1, 0, -1.22],
      rHip: [0.1, 0, -1.22],
      lKnee: [-0.12, 0.1, -1.62],
      rKnee: [0.12, 0.06, -1.64],
      lFoot: [-0.12, 0.02, -2.05],
      rFoot: [0.13, -0.02, -2.06],
      scarfTip: [0.15, -0.5, -0.75],
      },
      { pack: false },
    );
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
  writeFileSync(join(OUT_DIR, `${name}.png`), encodeCompactPng(s.width, s.height, s.data));
  sheets.push({ name, fw, fh, ax: A - x0, ay: A - y0, ppm, cols, yaws, anim, elevs });
  console.log(`baked ${name}.png  ${frames.length} frames ${fw}x${fh}`);
}

mkdirSync(OUT_DIR, { recursive: true });

const yawOf = (c, yaws, anim = 1) => ((Math.floor(c / anim) % yaws) / yaws) * Math.PI * 2;

// The Jenny: 16 headings × 3 elevations, with the jumper out on the wing, then
// without him once he has gone.
const PLANE_ELEVS = [6, 28, 58];
const jennies = [jenny(true), jenny(false)];
bake('plane', { ppm: 7, elevs: PLANE_ELEVS, cols: 16, yaws: 16, views: (_e, c) => ({ model: jennies[0], yaw: yawOf(c, 16) }) });
bake('plane-empty', { ppm: 7, elevs: PLANE_ELEVS, cols: 16, yaws: 16, views: (_e, c) => ({ model: jennies[1], yaw: yawOf(c, 16) }) });

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
// A canopy cut away in a double drop: empty, half-collapsed, streaming off.
const looseRig = canopyRig({ stall: true, diver: false });
bake('canopy-loose', {
  ppm: 10,
  elevs: CANOPY_ELEVS,
  cols: 2,
  views: (_e, c) => ({ model: looseRig, pose: mul(rotY(c ? 0.4 : -0.4), rotX(0.5)) }),
  edgeDepth: SHELL_EDGE,
});
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
// The crowd: eight Sunday-best styles × (watching, cheering).
const STYLES = [
  { kind: 'man', suit: navy, hat: 'boater' },
  { kind: 'woman', dress: rose, hat: navy },
  { kind: 'man', suit: charcoal, hat: 'fedora' },
  { kind: 'woman', dress: mint, hat: cream, parasol: true },
  { kind: 'man', suit: tweed, hat: 'cap' },
  { kind: 'shirt', hat: 'boater' },
  { kind: 'child', suit: tweed, hat: 'cap' },
  { kind: 'woman', dress: cream, hat: red },
];
const crowd = STYLES.flatMap((p) => [false, true].map((cheer) => civilian(p, cheer)));
bake('spectator', { ppm: 10, elevs: PROP_ELEVS, cols: 16, views: (_e, c) => ({ model: crowd[c], yaw: Math.PI }), edgeDepth: 0.15 });
const sock = windsock();
bake('windsock', { ppm: 7, elevs: PROP_ELEVS, cols: 8, yaws: 8, views: (_e, c) => ({ model: sock, yaw: yawOf(c, 8) }), edgeDepth: 0.2 });
for (const [name, fn, ppm] of [
  ['barn', barn, 4],
  ['house', house, 4],
  ['hangar', hangar, 3.5],
  ['grandstand', () => grandstand(5), 4],
  ['bigtop', bigTop, 3.5],
  ['church', church, 3.5],
  ['huts', bathingHuts, 5],
  ['bessonneau', bessonneau, 3],
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

// The big wheel turns: 8 headings × 4 steps of a car's spacing.
const wheels = [0, 1, 2, 3].map(ferrisWheel);
bake('ferris', {
  ppm: 3.5,
  elevs: PROP_ELEVS,
  cols: 32,
  yaws: 8,
  anim: 4,
  views: (_e, c) => ({ model: wheels[c % 4], yaw: yawOf(c, 8, 4) }),
});
single('watertower', waterTower(), 4.5);
single('pylon', racePylon(), 5);
// Model Ts parked by the field: 16 headings × (hood up, hood down).
const fords = [modelT(false), modelT(true)];
bake('car', {
  ppm: 8,
  elevs: PROP_ELEVS,
  cols: 32,
  yaws: 16,
  anim: 2,
  views: (_e, c) => ({ model: fords[c % 2], yaw: yawOf(c, 16, 2) }),
  edgeDepth: 0.2,
});
// A Jenny parked on the grass, tail down on its skid (origin under the wheels).
const parked = jennies[1].moved(0, -0.95, 1.91);
const sit = Math.atan2(1.59, 6.15);
bake('jenny', {
  ppm: 5,
  elevs: PROP_ELEVS,
  cols: 8,
  yaws: 8,
  views: (_e, c) => ({ model: parked, yaw: yawOf(c, 8), pose: rotX(sit) }),
});

// Sky dressing: balloons (seen from below too) and cumulus.
const balloons = [
  [red, cream],
  [gold, navy, gold, cream],
  [sky, cream, red],
].map(balloon);
bake('balloon', { ppm: 2.6, elevs: [-25, 2, 30, 65], cols: 3, views: (_e, c) => ({ model: balloons[c] }), edgeDepth: 1 });
// The balloon act's jump ship: with the professor on the trapeze, then empty.
const acts = [smokeBalloon(true), smokeBalloon(false)];
bake('smoke-balloon', { ppm: 5, elevs: [-30, 0, 22, 45], cols: 2, views: (_e, c) => ({ model: acts[c] }), edgeDepth: 0.6 });
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

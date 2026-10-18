/**
 * Mode 7 ground texture — the drop zone rasterised once per jump into a small
 * pyramid of texel grids (fine around the target, coarse out to the horizon).
 * Pure data (typed arrays, no DOM), so it's deterministic and unit-testable.
 *
 * Texels are packed little-endian RGBA (`0xAABBGGRR`), the layout of an
 * `ImageData` viewed as a `Uint32Array`, so the renderer copies them verbatim.
 */

import { BEACH_M, PROP_SIZE, seaDepth, SUN_HEADING, TERRAIN_EXTENT, type Terrain } from './ground';
import type { GameConfig } from './types';

export interface TexLevel {
  /** Metres per texel. */
  mpt: number;
  /** Texels per side. */
  size: number;
  /** World coordinate of the level's top-left corner (it's centred on the target). */
  origin: number;
  /** Repeat outside its bounds (only the coarsest level). */
  wrap: boolean;
  data: Uint32Array;
}

export interface GroundTexture {
  /** Finest first. */
  levels: TexLevel[];
}

/** (metres per texel, texels per side) — finest first; the last one wraps. */
export const DEFAULT_LEVELS: readonly [number, number][] = [
  [0.25, 512], // ±64 m around the target: the landing approach
  [0.5, 1024], // ±256 m: the canopy's final approach
  [1, 1024], // ±512 m: the drop zone
  [4, 512], // ±1 km: free-fall view
  [16, 512], // the countryside to the horizon (wraps)
];

export function packRgb(r: number, g: number, b: number): number {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function hexToPacked(hex: string): number {
  const h = hex.replace('#', '');
  return packRgb(
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  );
}

/** Scale a packed colour's RGB by `f` (clamped). */
export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round((c & 255) * f));
  const g = Math.min(255, Math.round(((c >>> 8) & 255) * f));
  const b = Math.min(255, Math.round(((c >>> 16) & 255) * f));
  return packRgb(r, g, b);
}

/** Small integer hash → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// --- Golden-hour farmland palette (warm-lit greens, wheat, ploughed earth) ---
const C = {
  hedge: hexToPacked('#2c4a1e'),
  grass: hexToPacked('#5a8340'),
  road: hexToPacked('#b19a6c'),
  roadEdge: hexToPacked('#8a7650'),
  water: hexToPacked('#3a6ea5'),
  waterLit: hexToPacked('#5b8cc0'),
  shore: hexToPacked('#3d3a2a'),
  sand: hexToPacked('#d2bf8e'),
  forest: hexToPacked('#2f4a24'),
  crown: hexToPacked('#4f7034'),
  crownLit: hexToPacked('#86a24c'),
  white: hexToPacked('#fff7e0'),
  red: hexToPacked('#c1352b'),
  brass: hexToPacked('#d9a441'),
  dirt: hexToPacked('#a08458'),
};

/** Water texel colours (flat, unshaded) — the renderer animates their glints. */
export const WATER_COLORS: readonly number[] = [C.water, C.waterLit];

/** Field styles: base colour + furrow contrast. */
const FIELDS = [
  { c: hexToPacked('#5d8746'), furrow: 0.9 }, // pasture
  { c: hexToPacked('#4c7533'), furrow: 0.88 }, // deep green crop
  { c: hexToPacked('#7f8a3e'), furrow: 0.86 }, // young barley
  { c: hexToPacked('#b39b4c'), furrow: 0.84 }, // ripe wheat
  { c: hexToPacked('#86643f'), furrow: 0.8 }, // ploughed earth
  { c: hexToPacked('#6a8f4a'), furrow: 0.92 }, // meadow
];

/** Size of the endless background patchwork cells (m). */
const CELL = 170;
/** Hedgerow half-width on cell borders (m). */
const HEDGE = 1.6;

/** Build the texture pyramid for a jump. `levels` is overridable for tests. */
export function buildGroundTexture(
  terrain: Terrain,
  cfg: GameConfig,
  seed: number,
  levels: readonly [number, number][] = DEFAULT_LEVELS,
): GroundTexture {
  return {
    levels: levels.map(([mpt, size], i) => {
      const level: TexLevel = {
        mpt,
        size,
        origin: -(mpt * size) / 2,
        wrap: i === levels.length - 1,
        data: new Uint32Array(size * size),
      };
      paintLevel(level, terrain, cfg, seed);
      return level;
    }),
  };
}

function paintLevel(L: TexLevel, terrain: Terrain, cfg: GameConfig, seed: number): void {
  // 1. Endless patchwork with hedgerows (also under the hand-placed fields).
  const { size, mpt, origin, data } = L;
  for (let ty = 0; ty < size; ty++) {
    const wy = origin + (ty + 0.5) * mpt;
    for (let tx = 0; tx < size; tx++) {
      const wx = origin + (tx + 0.5) * mpt;
      data[ty * size + tx] = patchwork(wx, wy, mpt, tx, ty, seed);
    }
  }

  // 2. The jump's own fields (furrowed crops), road and landmark.
  for (const f of terrain.fields) {
    const style = FIELDS[(f.tint + Math.floor(hash2(f.x | 0, f.y | 0, seed) * 3)) % FIELDS.length];
    const vertical = hash2(f.y | 0, f.x | 0, seed) < 0.5;
    fillRect(L, f.x, f.y, f.x + f.w, f.y + f.h, (wx, wy, n) => {
      const along = vertical ? wx : wy;
      const stripe = furrow(along, mpt) ? style.furrow : 1;
      return shade(style.c, stripe * (0.96 + n * 0.08));
    });
    // Hedge around each field.
    strokeRect(L, f.x, f.y, f.x + f.w, f.y + f.h, HEDGE, C.hedge);
  }

  const road = terrain.road;
  const half = road.widthM / 2;
  if (road.orientation === 'h') {
    fillRect(
      L,
      -TERRAIN_EXTENT * 3,
      road.offset - half - 1,
      TERRAIN_EXTENT * 3,
      road.offset + half + 1,
      () => C.roadEdge,
    );
    fillRect(
      L,
      -TERRAIN_EXTENT * 3,
      road.offset - half,
      TERRAIN_EXTENT * 3,
      road.offset + half,
      (_x, _y, n) => shade(C.road, 0.95 + n * 0.1),
    );
  } else {
    fillRect(
      L,
      road.offset - half - 1,
      -TERRAIN_EXTENT * 3,
      road.offset + half + 1,
      TERRAIN_EXTENT * 3,
      () => C.roadEdge,
    );
    fillRect(
      L,
      road.offset - half,
      -TERRAIN_EXTENT * 3,
      road.offset + half,
      TERRAIN_EXTENT * 3,
      (_x, _y, n) => shade(C.road, 0.95 + n * 0.1),
    );
  }

  const lm = terrain.landmark;
  if (lm.kind === 'lake') {
    fillEllipse(L, lm.x, lm.y, lm.rx + 3, lm.ry + 3, C.shore);
    fillEllipse(L, lm.x, lm.y, lm.rx, lm.ry, C.water);
    fillEllipse(
      L,
      lm.x - lm.rx * 0.15,
      lm.y - lm.ry * 0.15,
      lm.rx * 0.55,
      lm.ry * 0.55,
      C.waterLit,
    );
    fillEllipse(L, lm.x - lm.rx * 0.15, lm.y - lm.ry * 0.15, lm.rx * 0.38, lm.ry * 0.38, C.water);
  } else if (lm.kind === 'forest') {
    fillEllipse(L, lm.x, lm.y, lm.r, lm.r, C.forest);
  } else {
    const h = lm.orientation === 'h';
    const hl = (h ? lm.lengthM : lm.widthM) / 2;
    const hw = (h ? lm.widthM : lm.lengthM) / 2;
    fillRect(L, lm.x - hl - 1, lm.y - hw - 1, lm.x + hl + 1, lm.y + hw + 1, () => C.roadEdge);
    fillRect(L, lm.x - hl, lm.y - hw, lm.x + hl, lm.y + hw, (_x, _y, n) =>
      shade(C.dirt, 0.95 + n * 0.1),
    );
    // Threshold bars and centreline dashes.
    const len = lm.lengthM / 2;
    for (const end of [-1, 1]) {
      const c = end * (len - 5);
      if (h) {
        fillRect(
          L,
          lm.x + c - 1.5,
          lm.y - hw * 0.7,
          lm.x + c + 1.5,
          lm.y + hw * 0.7,
          () => C.white,
        );
      } else {
        fillRect(
          L,
          lm.x - hl * 0.7,
          lm.y + c - 1.5,
          lm.x + hl * 0.7,
          lm.y + c + 1.5,
          () => C.white,
        );
      }
    }
    for (let m = -len + 24; m < len - 16; m += 24) {
      if (h) {
        fillRect(L, lm.x + m - 4, lm.y - 0.75, lm.x + m + 4, lm.y + 0.75, () => C.white);
      } else {
        fillRect(L, lm.x - 0.75, lm.y + m - 4, lm.x + 0.75, lm.y + m + 4, () => C.white);
      }
    }
  }

  // Ponds and the river are flat: painted, not stood up as sprites.
  for (const p of terrain.ponds) {
    fillEllipse(L, p.x, p.y, p.r * 1.12, p.r * 0.82, C.shore);
    fillEllipse(L, p.x, p.y, p.r, p.r * 0.72, C.water);
  }
  if (terrain.river) {
    const { points, width } = terrain.river;
    for (let i = 1; i < points.length; i++) {
      capsule(L, points[i - 1], points[i], width / 2 + 2.5, () => C.shore);
    }
    for (let i = 1; i < points.length; i++) {
      capsule(L, points[i - 1], points[i], width / 2, () => C.water);
    }
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      if (i % 3 === 0) {
        capsule(L, [ax, ay], [(ax + bx) / 2, (ay + by) / 2], width * 0.12, () => C.waterLit);
      }
    }
  }

  // The sea: foam at the waterline, shallows, then open water; a sand beach.
  if (terrain.sea) {
    const sea = terrain.sea;
    const span = L.size * L.mpt;
    fillRect(L, L.origin, L.origin, L.origin + span, L.origin + span, (wx, wy, n) => {
      const d = seaDepth(sea, wx, wy);
      if (d > 0) {
        if (d < 2.5) return n > 0.35 ? C.white : C.waterLit;
        return d < 30 && Math.floor((d + n * 4) / 9) % 2 === 0 ? C.waterLit : C.water;
      }
      if (d > -BEACH_M) {
        return shade(C.sand, (d > -5 ? 0.86 : 0.97) + n * 0.07);
      }
      return L.data[texelIndex(L, wx, wy)];
    });
  }

  // 3. The target: a raked sand disc with painted rings (a moving target rides
  // its wagon instead — the renderer draws it).
  const R = cfg.targetRadius;
  if (cfg.targetSpeed > 0) {
    paintShadows(L, terrain, mpt);
    return;
  }
  const line = Math.max(0.6, mpt);
  fillEllipse(L, 0, 0, R + 2, R + 2, C.sand, (n) => shade(C.sand, 0.95 + n * 0.08));
  ring(L, R, line, C.white);
  ring(L, R * 0.6, line, C.brass);
  ring(L, R * 0.3, line, C.red);
  fillEllipse(L, 0, 0, cfg.bullseyeRadius, cfg.bullseyeRadius, C.red);
  fillEllipse(L, 0, 0, cfg.bullseyeRadius * 0.4, cfg.bullseyeRadius * 0.4, C.white);

  paintShadows(L, terrain, mpt);
}

/** Long golden-hour shadows, cast away from the low sun. */
function paintShadows(L: TexLevel, terrain: Terrain, mpt: number): void {
  const sx = -Math.sin(SUN_HEADING);
  const sy = Math.cos(SUN_HEADING);
  for (const p of terrain.props) {
    const size = PROP_SIZE[p.kind];
    const len = size.height * p.scale * 1.5;
    const r = Math.max(size.radius * p.scale, mpt * 0.6);
    darkenCapsule(L, [p.x, p.y], [p.x + sx * len, p.y + sy * len], r, 0.68);
  }
}

/** Paint a capsule (thick segment) with `fn`. */
function capsule(
  L: TexLevel,
  a: [number, number],
  b: [number, number],
  r: number,
  fn: TexelFn,
): void {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  fillRect(
    L,
    Math.min(ax, bx) - r,
    Math.min(ay, by) - r,
    Math.max(ax, bx) + r,
    Math.max(ay, by) + r,
    (wx, wy, n) => {
      const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / len2));
      return Math.hypot(ax + dx * t - wx, ay + dy * t - wy) <= r
        ? fn(wx, wy, n)
        : L.data[texelIndex(L, wx, wy)];
    },
  );
}

/** Multiply the texels under a capsule (a cast shadow), tapering toward its tip. */
function darkenCapsule(
  L: TexLevel,
  a: [number, number],
  b: [number, number],
  r: number,
  f: number,
): void {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  fillRect(
    L,
    Math.min(ax, bx) - r,
    Math.min(ay, by) - r,
    Math.max(ax, bx) + r,
    Math.max(ay, by) + r,
    (wx, wy) => {
      const c = L.data[texelIndex(L, wx, wy)];
      const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / len2));
      const rr = r * (1 - t * 0.45);
      return Math.hypot(ax + dx * t - wx, ay + dy * t - wy) <= rr ? shade(c, f) : c;
    },
  );
}

/**
 * Background farmland: rows of cells laid in a brick bond (each row shifted)
 * so the hedges never line up into a grid, most cells split into two fields,
 * the odd one a copse; hedgerow trees along the borders; a slow brightness
 * swell across the land so no two fields of a kind match.
 */
function patchwork(
  wx: number,
  wy: number,
  mpt: number,
  tx: number,
  ty: number,
  seed: number,
): number {
  const cy = Math.floor(wy / CELL);
  const shift = hash2(cy, 7, seed ^ 0x51ed) * CELL;
  const cx = Math.floor((wx + shift) / CELL);
  let lx = wx + shift - cx * CELL;
  let ly = wy - cy * CELL;
  const n = hash2(tx, ty, seed);
  const edge = Math.max(HEDGE, mpt * 0.5);
  const swell = landSwell(wx, wy, seed);

  // Split most cells in two along one axis.
  const hs = hash2(cx, cy, seed ^ 0x3c6e);
  const split = hs < 0.78;
  const splitX = hs < 0.4;
  const cut = CELL * (0.3 + 0.4 * hash2(cy, cx, seed ^ 0x1234));
  let sub = 0;
  if (split) {
    const along = splitX ? lx : ly;
    if (Math.abs(along - cut) < edge) {
      return shade(C.hedge, (0.92 + n * 0.16) * swell);
    }
    if (along > cut) {
      sub = 1;
      if (splitX) lx -= cut;
      else ly -= cut;
    }
  }
  if (lx < edge || ly < edge) {
    return shade(C.hedge, (0.92 + n * 0.16) * swell);
  }

  // Hedgerow trees: crowns standing on the borders, every ~14 m (where resolvable).
  if (mpt <= 2 && (lx < 6 || ly < 6)) {
    const tree = hedgeTree(lx < ly ? wy : wx + shift, lx < ly ? lx : ly, cx, cy, seed);
    if (tree > 0) {
      return shade(tree > 1 ? C.crownLit : C.crown, (0.9 + n * 0.14) * swell);
    }
  }

  const h = hash2(cx * 2 + sub, cy, seed ^ 0x9e3779b9);
  if (h < 0.07) {
    return copse(wx, wy, n, swell, seed); // a little wood
  }
  if (h < 0.3) {
    return shade(C.grass, (0.94 + n * 0.12) * swell); // open pasture
  }
  const style = FIELDS[Math.floor(h * 997) % FIELDS.length];
  const vertical = h * 31 - Math.floor(h * 31) < 0.5;
  const stripe = furrow(vertical ? wx : wy, mpt) ? style.furrow : 1;
  return shade(style.c, stripe * (0.95 + n * 0.1) * swell);
}

/** Slow ±6% brightness swell over a few hundred metres (bilinear value noise). */
function landSwell(wx: number, wy: number, seed: number): number {
  const u = wx / 260;
  const v = wy / 260;
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  const fu = u - iu;
  const fv = v - iv;
  const su = fu * fu * (3 - 2 * fu);
  const sv = fv * fv * (3 - 2 * fv);
  const a = hash2(iu, iv, seed ^ 0x7f4a);
  const b = hash2(iu + 1, iv, seed ^ 0x7f4a);
  const c = hash2(iu, iv + 1, seed ^ 0x7f4a);
  const d = hash2(iu + 1, iv + 1, seed ^ 0x7f4a);
  const val = a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  return 0.94 + val * 0.12;
}

/**
 * A crown on a hedge? `along` runs down the border, `off` is the distance from
 * it. Returns 0 (none), 1 (crown) or 2 (sunlit side of the crown).
 */
function hedgeTree(along: number, off: number, cx: number, cy: number, seed: number): number {
  const slot = Math.floor(along / 14);
  if (hash2(slot, cx * 31 + cy, seed ^ 0x2b7) > 0.55) {
    return 0;
  }
  const centre = slot * 14 + 7 + (hash2(cy, slot, seed) - 0.5) * 6;
  const r = 2.4 + hash2(slot, cy, seed ^ 0x99) * 1.8;
  const dx = along - centre;
  const dy = off - 1;
  if (dx * dx + dy * dy > r * r) {
    return 0;
  }
  // Lit toward the low sun (up-left in texture space).
  return dx + dy < -r * 0.35 ? 2 : 1;
}

/** Woodland: a canopy of round crowns on a jittered 4 m grid, lit on one side. */
function copse(wx: number, wy: number, n: number, swell: number, seed: number): number {
  const gx = Math.floor(wx / 4);
  const gy = Math.floor(wy / 4);
  let best = 1e9;
  let lit = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ox = (gx + i) * 4 + 2 + (hash2(gx + i, gy + j, seed ^ 0x51) - 0.5) * 2.6;
      const oy = (gy + j) * 4 + 2 + (hash2(gy + j, gx + i, seed ^ 0x52) - 0.5) * 2.6;
      const dx = wx - ox;
      const dy = wy - oy;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        lit = dx + dy;
      }
    }
  }
  const r = Math.sqrt(best);
  if (r > 2.6) {
    return shade(C.forest, (0.7 + n * 0.1) * swell); // gaps between crowns
  }
  const base = lit < -0.8 ? C.crownLit : C.crown;
  return shade(base, (0.88 + n * 0.12 - r * 0.05) * swell);
}

/** Furrow stripes, only where the texel grid can resolve them. */
function furrow(along: number, mpt: number): boolean {
  if (mpt > 1) {
    return false;
  }
  const half = mpt <= 0.25 ? 1.25 : 2;
  return Math.floor(along / half) % 2 !== 0;
}

type TexelFn = (wx: number, wy: number, noise: number) => number;

/** Texel range covering world [a, b) on a level axis, clipped. */
function span(L: TexLevel, a: number, b: number): [number, number] {
  const lo = Math.max(0, Math.floor((a - L.origin) / L.mpt));
  const hi = Math.min(L.size, Math.ceil((b - L.origin) / L.mpt));
  return [lo, hi];
}

function fillRect(L: TexLevel, x0: number, y0: number, x1: number, y1: number, fn: TexelFn): void {
  const [tx0, tx1] = span(L, x0, x1);
  const [ty0, ty1] = span(L, y0, y1);
  for (let ty = ty0; ty < ty1; ty++) {
    const wy = L.origin + (ty + 0.5) * L.mpt;
    if (wy < y0 || wy >= y1) continue;
    for (let tx = tx0; tx < tx1; tx++) {
      const wx = L.origin + (tx + 0.5) * L.mpt;
      if (wx < x0 || wx >= x1) continue;
      L.data[ty * L.size + tx] = fn(wx, wy, hash2(tx, ty, 77));
    }
  }
}

function strokeRect(
  L: TexLevel,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  c: number,
): void {
  const t = Math.max(w, L.mpt * 0.6);
  const fn: TexelFn = (_x, _y, n) => shade(c, 0.92 + n * 0.16);
  fillRect(L, x0 - t, y0 - t, x1 + t, y0 + t, fn);
  fillRect(L, x0 - t, y1 - t, x1 + t, y1 + t, fn);
  fillRect(L, x0 - t, y0, x0 + t, y1, fn);
  fillRect(L, x1 - t, y0, x1 + t, y1, fn);
}

function fillEllipse(
  L: TexLevel,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: number,
  noisy?: (n: number) => number,
): void {
  if (rx <= 0 || ry <= 0) return;
  fillRect(L, cx - rx, cy - ry, cx + rx, cy + ry, (wx, wy, n) => {
    const dx = (wx - cx) / rx;
    const dy = (wy - cy) / ry;
    if (dx * dx + dy * dy > 1) {
      return L.data[texelIndex(L, wx, wy)];
    }
    return noisy ? noisy(n) : c;
  });
}

/** A painted ring of `width` metres around the origin (the target's lines). */
function ring(L: TexLevel, r: number, width: number, c: number): void {
  const outer = r + width / 2;
  const inner = Math.max(0, r - width / 2);
  fillRect(L, -outer, -outer, outer, outer, (wx, wy) => {
    const d = Math.hypot(wx, wy);
    return d <= outer && d >= inner ? c : L.data[texelIndex(L, wx, wy)];
  });
}

function texelIndex(L: TexLevel, wx: number, wy: number): number {
  const tx = Math.floor((wx - L.origin) / L.mpt);
  const ty = Math.floor((wy - L.origin) / L.mpt);
  return ty * L.size + tx;
}

/**
 * Sample the pyramid at a world point, starting from level `from` and falling
 * back to coarser levels outside a level's bounds (the last one wraps).
 */
export function sampleGround(tex: GroundTexture, wx: number, wy: number, from: number): number {
  const levels = tex.levels;
  for (let i = from; i < levels.length; i++) {
    const L = levels[i];
    let tx = Math.floor((wx - L.origin) / L.mpt);
    let ty = Math.floor((wy - L.origin) / L.mpt);
    if (tx < 0 || ty < 0 || tx >= L.size || ty >= L.size) {
      if (!L.wrap) continue;
      tx = ((tx % L.size) + L.size) % L.size;
      ty = ((ty % L.size) + L.size) % L.size;
    }
    return L.data[ty * L.size + tx];
  }
  return C.grass;
}

/** Finest level whose texels are no smaller than half the pixel footprint. */
export function levelForFootprint(tex: GroundTexture, metresPerPixel: number): number {
  const levels = tex.levels;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].mpt >= metresPerPixel * 0.5) {
      return i;
    }
  }
  return levels.length - 1;
}

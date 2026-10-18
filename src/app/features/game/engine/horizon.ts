import { horizonY, type Camera } from './camera';
import { SUN_ELEVATION, SUN_HEADING } from './ground';
import { hexToPacked } from './ground-texture';
import { mixPacked } from './raster';

/**
 * The golden-hour sky, the setting sun and the ridges on the horizon, painted
 * straight into the world raster at the canvas's own resolution — no sprite
 * sheet to scale, so they stay crisp at any internal size. Everything is a
 * function of the camera (and is drawn far away, so it only rotates with it).
 * Colour blends are ordered-dithered (4×4 Bayer): smooth gradients that still
 * read as pixel art.
 */

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Golden-hour sky: (elevation in radians, colour), horizon → zenith. */
export const SKY: readonly [number, number][] = [
  [0, hexToPacked('#f6be72')],
  [0.03, hexToPacked('#eea862')],
  [0.08, hexToPacked('#d37c48')],
  [0.15, hexToPacked('#9c5e5c')],
  [0.23, hexToPacked('#6b5480')],
  [0.34, hexToPacked('#3e4772')],
  [0.52, hexToPacked('#1e2d4c')],
];

/** The haze the distance fades into: the sky right at the horizon. */
export const FOG = SKY[0][1];

const GLOW = hexToPacked('#ffe0a0');
const SUN_BANDS: readonly [number, number][] = [
  // (radius as a fraction of the disc, colour), centre → rim
  [0.42, hexToPacked('#fff6dc')],
  [0.66, hexToPacked('#ffe0a0')],
  [0.84, hexToPacked('#f8c070')],
  [1, hexToPacked('#ec8a50')],
];
/** Angular radius of the (stylised, oversized) setting sun. */
const SUN_RADIUS = 0.06;

interface Ridge {
  /** Mean crest elevation and its relief (rad). */
  base: number;
  relief: number;
  /** (cycles per turn, weight, phase): whole cycles, so the skyline wraps seamlessly. */
  waves: readonly (readonly [number, number, number])[];
  /** Crest jitter (rad) — a tree line on the near hills. */
  treeline: number;
  body: number;
  rim: number;
  /** How much the foot of the ridge melts into the haze (0..1). */
  haze: number;
}

const RIDGES: readonly Ridge[] = [
  {
    base: 0.05,
    relief: 0.03,
    waves: [
      [3, 0.55, 0.4],
      [7, 0.3, 2.1],
      [19, 0.15, 0.9],
    ],
    treeline: 0,
    body: hexToPacked('#8a6688'),
    rim: hexToPacked('#f6c27a'),
    haze: 0.75,
  },
  {
    base: 0.028,
    relief: 0.024,
    waves: [
      [2, 0.5, 2.6],
      [5, 0.32, 0.3],
      [11, 0.18, 1.7],
    ],
    treeline: 0.0035,
    body: hexToPacked('#4a3658'),
    rim: hexToPacked('#e09058'),
    haze: 0.45,
  },
];

function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

function hash1(n: number): number {
  let h = Math.imul(n | 0, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Quantise a 0..1 blend to 4 steps with an ordered dither (x, y = pixel). */
function dithered(t: number, x: number, y: number): number {
  return Math.floor(t * 4 + BAYER4[(y & 3) * 4 + (x & 3)] / 16) / 4;
}

/** Per-column data for a frame: azimuth relative to the camera, and the sun glow. */
export interface SkyFrame {
  /** Azimuth of each column's view ray, relative to the camera heading (rad). */
  azimuth: Float32Array;
  /** Horizontal falloff of the sunset glow per column (0..1). */
  glow: Float32Array;
}

export function skyFrame(cam: Camera, w: number): SkyFrame {
  const azimuth = new Float32Array(w);
  const glow = new Float32Array(w);
  const cosP = Math.cos(cam.pitch);
  for (let x = 0; x < w; x++) {
    const a = Math.atan(((x + 0.5 - cam.cx) * cosP) / cam.focal);
    azimuth[x] = a;
    const d = wrapAngle(cam.heading + a - SUN_HEADING);
    glow[x] = Math.exp(-(d * d) / 0.5);
  }
  return { azimuth, glow };
}

/** One row of sky: the gradient, dithered across each band, warmed toward the sun. */
export function paintSkyRow(
  px: Uint32Array,
  off: number,
  w: number,
  y: number,
  elev: number,
  frame: SkyFrame,
): void {
  let c0 = SKY[SKY.length - 1][1];
  let c1 = c0;
  let t = 0;
  if (elev <= SKY[0][0]) {
    c0 = c1 = SKY[0][1];
  } else {
    for (let i = 0; i < SKY.length - 1; i++) {
      if (elev < SKY[i + 1][0]) {
        c0 = SKY[i][1];
        c1 = SKY[i + 1][1];
        t = (elev - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
        break;
      }
    }
  }
  // The glow hugs the horizon around the sun.
  const de = Math.max(0, elev) - SUN_ELEVATION * 0.5;
  const vert = Math.exp(-(de * de) / 0.012);
  const brow = (y & 3) * 4;
  const t16 = t * 16;
  for (let x = 0; x < w; x++) {
    let c = t16 > BAYER4[brow + (x & 3)] ? c1 : c0;
    const g = frame.glow[x] * vert * 0.75;
    if (g > 0.04) {
      const q = dithered(g, x, y);
      if (q > 0) {
        c = mixPacked(c, GLOW, q);
      }
    }
    px[off + x] = c;
  }
}

/** The setting sun: banded disc with a dithered corona. */
export function paintSun(px: Uint32Array, w: number, h: number, cam: Camera): void {
  const rel = wrapAngle(SUN_HEADING - cam.heading);
  if (Math.abs(rel) > 1.4) {
    return;
  }
  // Ray → screen (same maths as camera.project, for a point at infinity).
  const cosA = Math.cos(rel);
  const tanE = Math.tan(SUN_ELEVATION);
  const sinP = Math.sin(cam.pitch);
  const cosP = Math.cos(cam.pitch);
  const depth = cosA * cosP - tanE * sinP;
  if (depth <= 0.05) {
    return;
  }
  const sx = cam.cx + (cam.focal * Math.sin(rel)) / depth;
  const sy = cam.cy - (cam.focal * (cosA * sinP + tanE * cosP)) / depth;
  const r = cam.focal * Math.tan(SUN_RADIUS);
  const corona = r * 1.35;
  const x0 = Math.max(0, Math.floor(sx - corona));
  const x1 = Math.min(w - 1, Math.ceil(sx + corona));
  const y0 = Math.max(0, Math.floor(sy - corona));
  const y1 = Math.min(h - 1, Math.ceil(sy + corona));
  const horizon = horizonY(cam);
  for (let y = y0; y <= y1; y++) {
    if (y >= horizon) break; // below the horizon the ground covers it
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy) / r;
      const i = y * w + x;
      if (d > 1) {
        if (d < 1.35) {
          const q = dithered((1.35 - d) / 0.35, x, y) * 0.7;
          if (q > 0) px[i] = mixPacked(px[i], SUN_BANDS[3][1], q);
        }
        continue;
      }
      let band = 0;
      while (band < SUN_BANDS.length - 1 && d > SUN_BANDS[band][0]) band++;
      // Dither the last 30% of each band into the next one out.
      const inner = band === 0 ? 0 : SUN_BANDS[band - 1][0];
      const t = (d - inner) / (SUN_BANDS[band][0] - inner);
      const next = Math.min(SUN_BANDS.length - 1, band + 1);
      const mixT = Math.max(0, (t - 0.7) / 0.3);
      px[i] = mixT * 16 > BAYER4[(y & 3) * 4 + (x & 3)] ? SUN_BANDS[next][1] : SUN_BANDS[band][1];
    }
  }
}

/** The hills on the horizon, far range then near, rim-lit on the sun's side. */
export function paintRidges(
  px: Uint32Array,
  w: number,
  h: number,
  cam: Camera,
  frame: SkyFrame,
): void {
  const hy = horizonY(cam);
  if (hy <= 0) {
    return; // looking down past the horizon (free fall)
  }
  const bottom = Math.min(h, Math.floor(hy));
  const sinP = Math.sin(cam.pitch);
  const cosP = Math.cos(cam.pitch);
  for (const ridge of RIDGES) {
    for (let x = 0; x < w; x++) {
      const a = frame.azimuth[x];
      const phi = cam.heading + a;
      let crest = 0;
      for (const [f, wgt, ph] of ridge.waves) {
        crest += wgt * Math.sin(f * phi + ph);
      }
      let e = ridge.base + ridge.relief * crest;
      if (ridge.treeline > 0) {
        // Clumps of trees: a crest bump every ~0.006 rad, re-rolled per clump.
        const k = Math.floor(phi / 0.006);
        e += ridge.treeline * (hash1(k) > 0.45 ? hash1(k + 977) : 0);
      }
      const cosA = Math.cos(a);
      const tanE = Math.tan(e);
      const depth = cosA * cosP - tanE * sinP;
      if (depth <= 0.05) continue;
      const top = Math.round(cam.cy - (cam.focal * (cosA * sinP + tanE * cosP)) / depth);
      if (top >= bottom) continue;
      const span = Math.max(1, bottom - top);
      const lit = frame.glow[x];
      for (let y = Math.max(0, top); y < bottom; y++) {
        const i = y * w + x;
        let c = ridge.body;
        if (y === top || (y === top + 1 && lit > 0.35)) {
          // Backlit crest: a warm line, brighter toward the sun.
          c = mixPacked(ridge.body, ridge.rim, 0.35 + 0.65 * lit);
        } else {
          const t = ((y - top) / span) * ridge.haze;
          const q = dithered(t, x, y);
          if (q > 0) c = mixPacked(c, FOG, q);
        }
        px[i] = c;
      }
    }
  }
}

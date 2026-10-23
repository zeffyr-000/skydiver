import { clamp, forwardOf } from './physics';
import type { GameConfig, GameState } from './types';
import { Phase } from './types';

/**
 * Chase camera for the Mode 7 renderer — pure math, no DOM.
 *
 * The camera orbits behind and above the diver along his heading, looking down
 * at `pitch` (0 = level with the horizon, π/2 = straight down), so the diver
 * projects onto the principal point (just below it under canopy). Pitch and distance blend between
 * framings per phase: a shallow look over the plane's nose on the jump run, a
 * steep look into the column in free fall (the hoops are below), then a low
 * chase behind the canopy that flattens toward the horizon near the ground
 * (aimed a little above the diver, so his wing stays in frame).
 * Everything derives from the state's timers, so the swings are deterministic.
 */
export interface Camera {
  /** World position; `z` is height above the ground (m). */
  x: number;
  y: number;
  z: number;
  /** Yaw (rad, clockwise from north) and look-down angle (rad). */
  heading: number;
  pitch: number;
  /** Focal length in pixels and the principal point. */
  focal: number;
  cx: number;
  cy: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** Distance along the view axis (m). */
  depth: number;
  /** Pixels per metre at that depth. */
  scale: number;
}

const DEG = Math.PI / 180;
/** Vertical field of view — kept constant so any internal height frames alike. */
const VFOV = 64 * DEG;

const PITCH_PLANE = 22 * DEG;
const PITCH_FREEFALL = 76 * DEG;
const PITCH_CANOPY_HIGH = 26 * DEG;
const PITCH_CANOPY_LOW = 13 * DEG;
const DIST_PLANE = 34;
const DIST_FREEFALL = 16;
const DIST_CANOPY = 20;
const DIST_OUTRO = 10;
/** Look-at lift under canopy (m): between the diver and his wing. */
export const CANOPY_LIFT = 3.5;
/** Seconds after exit for the camera to swing from the run to the column. */
const EXIT_SWING = 1.4;
/** Seconds after the canopy opens for the camera to settle behind it. */
const OPEN_SWING = 1.2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Camera framing for a state on a `w`×`h` internal canvas. */
export function cameraFor(s: GameState, cfg: GameConfig, w: number, h: number): Camera {
  const focal = h / 2 / Math.tan(VFOV / 2);
  let pitch: number;
  let dist: number;
  /** Height of the look-at point above the diver: under canopy the camera aims
   *  between him and the wing so both stay in frame. */
  let lift = 0;

  const canopyPitch = lerp(
    PITCH_CANOPY_LOW,
    PITCH_CANOPY_HIGH,
    clamp((s.altitude - 12) / 160, 0, 1),
  );
  if (s.phase === Phase.Plane) {
    pitch = PITCH_PLANE;
    dist = DIST_PLANE;
  } else if (s.phase === Phase.Freefall && s.cutawayAt !== null) {
    // Cut away (double drop): swing from the canopy chase back down the column.
    const k = smoothstep((s.freefallTime - s.cutawayAt) / EXIT_SWING);
    pitch = lerp(canopyPitch, PITCH_FREEFALL, k);
    dist = lerp(DIST_CANOPY, DIST_FREEFALL, k);
    lift = CANOPY_LIFT * (1 - k);
  } else if (s.phase === Phase.Freefall || s.pullAltitude === null) {
    const k = smoothstep(s.freefallTime / EXIT_SWING);
    pitch = lerp(PITCH_PLANE, PITCH_FREEFALL, k);
    dist = lerp(DIST_PLANE, DIST_FREEFALL, k);
  } else {
    const open =
      s.phase === Phase.Deploying
        ? 0.5 * (1 - s.deployTimer / Math.max(cfg.deployDuration, 1e-9))
        : 0.5 + 0.5 * Math.min(1, s.canopyTime / OPEN_SWING);
    const k = smoothstep(open);
    pitch = lerp(PITCH_FREEFALL, canopyPitch, k);
    dist = lerp(DIST_FREEFALL, DIST_CANOPY, k);
    lift = CANOPY_LIFT * k;
  }

  // Outro: a slow orbit around the diver on the ground, closing in on him.
  let heading = s.heading;
  if ((s.phase === Phase.Landed || s.phase === Phase.Crashed) && cfg.outroDuration > 0) {
    const t = smoothstep(1 - s.outroTimer / cfg.outroDuration);
    heading += t * 0.6;
    dist = lerp(dist, DIST_OUTRO, t);
    lift = lerp(lift, 1, t);
  }

  const f = forwardOf(heading);
  const back = dist * Math.cos(pitch);
  return {
    x: s.posX - f.x * back,
    y: s.posY - f.y * back,
    z: s.altitude + lift + dist * Math.sin(pitch),
    heading,
    pitch,
    focal,
    cx: w / 2,
    cy: h / 2,
  };
}

/** Project a world point (z = height above ground); null when behind the camera. */
export function project(cam: Camera, x: number, y: number, z: number): Projected | null {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const sinH = Math.sin(cam.heading);
  const cosH = Math.cos(cam.heading);
  const right = dx * cosH + dy * sinH;
  const fwd = dx * sinH - dy * cosH;
  const sinP = Math.sin(cam.pitch);
  const cosP = Math.cos(cam.pitch);
  const depth = fwd * cosP - dz * sinP;
  if (depth <= 0.5) {
    return null;
  }
  const up = fwd * sinP + dz * cosP;
  const scale = cam.focal / depth;
  return { sx: cam.cx + right * scale, sy: cam.cy - up * scale, depth, scale };
}

/** Screen row of the horizon (may be off-screen, negative when looking down). */
export function horizonY(cam: Camera): number {
  return cam.cy - cam.focal * Math.tan(cam.pitch);
}

/**
 * Ground intersection for a screen row (Mode 7): every pixel of a row hits the
 * ground at the same forward distance, stepping sideways by a fixed amount.
 * Returns null above the horizon. `rowY` is the pixel row's centre.
 */
export function floorRow(
  cam: Camera,
  rowY: number,
): { t: number; forward: number; stepPerPixel: number; distance: number } | null {
  const v = (cam.cy - rowY) / cam.focal;
  const sinP = Math.sin(cam.pitch);
  const cosP = Math.cos(cam.pitch);
  const denom = sinP - v * cosP;
  if (denom <= 1e-4 || cam.z <= 0) {
    return null;
  }
  const t = cam.z / denom;
  const forward = t * (cosP + v * sinP);
  return { t, forward, stepPerPixel: t / cam.focal, distance: t * Math.sqrt(1 + v * v) };
}

/** Elevation of a screen row's view ray above the horizontal (rad). */
export function rowElevation(cam: Camera, rowY: number): number {
  const v = (cam.cy - rowY) / cam.focal;
  const sinP = Math.sin(cam.pitch);
  const cosP = Math.cos(cam.pitch);
  return Math.atan2(v * cosP - sinP, cosP + v * sinP);
}

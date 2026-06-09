/**
 * Sky Diver simulation types — pure data, no Angular / DOM / rAF dependency.
 * The whole engine is built around these so the physics stays deterministic
 * and unit-testable, and the camera/perspective can change without touching it.
 */

/** Phases of a single jump. */
export enum Phase {
  /** Accelerating in free fall, weak wind, high terminal velocity. */
  Freefall = 'freefall',
  /** Parachute open: slow descent, strong wind drift, more steering authority. */
  Canopy = 'canopy',
  /** Touched down safely on/near the target. */
  Landed = 'landed',
  /** Touched down too fast (never deployed, deployed too low, or stalled into the ground). */
  Crashed = 'crashed',
}

/** One frame of player intent, produced by the input layer. */
export interface InputState {
  /** -1 (left) .. 1 (right). */
  steerX: number;
  /** -1 (up/north) .. 1 (down/south). */
  steerY: number;
  /** True for exactly one frame when the deploy key is pressed (edge-triggered). */
  deployPressed: boolean;
  /** 0 (none) .. 1 (full) flare, held. */
  flare: number;
}

/** All tunable constants for a run. Grouped so difficulty just swaps a few. */
export interface GameConfig {
  /** Exit altitude in metres. */
  startAltitude: number;
  /** Drives how quickly descent speed approaches its phase terminal velocity. */
  gravity: number;
  /** Terminal descent speed in free fall (m/s). */
  freefallTerminal: number;
  /** Terminal descent speed under the open canopy (m/s). Must be < safeLandingSpeed. */
  canopyTerminal: number;
  /** Horizontal steering acceleration in free fall (m/s²). */
  steerAccelFreefall: number;
  /** Horizontal steering acceleration under canopy (m/s²) — usually larger. */
  steerAccelCanopy: number;
  /** Per-second retention of velocity relative to the air → momentum/inertia (0..1). */
  damping: number;
  /** Base wind magnitude (m/s). */
  windBase: number;
  /** Fraction of wind that drifts the diver in free fall (small). */
  windFreefallFactor: number;
  /** Fraction of wind that drifts the diver under canopy (large). */
  windCanopyFactor: number;
  /** Amplitude of the deterministic gust that wanders around the base wind (m/s). */
  windGust: number;
  /** How much full flare lowers canopy terminal velocity (m/s). */
  flareSlowdown: number;
  /** Flare amount above which the canopy stalls (0..1). */
  stallThreshold: number;
  /** Seconds a stall lasts before the canopy re-inflates. */
  stallDuration: number;
  /** Descent speed at/below which a touchdown is a safe landing (m/s). */
  safeLandingSpeed: number;
  /** Outer radius of the scoring target in metres. */
  targetRadius: number;
  /** Inner bullseye radius (max points) in metres. */
  bullseyeRadius: number;
  /** Maximum horizontal offset from the target at exit (metres). */
  startSpread: number;
}

/** Outcome of a resolved jump. */
export interface JumpResult {
  /** Horizontal distance from the bullseye centre at touchdown (metres). */
  landedDistance: number;
  /** Seconds spent in free fall (drives the late-deploy scoring bonus). */
  freefallTime: number;
  /** Descent speed at touchdown (m/s). */
  landingSpeed: number;
  /** Whether the landing was a crash (no points). */
  crashed: boolean;
  /** Whether the diver hit the inner bullseye. */
  bullseye: boolean;
  /** Points awarded for this jump (0 on a crash or a miss). */
  score: number;
}

/** Full mutable simulation state. `integrate` returns a fresh copy each step. */
export interface GameState {
  phase: Phase;
  /** Metres above the ground; lands at 0. */
  altitude: number;
  /** Downward vertical speed (m/s, >= 0). */
  descentSpeed: number;
  /** Ground-plane offset from the bullseye centre at (0, 0) (metres). */
  posX: number;
  posY: number;
  /** Ground-plane velocity (m/s). */
  velX: number;
  velY: number;
  /** Steady base wind vector chosen at exit (m/s). */
  windBaseX: number;
  windBaseY: number;
  /** Current wind vector including the gust wander (what the HUD shows). */
  windX: number;
  windY: number;
  /** Smoothed flare amount (0..1) used for stall detection. */
  flareAmount: number;
  /** True while the canopy is collapsed from over-flaring. */
  stalled: boolean;
  /** Seconds remaining in the current stall. */
  stallTimer: number;
  /** Seconds since exit. */
  elapsed: number;
  /** Seconds spent in free fall so far. */
  freefallTime: number;
  /** Set once the jump resolves. */
  result: JumpResult | null;
}

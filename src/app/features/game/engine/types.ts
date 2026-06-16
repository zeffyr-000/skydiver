/**
 * Sky Diver simulation types — pure data, no Angular / DOM / rAF dependency.
 * The whole engine is built around these so the physics stays deterministic
 * and unit-testable, and the camera/perspective can change without touching it.
 */

/** Phases of a single jump. */
export enum Phase {
  /** Intro cinematic: the biplane crosses the drop zone, the diver hasn't jumped yet. */
  PlaneApproach = 'plane',
  /** Accelerating in free fall, weak wind, high terminal velocity. */
  Freefall = 'freefall',
  /** Canopy opening: line stretch + inflation, descent bleeding off, weak steering. */
  Deploying = 'deploying',
  /** Parachute open: slow descent, strong wind drift, more steering authority. */
  Canopy = 'canopy',
  /** Touched down safely on/near the target. */
  Landed = 'landed',
  /** Touched down too fast (never deployed, deployed too low, or stalled into the ground). */
  Crashed = 'crashed',
  /** Bonus round: a free fall through a cloud layer, flying through scoring rings (no canopy, no crash). */
  CloudDive = 'clouds',
  /** The cloud bonus round reached the bottom: tallied and safe (its terminal state). */
  CloudDone = 'cloudsDone',
}

/** One frame of player intent, produced by the input layer. */
export interface InputState {
  /** -1 (left) .. 1 (right). */
  steerX: number;
  /** -1 (up/north) .. 1 (down/south). In free fall this drives pitch, not direct movement. */
  steerY: number;
  /** True for exactly one frame when the deploy key is pressed (edge-triggered). */
  deployPressed: boolean;
  /** True for exactly one frame when a skip key is pressed (edge-triggered, Space or Enter). */
  skipPressed: boolean;
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
  /** Seconds the plane-approach intro lasts; <= 0 starts directly in free fall. */
  introDuration: number;
  /** Seconds the canopy takes to open (line stretch + inflation). */
  deployDuration: number;
  /** Seconds the landed/crashed outro plays before the result is surfaced. */
  outroDuration: number;
  /** 1/s smoothing rate of pitch toward the stick (free fall). */
  pitchRate: number;
  /** m/s added to freefall terminal velocity at full forward track (pitch = +1). */
  trackTerminalBoost: number;
  /** m/s removed from freefall terminal velocity at full arch (pitch = -1). */
  archTerminalDrop: number;
  /** Horizontal drive toward -Y at full track (m/s²). */
  trackAccel: number;
  /** Weak drift toward +Y at full arch (m/s²). */
  backslideAccel: number;
  /** Fraction of lateral authority lost at full arch (0..1). */
  archSteerPenalty: number;
  /** Fraction of canopy steering available while the chute is opening (0..1). */
  deploySteerFactor: number;
  /** Difficulty score multiplier applied to the whole jump (rookie 1, harder > 1). */
  scoreMultiplier: number;

  // --- Cloud bonus round ("dive through the cloud rings") ---
  /** Exit altitude for the cloud bonus dive (metres). */
  cloudStartAltitude: number;
  /** Terminal descent speed during the cloud dive (m/s) — slower than free fall so rings are catchable. */
  cloudTerminal: number;
  /** Number of scoring rings spread down the cloud dive. */
  cloudRingCount: number;
  /** Radius of each cloud ring (metres) — smaller is harder. */
  cloudRingRadius: number;
  /** Max horizontal offset of a ring's centre from the dive line (metres). */
  cloudRingSpread: number;
  /** Points for flying through a ring (scaled by how centred the pass was). */
  cloudRingPoints: number;
  /** Flat bonus for clearing every ring in the dive. */
  cloudClearBonus: number;
}

/**
 * Itemised score for a safe, on-target landing. Every field is a point value so
 * the arcade result screen can tally them line by line. All zero on a miss.
 */
export interface ScoreBreakdown {
  /** Accuracy points from proximity to the centre (the bulk of the score). */
  proximity: number;
  /** Bonus for a longer free fall (rewards a bold, late deploy). */
  freefall: number;
  /** Bonus for a gentle touchdown (lower descent speed = more points). */
  softLanding: number;
  /** Flat bonus for hitting the inner bullseye. */
  bullseye: number;
  /** Sum of the above, before the difficulty multiplier. */
  base: number;
  /** Difficulty multiplier applied to `base` (mirrors `GameConfig.scoreMultiplier`). */
  multiplier: number;
  /** Final awarded points: round(base * multiplier). */
  total: number;
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
  /** Itemised score, or null on a crash (nothing to tally). */
  breakdown: ScoreBreakdown | null;
}

/** One scoring hoop in the cloud bonus dive, sitting at a fixed altitude. */
export interface CloudRing {
  /** Altitude at which the ring must be crossed (metres). */
  altitude: number;
  /** Ground-plane centre of the ring (metres, relative to the dive line at 0,0). */
  x: number;
  y: number;
  /** Catch radius (metres). */
  radius: number;
  /** null until the diver falls through its altitude, then the pass verdict. */
  passed: boolean | null;
  /** How centred the pass was (0 at the rim, 1 dead-centre); 0 until resolved. */
  centered: number;
}

/** Outcome of the cloud bonus round — a pure additive bonus, never a crash. */
export interface CloudResult {
  /** Rings flown through. */
  ringsPassed: number;
  /** Rings in the dive. */
  ringsTotal: number;
  /** Bonus points awarded (after the difficulty multiplier). */
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
  /** Per-jump weather multiplier (0.4–1.4) applied to base wind and gusts. */
  windGustScale: number;
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
  /** Body pitch in free fall: -1 full arch (slow) .. +1 full forward track (fast). Smoothed. */
  pitch: number;
  /** Seconds left in the plane-approach intro (0 once falling). */
  introTimer: number;
  /** Seconds left until the canopy is fully open (0 outside Deploying). */
  deployTimer: number;
  /** Seconds left in the landed/crashed outro (0 until touchdown, then counts down). */
  outroTimer: number;
  /** Unit direction of the biplane's flight line (drives the intro cinematic). */
  planeDirX: number;
  planeDirY: number;
  /** 32-bit seed for the deterministic ground decoration of this jump. */
  groundSeed: number;
  /** Set once the jump resolves. */
  result: JumpResult | null;
  /** Scoring rings for the cloud bonus dive (empty for ordinary jumps). */
  rings: CloudRing[];
  /** Rings flown through so far in the cloud dive. */
  ringsPassed: number;
  /** Set once the cloud dive resolves (null for ordinary jumps). */
  cloudResult: CloudResult | null;
}

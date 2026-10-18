/**
 * Sky Diver simulation types — pure data, no Angular / DOM / rAF dependency.
 * The whole engine is built around these so the physics stays deterministic
 * and unit-testable, and the camera can change without touching it.
 *
 * World frame: metres on the ground plane, the bullseye centre at (0, 0), +x
 * east and +y south (screen-down on a map). Headings are radians clockwise
 * from north: forward = (sin h, -cos h), right = (cos h, sin h).
 */

/** Phases of a single jump. */
export enum Phase {
  /** Riding the jump ship along its run: the player picks the exit moment. */
  Plane = 'plane',
  /** Belly-to-earth: heading + track/arch, the hoops are in this column. */
  Freefall = 'freefall',
  /** Canopy opening: line stretch + inflation, descent bleeding off. */
  Deploying = 'deploying',
  /** Flying the canopy: forward airspeed, turns, brakes/risers, flare. */
  Canopy = 'canopy',
  /** Touched down in one piece (see `JumpResult.landing`). */
  Landed = 'landed',
  /** Hit the ground too fast (never pulled, pulled too low, stalled high). */
  Crashed = 'crashed',
}

/** One frame of player intent, produced by the input layer. */
export interface InputState {
  /** -1 (turn left) .. 1 (turn right). */
  turn: number;
  /** -1 (↓ arch / brakes) .. 1 (↑ track / front risers). */
  drive: number;
  /** True for exactly one frame on the context key (Space/Enter): jump → pull → flare. */
  action: boolean;
}

/** How a touchdown was judged, best to worst. */
export type LandingQuality = 'standup' | 'slide' | 'tumble' | 'crash';

/** Exit timing verdict from the spotting light. */
export type SpotLight = 'green' | 'amber' | 'red';

/** The place a jump happens: drives how the countryside is laid out. */
export type Venue = 'county' | 'seaside' | 'lake' | 'airfield' | 'meeting';

/** All tunable constants for a jump. Grouped so difficulty just swaps a few. */
export interface GameConfig {
  // --- Jump run (spotting) ---
  /** Exit altitude (metres). */
  exitAltitude: number;
  /** Jump-ship ground speed along its run (m/s). */
  planeSpeed: number;
  /** Seconds from the start of the run to the ideal exit point. */
  spotLeadTime: number;
  /** Seconds the run continues past the ideal point before the pilot tips you out. */
  spotOvertime: number;
  /** Along-track distance from the ideal point that still shows the green light (m). */
  spotWindow: number;
  /** Max sideways offset of the run line from the target's upwind point (m). */
  planeLateral: number;
  /** The ideal exit point sits this many seconds of wind drift upwind of the target. */
  spotUpwindTime: number;

  // --- Free fall ---
  /** Rate (1/s·m/s) at which descent speed approaches its terminal velocity. */
  gravity: number;
  /** Neutral belly-to-earth terminal velocity (m/s). */
  freefallTerminal: number;
  /** m/s added to terminal at full track. */
  trackTerminalBoost: number;
  /** m/s removed from terminal at full arch. */
  archTerminalDrop: number;
  /** Forward speed relative to the air at full track (m/s). */
  trackSpeed: number;
  /** Backward drift relative to the air at full arch (m/s). */
  archBackslide: number;
  /** Max turn rate in free fall (rad/s). */
  freefallTurnRate: number;
  /** 1/s rate at which body pitch follows the stick. */
  pitchRate: number;
  /** 1/s rate at which air-relative velocity follows its target in free fall. */
  freefallDrag: number;

  // --- Opening ---
  /** Seconds the canopy takes to open (line stretch + inflation). */
  deployDuration: number;
  /** Below this altitude a pull earns no pull bonus (and is usually fatal). */
  hardDeck: number;
  /** Pulls at or above this altitude earn no pull bonus; it peaks at the hard deck. */
  pullCeiling: number;

  // --- Canopy ---
  /** Neutral forward airspeed (m/s). */
  canopyAirspeed: number;
  /** Forward airspeed at full brakes (m/s). */
  brakeAirspeed: number;
  /** Forward airspeed on full front risers (m/s). */
  riserAirspeed: number;
  /** Neutral descent rate (m/s). */
  canopyDescent: number;
  /** Descent rate at full brakes (m/s). */
  brakeDescent: number;
  /** Descent rate on full front risers (m/s). */
  riserDescent: number;
  /** Extra descent at the full turn rate — a spiral dumps altitude (m/s). */
  spiralDescent: number;
  /** Max canopy turn rate (rad/s). */
  canopyTurnRate: number;
  /** 1/s rate at which turn rate follows the toggles (both free fall and canopy). */
  turnResponse: number;
  /** 1/s rate at which the canopy's track follows its heading and trim (higher = nimbler). */
  canopyResponse: number;
  /** Seconds the flare holds the canopy flat before it runs out of energy. */
  flareDuration: number;
  /** Seconds the canopy stays stalled after a spent flare, then re-inflates. */
  stallDuration: number;
  /** Descent rate at the peak of a flare (m/s). */
  flareDescent: number;
  /** Forward airspeed at the peak of a flare (m/s). */
  flareAirspeed: number;
  /** Descent rate while stalled (m/s). */
  stallDescent: number;

  // --- Touchdown judging ---
  /** Descent above which a touchdown is a crash (m/s). */
  crashSpeed: number;
  /** Max descent for a stand-up landing (m/s). */
  standupDescent: number;
  /** Max ground speed for a stand-up landing (m/s). */
  standupGroundSpeed: number;
  /** Max descent for a slide-in (beyond it, a tumble) (m/s). */
  slideDescent: number;

  // --- Weather & target ---
  /** Base wind magnitude (m/s); each jump scales it by its own weather draw. */
  windBase: number;
  /** Amplitude of the deterministic gust wander (m/s). */
  windGust: number;
  /** Outer radius of the scoring target (m). */
  targetRadius: number;
  /** Dead-centre radius (max accuracy) (m). */
  bullseyeRadius: number;

  // --- Hoops (free fall) ---
  /** Hoops per jump (0 disables them). */
  ringCount: number;
  /** Catch radius of a hoop (m). */
  ringRadius: number;
  /** Random sideways jitter of each hoop off the guide line (m). */
  ringJitter: number;

  // --- World ---
  /** Which venue's countryside to lay out around the target. */
  venue: Venue;
  /** A moving target (a hay wagon on the road): ground speed (m/s); 0 = fixed bullseye. */
  targetSpeed: number;
  /** Heading the moving target drives along (rad, clockwise from north). */
  targetHeading: number;

  // --- Cinematics & scoring ---
  /** Seconds the landed/crashed outro plays before the result is surfaced. */
  outroDuration: number;
  /** Difficulty multiplier applied to the whole jump score. */
  scoreMultiplier: number;
}

/** One hoop in the free-fall column, flown through by crossing its altitude inside it. */
export interface Ring {
  altitude: number;
  x: number;
  y: number;
  radius: number;
  /** null until the diver falls through its altitude, then the verdict. */
  passed: boolean | null;
  /** How centred the pass was (0 rim … 1 dead centre); 0 until resolved. */
  centered: number;
}

/** Itemised jump score, tallied line by line on the result card. */
export interface ScoreBreakdown {
  /** Proximity to the bullseye (0 off the target). */
  accuracy: number;
  /** Hoops flown through (scaled by centring) plus the clean-sweep bonus. */
  rings: number;
  /** Late-pull bonus: peaks at the hard deck, nothing below it. */
  pull: number;
  /** Touchdown quality bonus. */
  landing: number;
  /** Exit timing bonus (green light). */
  spot: number;
  /** Sum before the difficulty multiplier. */
  base: number;
  multiplier: number;
  /** round(base × multiplier). */
  total: number;
}

/** Outcome of a resolved jump. */
export interface JumpResult {
  /** Distance from the bullseye centre at touchdown (m). */
  landedDistance: number;
  /** Descent speed at touchdown (m/s). */
  landingSpeed: number;
  /** Horizontal ground speed at touchdown (m/s). */
  groundSpeed: number;
  landing: LandingQuality;
  crashed: boolean;
  bullseye: boolean;
  /** Altitude of the pull, or null if the chute never came out. */
  pullAltitude: number | null;
  ringsPassed: number;
  ringsTotal: number;
  spot: SpotLight;
  /** Seconds spent in free fall. */
  freefallTime: number;
  score: number;
  /** Itemised score, or null on a crash (nothing to tally). */
  breakdown: ScoreBreakdown | null;
}

/** Full simulation state. `integrate` returns a fresh copy each step. */
export interface GameState {
  phase: Phase;
  /** Seconds since the jump run started. */
  elapsed: number;

  // --- Jump run ---
  /** Seconds into the run (drives the plane along its line). */
  planeTime: number;
  /** Start of the run line and its heading. */
  planeStartX: number;
  planeStartY: number;
  planeHeading: number;
  /** Ideal exit point on the run line. */
  spotX: number;
  spotY: number;
  /** Verdict of the actual exit (red until the player jumps). */
  spot: SpotLight;

  // --- Diver ---
  altitude: number;
  /** Downward speed (m/s, >= 0). */
  descentSpeed: number;
  posX: number;
  posY: number;
  /** Ground velocity (m/s). */
  velX: number;
  velY: number;
  /** Heading (rad, clockwise from north). */
  heading: number;
  /** Smoothed turn rate (rad/s). */
  turnRate: number;
  /** Free-fall body pitch: -1 full arch … +1 full track. Smoothed. */
  pitch: number;
  /** Canopy trim: -1 full brakes … +1 full front risers. Smoothed. */
  trim: number;

  // --- Weather ---
  windBaseX: number;
  windBaseY: number;
  /** Per-jump weather multiplier applied to base wind and gusts. */
  windScale: number;
  /** Current wind including the gust wander. */
  windX: number;
  windY: number;

  // --- Timers & milestones ---
  freefallTime: number;
  /** Seconds left until the canopy is fully open (0 outside Deploying). */
  deployTimer: number;
  /** Altitude of the pull (null until pulled). */
  pullAltitude: number | null;
  /** Seconds since the canopy finished opening. */
  canopyTime: number;
  /** Seconds into the current flare/stall cycle (0 = not flaring). */
  flareTime: number;
  /** Seconds left in the landed/crashed outro. */
  outroTimer: number;

  // --- Hoops ---
  rings: Ring[];
  ringsPassed: number;

  /** 32-bit seed for the deterministic ground decoration of this jump. */
  groundSeed: number;
  /** Set once the jump resolves. */
  result: JumpResult | null;
}

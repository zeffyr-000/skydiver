import type {
  CloudResult,
  CloudRing,
  GameConfig,
  GameState,
  InputState,
  JumpResult,
  ScoreBreakdown,
} from './types';
import { Phase } from './types';

// --- Scoring weights (points). Proximity is the bulk; the others are seasoning. ---
/** Max accuracy points, awarded anywhere inside the bullseye. */
const PROXIMITY_MAX = 1000;
/** Accuracy floor at the very edge of the target (before it drops to 0 outside). */
const PROXIMITY_MIN = 100;
/** Points per second of free fall — rewards bold, late deploys. */
const FREEFALL_POINTS_PER_SEC = 15;
/** Caps the free-fall bonus so a sky-high exit can't dwarf accuracy. */
const FREEFALL_BONUS_CAP = 450;
/** Max bonus for a feather-soft touchdown (descent speed → 0). */
const SOFT_LANDING_MAX = 250;
/** Flat bonus for landing inside the inner bullseye. */
const BULLSEYE_BONUS = 500;

// Gust wander frequencies (rad/s). Two different primes keep the wind from
// tracing a simple circle, and being a pure function of `elapsed` keeps the
// whole simulation deterministic for tests.
const GUST_FREQ_X = 0.7;
const GUST_FREQ_Y = 0.5;

// In the cloud dive, pitch nudges the descent speed by ±this (m/s) around
// `cloudTerminal`: arching buys a little more time to line up a ring, tracking
// rushes it. Mild on purpose — lateral steering, not speed, is the skill here.
const CLOUD_PITCH_TERMINAL = 10;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Build a fresh jump. `rng` is injectable so tests can seed it. */
export function createInitialState(cfg: GameConfig, rng: () => number = Math.random): GameState {
  const windDir = rng() * Math.PI * 2;

  const spreadDir = rng() * Math.PI * 2;
  const spreadMag = (0.4 + 0.6 * rng()) * cfg.startSpread;

  // New draws are APPENDED after the three above: fixed-seed tests must keep
  // producing the same wind direction and spawn position as before.
  const planeDir = rng() * Math.PI * 2;
  const groundSeed = Math.floor(rng() * 0xffffffff) >>> 0;
  // Per-jump weather: 40%–140% of the difficulty's base wind and gusts, so
  // the same setting deals calm mornings and rough days.
  const windScale = 0.4 + rng();
  const windBaseX = Math.cos(windDir) * cfg.windBase * windScale;
  const windBaseY = Math.sin(windDir) * cfg.windBase * windScale;

  return {
    phase: cfg.introDuration > 0 ? Phase.PlaneApproach : Phase.Freefall,
    altitude: cfg.startAltitude,
    descentSpeed: 0,
    posX: Math.cos(spreadDir) * spreadMag,
    posY: Math.sin(spreadDir) * spreadMag,
    velX: 0,
    velY: 0,
    windBaseX,
    windBaseY,
    windGustScale: windScale,
    windX: windBaseX,
    windY: windBaseY,
    flareAmount: 0,
    stalled: false,
    stallTimer: 0,
    elapsed: 0,
    freefallTime: 0,
    pitch: 0,
    introTimer: Math.max(0, cfg.introDuration),
    deployTimer: 0,
    outroTimer: 0,
    planeDirX: Math.cos(planeDir),
    planeDirY: Math.sin(planeDir),
    groundSeed,
    result: null,
    rings: [],
    ringsPassed: 0,
    cloudResult: null,
  };
}

/**
 * Build the cloud bonus dive: a free fall through a slalom of scoring hoops, no
 * canopy and no crash — purely additive points. Its own rng draws keep it
 * independent of `createInitialState` (whose draw order is frozen by a test).
 */
export function createCloudDive(cfg: GameConfig, rng: () => number = Math.random): GameState {
  const windDir = rng() * Math.PI * 2;
  const windScale = 0.4 + rng();
  const windBaseX = Math.cos(windDir) * cfg.windBase * windScale;
  const windBaseY = Math.sin(windDir) * cfg.windBase * windScale;
  const groundSeed = Math.floor(rng() * 0xffffffff) >>> 0;

  // Hoops descend as a catchable random walk: each one steps from the last by at
  // most `cloudRingSpread / count` and stays within `cloudRingSpread` of the
  // dive line — small enough to reach before the next altitude band arrives.
  const count = Math.max(1, Math.floor(cfg.cloudRingCount));
  const top = cfg.cloudStartAltitude * 0.85;
  const bottom = cfg.cloudStartAltitude * 0.12;
  const stepMax = cfg.cloudRingSpread / count;
  const rings: CloudRing[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      x += (rng() * 2 - 1) * stepMax;
      y += (rng() * 2 - 1) * stepMax;
      const mag = Math.hypot(x, y);
      if (mag > cfg.cloudRingSpread) {
        x *= cfg.cloudRingSpread / mag;
        y *= cfg.cloudRingSpread / mag;
      }
    }
    const t = count === 1 ? 0 : i / (count - 1);
    rings.push({
      altitude: top + (bottom - top) * t,
      x,
      y,
      radius: cfg.cloudRingRadius,
      passed: null,
      centered: 0,
    });
  }

  return {
    phase: Phase.CloudDive,
    altitude: cfg.cloudStartAltitude,
    descentSpeed: 0,
    posX: 0,
    posY: 0,
    velX: 0,
    velY: 0,
    windBaseX,
    windBaseY,
    windGustScale: windScale,
    windX: windBaseX,
    windY: windBaseY,
    flareAmount: 0,
    stalled: false,
    stallTimer: 0,
    elapsed: 0,
    freefallTime: 0,
    pitch: 0,
    introTimer: 0,
    deployTimer: 0,
    outroTimer: 0,
    planeDirX: 1,
    planeDirY: 0,
    groundSeed,
    result: null,
    rings,
    ringsPassed: 0,
    cloudResult: null,
  };
}

/**
 * Advance the simulation by `dt` seconds. Pure: returns a new state, never
 * mutates the input. Order: intro → deploy/opening → pitch → flare/stall →
 * vertical → wind → horizontal (with inertia) → landing → outro.
 */
export function integrate(s: GameState, input: InputState, dt: number, cfg: GameConfig): GameState {
  // --- Resolved: only the outro timer ticks, everything else is frozen ---
  if (s.phase === Phase.Landed || s.phase === Phase.Crashed || s.phase === Phase.CloudDone) {
    if (s.outroTimer <= 0) {
      return s;
    }
    const n: GameState = { ...s };
    n.elapsed += dt;
    n.outroTimer = input.skipPressed ? 0 : Math.max(0, n.outroTimer - dt);
    return n;
  }

  const n: GameState = { ...s };
  n.elapsed += dt;

  // --- Intro: riding the plane; no physics until the diver exits ---
  if (n.phase === Phase.PlaneApproach) {
    n.introTimer -= dt;
    if (input.skipPressed || input.deployPressed) {
      n.introTimer = 0;
      // Jump the clock to the scripted exit time so the plane's path (a pure
      // function of `elapsed`) and the gust phase stay continuous.
      n.elapsed = cfg.introDuration;
    }
    if (n.introTimer <= 0) {
      n.introTimer = 0;
      n.phase = Phase.Freefall;
    }
    return n;
  }

  // --- Deploy (edge-triggered) → opening countdown ---
  if (n.phase === Phase.Freefall) {
    n.freefallTime += dt;
    if (input.deployPressed) {
      n.phase = Phase.Deploying;
      n.deployTimer = cfg.deployDuration;
    }
  }
  if (n.phase === Phase.Deploying) {
    n.deployTimer = Math.max(0, n.deployTimer - dt);
    if (n.deployTimer <= 0) {
      n.phase = Phase.Canopy;
    }
  }

  const inFreefall = n.phase === Phase.Freefall;
  const deploying = n.phase === Phase.Deploying;
  const underCanopy = n.phase === Phase.Canopy;
  const cloudDiving = n.phase === Phase.CloudDive;
  // Belly-to-earth with no canopy out: ordinary free fall OR the cloud dive.
  // Both use the pitch model and free-fall steering, so they share a flag.
  const bellyFall = inFreefall || cloudDiving;
  // Opening progress: 0 just after the pull → 1 fully inflated.
  const openP = deploying ? 1 - n.deployTimer / Math.max(cfg.deployDuration, 1e-9) : 0;

  // --- Pitch: follows the stick in free fall, relaxes to neutral elsewhere ---
  const pitchTarget = bellyFall ? clamp(-input.steerY, -1, 1) : 0;
  n.pitch += (pitchTarget - n.pitch) * Math.min(1, dt * cfg.pitchRate);

  // --- Flare smoothing + stall (canopy only) ---
  if (underCanopy) {
    n.flareAmount += (input.flare - n.flareAmount) * Math.min(1, dt * 6);
    if (!n.stalled && n.flareAmount > cfg.stallThreshold) {
      n.stalled = true;
      n.stallTimer = cfg.stallDuration;
    }
    if (n.stalled) {
      n.stallTimer -= dt;
      if (n.stallTimer <= 0) {
        n.stalled = false;
        n.flareAmount = 0;
      }
    }
  }

  // --- Vertical: ease descent speed toward the phase terminal velocity ---
  let terminal: number;
  if (inFreefall) {
    // Tracking dives faster, arching flattens out and buys time.
    terminal =
      cfg.freefallTerminal +
      (n.pitch > 0 ? n.pitch * cfg.trackTerminalBoost : n.pitch * cfg.archTerminalDrop);
  } else if (cloudDiving) {
    // Slower than free fall (rings stay catchable); pitch nudges it mildly.
    terminal = cfg.cloudTerminal + n.pitch * CLOUD_PITCH_TERMINAL;
  } else if (deploying) {
    // Snivel: barely brakes at line stretch, bites hard as the canopy inflates.
    terminal = lerp(cfg.freefallTerminal, cfg.canopyTerminal, openP * openP);
  } else if (n.stalled) {
    terminal = cfg.freefallTerminal * 0.6; // canopy collapsed → falling again
  } else {
    terminal = Math.max(1, cfg.canopyTerminal - n.flareAmount * cfg.flareSlowdown);
  }
  const approach = Math.min(1, (cfg.gravity / Math.max(terminal, 1)) * dt);
  n.descentSpeed += (terminal - n.descentSpeed) * approach;
  n.altitude = Math.max(0, n.altitude - n.descentSpeed * dt);

  // --- Wind: deterministic gust around the steady base vector, both scaled
  // by the jump's weather draw ---
  n.windX = n.windBaseX + Math.sin(n.elapsed * GUST_FREQ_X) * cfg.windGust * n.windGustScale;
  n.windY = n.windBaseY + Math.cos(n.elapsed * GUST_FREQ_Y) * cfg.windGust * n.windGustScale;
  // Effective air velocity: the canopy catches much more wind than a falling
  // body, and an opening canopy catches progressively more.
  const windFactor = underCanopy
    ? cfg.windCanopyFactor
    : deploying
      ? lerp(cfg.windFreefallFactor, cfg.windCanopyFactor, openP)
      : cfg.windFreefallFactor;
  const airX = n.windX * windFactor;
  const airY = n.windY * windFactor;

  // --- Horizontal: drag acts on velocity RELATIVE TO THE AIR ---
  // With no input the diver relaxes toward the air's velocity (drifts with the
  // wind). Steering builds relative velocity that bleeds off when released →
  // momentum/inertia, never an instant stop.
  let relX = n.velX - airX;
  let relY = n.velY - airY;
  if (!n.stalled) {
    if (bellyFall) {
      // Up/down is pitch, not direct Y drive: tracking pushes hard toward -Y,
      // arching backslides weakly toward +Y and costs lateral authority.
      const lateral = cfg.steerAccelFreefall * (1 - Math.max(0, -n.pitch) * cfg.archSteerPenalty);
      relX += input.steerX * lateral * dt;
      relY += -n.pitch * (n.pitch > 0 ? cfg.trackAccel : cfg.backslideAccel) * dt;
    } else {
      const steerAccel = cfg.steerAccelCanopy * (deploying ? cfg.deploySteerFactor : 1);
      relX += input.steerX * steerAccel * dt;
      relY += input.steerY * steerAccel * dt;
    }
  }
  const drag = Math.pow(cfg.damping, dt);
  relX *= drag;
  relY *= drag;
  n.velX = airX + relX;
  n.velY = airY + relY;
  n.posX += n.velX * dt;
  n.posY += n.velY * dt;

  // --- Cloud dive: resolve any ring whose altitude we just dropped through,
  // then bottom out safely (never a crash) ---
  if (cloudDiving) {
    if (n.rings.length > 0) {
      let passed = n.ringsPassed;
      // Fresh array + objects so the pure-function contract holds (no mutating
      // the caller's state). Unresolved rings keep their reference (immutable).
      n.rings = n.rings.map((ring) => {
        if (ring.passed === null && n.altitude <= ring.altitude) {
          const dist = Math.hypot(n.posX - ring.x, n.posY - ring.y);
          const hit = dist <= ring.radius;
          if (hit) {
            passed += 1;
          }
          return { ...ring, passed: hit, centered: hit ? clamp(1 - dist / ring.radius, 0, 1) : 0 };
        }
        return ring;
      });
      n.ringsPassed = passed;
    }
    if (n.altitude <= 0) {
      n.phase = Phase.CloudDone;
      n.cloudResult = scoreCloudRound(n, cfg);
      n.outroTimer = Math.max(0, cfg.outroDuration);
    }
    return n;
  }

  // --- Landing ---
  if (n.altitude <= 0) {
    // A Deploying touchdown isn't special-cased: the canopy simply hasn't bled
    // enough speed yet, so the safe-landing check crashes it naturally.
    const crashed = n.phase === Phase.Freefall || n.descentSpeed > cfg.safeLandingSpeed;
    n.phase = crashed ? Phase.Crashed : Phase.Landed;
    n.result = resolveLanding(n, cfg, crashed);
    n.outroTimer = Math.max(0, cfg.outroDuration);
    n.deployTimer = 0;
  }

  return n;
}

/** Resolve a touchdown into a scored result. */
export function resolveLanding(s: GameState, cfg: GameConfig, crashed: boolean): JumpResult {
  const landedDistance = Math.hypot(s.posX, s.posY);
  const bullseye = !crashed && landedDistance <= cfg.bullseyeRadius;
  const breakdown = crashed ? null : scoreJump(landedDistance, s.freefallTime, s.descentSpeed, cfg);
  return {
    landedDistance,
    freefallTime: s.freefallTime,
    landingSpeed: s.descentSpeed,
    crashed,
    bullseye,
    score: breakdown?.total ?? 0,
    breakdown,
  };
}

/** All-zero breakdown for a miss (safe landing outside the target). */
function missBreakdown(cfg: GameConfig): ScoreBreakdown {
  return {
    proximity: 0,
    freefall: 0,
    softLanding: 0,
    bullseye: 0,
    base: 0,
    multiplier: cfg.scoreMultiplier,
    total: 0,
  };
}

/**
 * Itemise a safe landing into its scoring parts so the result screen can tally
 * them. Proximity to the centre (max {@link PROXIMITY_MAX}) is the bulk, plus a
 * bonus for a longer free fall (a later, bolder deploy), a bonus for a gentle
 * touchdown, and a flat bullseye bonus — the whole sum then scaled by the
 * difficulty multiplier. A landing outside the target scores nothing.
 */
export function scoreJump(
  distance: number,
  freefallTime: number,
  landingSpeed: number,
  cfg: GameConfig,
): ScoreBreakdown {
  if (distance > cfg.targetRadius) {
    return missBreakdown(cfg);
  }
  const inBullseye = distance <= cfg.bullseyeRadius;

  let proximity: number;
  if (inBullseye) {
    proximity = PROXIMITY_MAX;
  } else {
    const t = (distance - cfg.bullseyeRadius) / (cfg.targetRadius - cfg.bullseyeRadius); // 0..1
    proximity = Math.round(PROXIMITY_MIN + (PROXIMITY_MAX - PROXIMITY_MIN) * (1 - t));
  }

  const freefall = Math.min(FREEFALL_BONUS_CAP, Math.round(freefallTime * FREEFALL_POINTS_PER_SEC));
  // Reward a soft touchdown: full bonus at a standstill, none at the crash limit.
  const softness = clamp(1 - landingSpeed / cfg.safeLandingSpeed, 0, 1);
  const softLanding = Math.round(SOFT_LANDING_MAX * softness);
  const bullseye = inBullseye ? BULLSEYE_BONUS : 0;

  const base = proximity + freefall + softLanding + bullseye;
  const total = Math.round(base * cfg.scoreMultiplier);
  return {
    proximity,
    freefall,
    softLanding,
    bullseye,
    base,
    multiplier: cfg.scoreMultiplier,
    total,
  };
}

/**
 * Tally the cloud bonus dive: each ring flown through pays `cloudRingPoints`
 * scaled by how centred the pass was (half for a rim-skim, full dead-centre),
 * plus a flat bonus for clearing them all — the whole sum then scaled by the
 * difficulty multiplier, like a jump.
 */
export function scoreCloudRound(s: GameState, cfg: GameConfig): CloudResult {
  let base = 0;
  let passed = 0;
  for (const ring of s.rings) {
    if (ring.passed) {
      base += cfg.cloudRingPoints * (0.5 + 0.5 * ring.centered);
      passed += 1;
    }
  }
  if (s.rings.length > 0 && passed === s.rings.length) {
    base += cfg.cloudClearBonus;
  }
  return {
    ringsPassed: passed,
    ringsTotal: s.rings.length,
    score: Math.round(base * cfg.scoreMultiplier),
  };
}

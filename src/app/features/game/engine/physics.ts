import type { GameConfig, GameState, InputState, JumpResult } from './types';
import { Phase } from './types';

// Gust wander frequencies (rad/s). Two different primes keep the wind from
// tracing a simple circle, and being a pure function of `elapsed` keeps the
// whole simulation deterministic for tests.
const GUST_FREQ_X = 0.7;
const GUST_FREQ_Y = 0.5;

/** Build a fresh jump. `rng` is injectable so tests can seed it. */
export function createInitialState(cfg: GameConfig, rng: () => number = Math.random): GameState {
  const windDir = rng() * Math.PI * 2;
  const windBaseX = Math.cos(windDir) * cfg.windBase;
  const windBaseY = Math.sin(windDir) * cfg.windBase;

  const spreadDir = rng() * Math.PI * 2;
  const spreadMag = (0.4 + 0.6 * rng()) * cfg.startSpread;

  return {
    phase: Phase.Freefall,
    altitude: cfg.startAltitude,
    descentSpeed: 0,
    posX: Math.cos(spreadDir) * spreadMag,
    posY: Math.sin(spreadDir) * spreadMag,
    velX: 0,
    velY: 0,
    windBaseX,
    windBaseY,
    windX: windBaseX,
    windY: windBaseY,
    flareAmount: 0,
    stalled: false,
    stallTimer: 0,
    elapsed: 0,
    freefallTime: 0,
    result: null,
  };
}

/**
 * Advance the simulation by `dt` seconds. Pure: returns a new state, never
 * mutates the input. Order: deploy → flare/stall → vertical → wind → horizontal
 * (with inertia) → landing.
 */
export function integrate(s: GameState, input: InputState, dt: number, cfg: GameConfig): GameState {
  if (s.phase === Phase.Landed || s.phase === Phase.Crashed) {
    return s;
  }

  const n: GameState = { ...s };
  n.elapsed += dt;

  // --- Deploy parachute (edge-triggered) ---
  if (n.phase === Phase.Freefall) {
    n.freefallTime += dt;
    if (input.deployPressed) {
      n.phase = Phase.Canopy;
    }
  }

  const underCanopy = n.phase === Phase.Canopy;

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
  if (!underCanopy) {
    terminal = cfg.freefallTerminal;
  } else if (n.stalled) {
    terminal = cfg.freefallTerminal * 0.6; // canopy collapsed → falling again
  } else {
    terminal = Math.max(1, cfg.canopyTerminal - n.flareAmount * cfg.flareSlowdown);
  }
  const approach = Math.min(1, (cfg.gravity / Math.max(terminal, 1)) * dt);
  n.descentSpeed += (terminal - n.descentSpeed) * approach;
  n.altitude = Math.max(0, n.altitude - n.descentSpeed * dt);

  // --- Wind: deterministic gust around the steady base vector ---
  n.windX = n.windBaseX + Math.sin(n.elapsed * GUST_FREQ_X) * cfg.windGust;
  n.windY = n.windBaseY + Math.cos(n.elapsed * GUST_FREQ_Y) * cfg.windGust;
  // Effective air velocity: the canopy catches much more wind than a falling body.
  const windFactor = underCanopy ? cfg.windCanopyFactor : cfg.windFreefallFactor;
  const airX = n.windX * windFactor;
  const airY = n.windY * windFactor;

  // --- Horizontal: drag acts on velocity RELATIVE TO THE AIR ---
  // With no input the diver relaxes toward the air's velocity (drifts with the
  // wind). Steering builds relative velocity that bleeds off when released →
  // momentum/inertia, never an instant stop.
  let relX = n.velX - airX;
  let relY = n.velY - airY;
  if (!n.stalled) {
    const steerAccel = underCanopy ? cfg.steerAccelCanopy : cfg.steerAccelFreefall;
    relX += input.steerX * steerAccel * dt;
    relY += input.steerY * steerAccel * dt;
  }
  const drag = Math.pow(cfg.damping, dt);
  relX *= drag;
  relY *= drag;
  n.velX = airX + relX;
  n.velY = airY + relY;
  n.posX += n.velX * dt;
  n.posY += n.velY * dt;

  // --- Landing ---
  if (n.altitude <= 0) {
    const crashed = n.phase === Phase.Freefall || n.descentSpeed > cfg.safeLandingSpeed;
    n.phase = crashed ? Phase.Crashed : Phase.Landed;
    n.result = resolveLanding(n, cfg, crashed);
  }

  return n;
}

/** Resolve a touchdown into a scored result. */
export function resolveLanding(s: GameState, cfg: GameConfig, crashed: boolean): JumpResult {
  const landedDistance = Math.hypot(s.posX, s.posY);
  const bullseye = !crashed && landedDistance <= cfg.bullseyeRadius;
  return {
    landedDistance,
    freefallTime: s.freefallTime,
    landingSpeed: s.descentSpeed,
    crashed,
    bullseye,
    score: crashed ? 0 : computeScore(landedDistance, s.freefallTime, cfg),
  };
}

/**
 * Score a safe landing: proximity to the centre (max 1000) is the bulk, with a
 * small bonus for a longer free fall (later deploy) and a bullseye bonus.
 * Returns 0 for a landing outside the target.
 */
export function computeScore(distance: number, freefallTime: number, cfg: GameConfig): number {
  if (distance > cfg.targetRadius) {
    return 0;
  }
  let proximity: number;
  if (distance <= cfg.bullseyeRadius) {
    proximity = 1000;
  } else {
    const t = (distance - cfg.bullseyeRadius) / (cfg.targetRadius - cfg.bullseyeRadius); // 0..1
    proximity = Math.round(100 + 900 * (1 - t));
  }
  const freefallBonus = Math.round(freefallTime * 10);
  const bullseyeBonus = distance <= cfg.bullseyeRadius ? 500 : 0;
  return proximity + freefallBonus + bullseyeBonus;
}

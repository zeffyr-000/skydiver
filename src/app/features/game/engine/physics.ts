import type {
  GameConfig,
  GameState,
  InputState,
  JumpResult,
  LandingQuality,
  Ring,
  ScoreBreakdown,
  SpotLight,
} from './types';
import { Phase } from './types';

// --- Scoring weights (points). Accuracy is the bulk; every phase adds its share. ---
/** Max accuracy points, awarded anywhere inside the bullseye. */
const ACCURACY_MAX = 1000;
/** Accuracy at the very edge of the target (0 outside it). */
const ACCURACY_MIN = 100;
/** Points for a hoop flown dead centre (half at the rim). */
const RING_POINTS = 150;
/** Bonus for flying every hoop of the jump. */
const RING_SWEEP_BONUS = 300;
/** Pull bonus at the hard deck (falls off linearly to 0 at the pull ceiling). */
const PULL_MAX = 300;
const LANDING_POINTS: Record<LandingQuality, number> = {
  standup: 400,
  slide: 180,
  tumble: 40,
  crash: 0,
};
const SPOT_POINTS: Record<SpotLight, number> = { green: 150, amber: 50, red: 0 };
/** Double drop: a flat bonus for cutting away and opening the second canopy… */
const DOUBLE_DROP_POINTS = 400;
/** …plus this much per second of re-fall before the second pull… */
const REFALL_POINTS_PER_S = 40;
/** …up to this much (the crowd's thrill has its limits). */
const REFALL_MAX = 320;

/** Under canopy, the action key cuts away the first canopy down to this height, then flares (m). */
export const CUTAWAY_FLOOR = 80;

/** A balloon starts this far below its exit altitude and eases up to it (m)… */
const BALLOON_RISE = 180;
/** …with this time constant (s). */
const BALLOON_RISE_TIME = 5;
/** Lightened of its passenger, the balloon shoots up (m/s). */
export const BALLOON_LIFT = 4;

// Gust wander frequencies (rad/s): two different primes keep the wind from
// tracing a circle, and being a pure function of `elapsed` keeps it deterministic.
const GUST_FREQ_X = 0.7;
const GUST_FREQ_Y = 0.5;

/** Seconds for a flare to bite fully. */
const FLARE_RISE = 0.25;
/** 1/s rate at which canopy trim follows the stick. */
const TRIM_RATE = 4;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Unit forward vector for a heading (clockwise from north, +y is south). */
export function forwardOf(heading: number): { x: number; y: number } {
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

/**
 * Seconds into the run at which a moving target passes the drop-zone centre —
 * roughly when a jump lands, so the spot and the hoops still lead to it.
 */
export const TARGET_PASS_TIME = 52;

/** Where the target is at `elapsed` (the origin, unless it's a moving wagon). */
export function targetAt(cfg: GameConfig, elapsed: number): { x: number; y: number } {
  if (!cfg.targetSpeed) {
    return { x: 0, y: 0 };
  }
  const f = forwardOf(cfg.targetHeading);
  const d = cfg.targetSpeed * (elapsed - TARGET_PASS_TIME);
  return { x: f.x * d, y: f.y * d };
}

/** The jump ship's ground speed: the plane's own, or the wind's for a drifting balloon. */
export function shipSpeed(s: GameState, cfg: GameConfig): number {
  return cfg.jumpShip === 'balloon' ? Math.hypot(s.windBaseX, s.windBaseY) : cfg.planeSpeed;
}

/** A balloon's height `t` seconds into the act: it eases up to the exit altitude. */
export function balloonAltitude(cfg: GameConfig, t: number): number {
  // The rise never takes more than a fifth of the height (a short ?fast=1 run starts in the air).
  const rise = Math.min(BALLOON_RISE, cfg.exitAltitude * 0.2);
  return cfg.exitAltitude - rise * Math.exp(-t / BALLOON_RISE_TIME);
}

/** How high the jump ship is now (a balloon let go of its jumper climbs away). */
export function shipAltitude(s: GameState, cfg: GameConfig): number {
  if (cfg.jumpShip !== 'balloon') {
    return cfg.exitAltitude;
  }
  const atExit = balloonAltitude(cfg, s.planeTime);
  return s.phase === Phase.Plane ? atExit : atExit + BALLOON_LIFT * (s.elapsed - s.planeTime);
}

/** Under the first of two canopies and high enough: the action key cuts it away. */
export function canCutAway(s: GameState, cfg: GameConfig): boolean {
  return (
    s.phase === Phase.Canopy &&
    s.cutawayAt === null &&
    cfg.canopies > 1 &&
    s.altitude >= CUTAWAY_FLOOR &&
    s.flareTime <= 0
  );
}

function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

/**
 * Build a fresh jump. `rng` is injectable so tests can seed it.
 *
 * Draw order is a contract guarded by a fixed-seed spec — only ever APPEND new
 * draws: windDir, windScale, planeHeading, lateral, groundSeed, then the hoops.
 */
export function createJump(cfg: GameConfig, rng: () => number = Math.random): GameState {
  const windDir = rng() * Math.PI * 2;
  const windScale = 0.5 + 0.8 * rng();
  const runHeading = rng() * Math.PI * 2;
  const lateral = (rng() * 2 - 1) * cfg.planeLateral;
  const groundSeed = Math.floor(rng() * 0xffffffff) >>> 0;

  const windBaseX = Math.cos(windDir) * cfg.windBase * windScale;
  const windBaseY = Math.sin(windDir) * cfg.windBase * windScale;
  // A balloon has no run of its own: it drifts downwind at the wind's speed.
  const balloon = cfg.jumpShip === 'balloon';
  const planeHeading = balloon ? wrapAngle(windDir + Math.PI / 2) : runHeading;
  const speed = balloon ? Math.hypot(windBaseX, windBaseY) : cfg.planeSpeed;

  // The ideal exit sits upwind of the target (where a passive body would
  // drift onto it), shifted sideways by the run's offset: the line never
  // passes perfectly, so free fall always has positioning work to do.
  const f = forwardOf(planeHeading);
  const spotX = -windBaseX * cfg.spotUpwindTime + Math.cos(planeHeading) * lateral;
  const spotY = -windBaseY * cfg.spotUpwindTime + Math.sin(planeHeading) * lateral;
  const lead = speed * cfg.spotLeadTime;
  const planeStartX = spotX - f.x * lead;
  const planeStartY = spotY - f.y * lead;

  const rings = layRings(cfg, rng, spotX, spotY, f, speed, windBaseX, windBaseY);

  const s: GameState = {
    phase: Phase.Plane,
    elapsed: 0,
    planeTime: 0,
    planeStartX,
    planeStartY,
    planeHeading,
    spotX,
    spotY,
    spot: 'red',
    altitude: balloon ? balloonAltitude(cfg, 0) : cfg.exitAltitude,
    descentSpeed: 0,
    posX: planeStartX,
    posY: planeStartY,
    velX: f.x * speed,
    velY: f.y * speed,
    heading: planeHeading,
    turnRate: 0,
    pitch: 0,
    trim: 0,
    windBaseX,
    windBaseY,
    windScale,
    windX: windBaseX,
    windY: windBaseY,
    freefallTime: 0,
    deployTimer: 0,
    pullAltitude: null,
    canopyTime: 0,
    flareTime: 0,
    outroTimer: 0,
    cutawayAt: null,
    released: null,
    rings,
    ringsPassed: 0,
    groundSeed,
    result: null,
  };
  // A run with no lead time starts at the exit (e2e `?fast=1`).
  return cfg.spotLeadTime + cfg.spotOvertime <= 0 ? exitPlane(s, cfg) : s;
}

/**
 * Hoops descend the free-fall column from the exit toward the target: each one
 * follows the passive drift of the previous plus a step toward the target and
 * some jitter, capped to what a half-hearted track can cover between them —
 * so they're always catchable from a good exit and lead you home.
 */
function layRings(
  cfg: GameConfig,
  rng: () => number,
  spotX: number,
  spotY: number,
  f: { x: number; y: number },
  speed: number,
  windX: number,
  windY: number,
): Ring[] {
  const count = Math.max(0, Math.floor(cfg.ringCount));
  if (count === 0) {
    return [];
  }
  const top = cfg.exitAltitude - 130;
  const bottom = Math.max(cfg.pullCeiling + 40, cfg.hardDeck + 200);
  const gapAlt = count > 1 ? (top - bottom) / (count - 1) : 0;
  const gapTime = gapAlt / cfg.freefallTerminal;
  const maxStep = cfg.trackSpeed * gapTime * 0.5;

  // First hoop: where a passive diver lands after the exit throw (~4 s in).
  const throwCarry = speed / cfg.freefallDrag;
  let x = spotX + f.x * throwCarry * 0.8 + windX * 4;
  let y = spotY + f.y * throwCarry * 0.8 + windY * 4;
  const rings: Ring[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      x += windX * gapTime;
      y += windY * gapTime;
      const toT = Math.hypot(x, y);
      const step = Math.min(toT, maxStep * 0.7);
      let dx = toT > 0 ? (-x / toT) * step : 0;
      let dy = toT > 0 ? (-y / toT) * step : 0;
      const jitter = (rng() * 2 - 1) * cfg.ringJitter;
      const jAng = rng() * Math.PI * 2;
      dx += Math.cos(jAng) * jitter;
      dy += Math.sin(jAng) * jitter;
      const len = Math.hypot(dx, dy);
      if (len > maxStep) {
        dx *= maxStep / len;
        dy *= maxStep / len;
      }
      x += dx;
      y += dy;
    }
    rings.push({
      altitude: top - gapAlt * i,
      x,
      y,
      radius: cfg.ringRadius,
      passed: null,
      centered: 0,
    });
  }
  return rings;
}

/** Where the plane is along its run at time `t` (seconds into it). */
export function planePosition(s: GameState, cfg: GameConfig, t: number): { x: number; y: number } {
  const f = forwardOf(s.planeHeading);
  const speed = shipSpeed(s, cfg);
  return {
    x: s.planeStartX + f.x * speed * t,
    y: s.planeStartY + f.y * speed * t,
  };
}

/** The spotting light for the plane's current position (green = ideal exit). */
export function spotLightAt(s: GameState, cfg: GameConfig): SpotLight {
  const f = forwardOf(s.planeHeading);
  const along = (s.posX - s.spotX) * f.x + (s.posY - s.spotY) * f.y;
  const d = Math.abs(along);
  if (d <= cfg.spotWindow) {
    return 'green';
  }
  return d <= cfg.spotWindow * 2.5 ? 'amber' : 'red';
}

function exitPlane(s: GameState, cfg: GameConfig): GameState {
  return { ...s, phase: Phase.Freefall, spot: spotLightAt(s, cfg) };
}

/**
 * Advance the simulation by `dt` seconds. Pure: returns a new state, never
 * mutates the input.
 */
export function integrate(s: GameState, input: InputState, dt: number, cfg: GameConfig): GameState {
  // --- Resolved: only the outro timer ticks (skippable) ---
  if (s.phase === Phase.Landed || s.phase === Phase.Crashed) {
    if (s.outroTimer <= 0) {
      return s;
    }
    return {
      ...s,
      elapsed: s.elapsed + dt,
      outroTimer: input.action ? 0 : Math.max(0, s.outroTimer - dt),
    };
  }

  let n: GameState = { ...s, elapsed: s.elapsed + dt };
  n.windX = n.windBaseX + Math.sin(n.elapsed * GUST_FREQ_X) * cfg.windGust * n.windScale;
  n.windY = n.windBaseY + Math.cos(n.elapsed * GUST_FREQ_Y) * cfg.windGust * n.windScale;

  // --- Jump run: ride the ship until the player (or the pilot) says go ---
  if (n.phase === Phase.Plane) {
    n.planeTime += dt;
    const p = planePosition(n, cfg, n.planeTime);
    n.posX = p.x;
    n.posY = p.y;
    if (cfg.jumpShip === 'balloon') {
      n.altitude = balloonAltitude(cfg, n.planeTime);
    }
    const forced = n.planeTime >= cfg.spotLeadTime + cfg.spotOvertime;
    return input.action || forced ? exitPlane(n, cfg) : n;
  }

  // --- Pull (free fall) / cut away or flare (canopy) on the context key ---
  if (input.action) {
    if (n.phase === Phase.Freefall) {
      n.phase = Phase.Deploying;
      n.deployTimer = cfg.deployDuration;
      n.pullAltitude = n.altitude;
    } else if (canCutAway(n, cfg)) {
      // Double drop: let the first canopy go and fall again toward the second.
      n.phase = Phase.Freefall;
      n.cutawayAt = n.freefallTime;
      n.released = { x: n.posX, y: n.posY, altitude: n.altitude, at: n.elapsed };
      n.canopyTime = 0;
      n.trim = 0;
      n.pitch = 0;
    } else if (n.phase === Phase.Canopy && n.flareTime <= 0) {
      n.flareTime = 1e-6;
    }
  }

  // --- Turning (all airborne phases) ---
  const turnMax =
    n.phase === Phase.Freefall
      ? cfg.freefallTurnRate
      : n.phase === Phase.Deploying
        ? cfg.canopyTurnRate * 0.4
        : cfg.canopyTurnRate;
  n.turnRate +=
    (clamp(input.turn, -1, 1) * turnMax - n.turnRate) * Math.min(1, dt * cfg.turnResponse);
  n.heading = wrapAngle(n.heading + n.turnRate * dt);

  let terminal: number;
  let forwardAir: number;
  let dragRate: number;
  /** Explicit 1/s rate for descent under canopy; free fall/opening use gravity. */
  let vzRate = 0;

  if (n.phase === Phase.Freefall) {
    n.freefallTime += dt;
    n.pitch += (clamp(input.drive, -1, 1) - n.pitch) * Math.min(1, dt * cfg.pitchRate);
    terminal =
      cfg.freefallTerminal +
      (n.pitch > 0 ? n.pitch * cfg.trackTerminalBoost : n.pitch * cfg.archTerminalDrop);
    forwardAir = n.pitch > 0 ? n.pitch * cfg.trackSpeed : n.pitch * cfg.archBackslide;
    dragRate = cfg.freefallDrag;
  } else if (n.phase === Phase.Deploying) {
    n.deployTimer = Math.max(0, n.deployTimer - dt);
    const openP = 1 - n.deployTimer / Math.max(cfg.deployDuration, 1e-9);
    n.pitch += (0 - n.pitch) * Math.min(1, dt * cfg.pitchRate);
    // Snivel: barely brakes at line stretch, bites hard as the canopy inflates.
    terminal = lerp(cfg.freefallTerminal, cfg.canopyDescent, openP * openP);
    forwardAir = cfg.canopyAirspeed * openP;
    dragRate = 1.5;
    if (n.deployTimer <= 0) {
      n.phase = Phase.Canopy;
    }
  } else {
    n.canopyTime += dt;
    n.trim += (clamp(input.drive, -1, 1) - n.trim) * Math.min(1, dt * TRIM_RATE);
    const t = n.trim;
    forwardAir =
      t >= 0
        ? lerp(cfg.canopyAirspeed, cfg.riserAirspeed, t)
        : lerp(cfg.canopyAirspeed, cfg.brakeAirspeed, -t);
    terminal =
      t >= 0
        ? lerp(cfg.canopyDescent, cfg.riserDescent, t)
        : lerp(cfg.canopyDescent, cfg.brakeDescent, -t);
    terminal += (Math.abs(n.turnRate) / cfg.canopyTurnRate) * cfg.spiralDescent;
    dragRate = cfg.canopyResponse;
    vzRate = 2.5;

    if (n.flareTime > 0) {
      n.flareTime += dt;
      if (n.flareTime < cfg.flareDuration) {
        // Flaring: the wing trades its forward speed for lift.
        const eff = Math.min(1, n.flareTime / FLARE_RISE);
        forwardAir = lerp(forwardAir, cfg.flareAirspeed, eff);
        terminal = lerp(terminal, cfg.flareDescent, eff);
        vzRate = 7;
        dragRate = 5;
      } else if (n.flareTime < cfg.flareDuration + cfg.stallDuration) {
        // Out of energy: the canopy stalls and the diver drops.
        forwardAir = 1;
        terminal = cfg.stallDescent;
        vzRate = 3;
        dragRate = 3;
      } else {
        n.flareTime = 0; // re-inflated, ready to flare again
      }
    }
  }

  // --- Vertical: ease descent speed toward the phase's terminal ---
  const approach =
    vzRate > 0 ? Math.min(1, vzRate * dt) : Math.min(1, (cfg.gravity / Math.max(terminal, 1)) * dt);
  n.descentSpeed += (terminal - n.descentSpeed) * approach;
  const prevAltitude = n.altitude;
  n.altitude = Math.max(0, n.altitude - n.descentSpeed * dt);

  // --- Horizontal: velocity relative to the air eases toward the body's drive ---
  // The diver moves with the air mass; heading/pitch/trim only set the
  // air-relative part. That's what makes the wind matter: into it you crawl,
  // downwind you fly.
  const f = forwardOf(n.heading);
  let relX = n.velX - n.windX;
  let relY = n.velY - n.windY;
  const k = Math.min(1, dt * dragRate);
  relX += (f.x * forwardAir - relX) * k;
  relY += (f.y * forwardAir - relY) * k;
  n.velX = n.windX + relX;
  n.velY = n.windY + relY;
  n.posX += n.velX * dt;
  n.posY += n.velY * dt;

  n = resolveRings(n, prevAltitude, s.phase === Phase.Freefall);

  // --- Touchdown ---
  if (n.altitude <= 0) {
    const groundSpeed = Math.hypot(n.velX, n.velY);
    const landing = judgeLanding(n.phase, n.descentSpeed, groundSpeed, cfg);
    n.phase = landing === 'crash' ? Phase.Crashed : Phase.Landed;
    n.result = resolveJump(n, cfg, landing, groundSpeed);
    n.outroTimer = Math.max(0, cfg.outroDuration);
    n.deployTimer = 0;
    n.flareTime = 0;
  }
  return n;
}

/** Resolve every hoop whose altitude was crossed this step (only free fall can score). */
function resolveRings(n: GameState, prevAltitude: number, inFreefall: boolean): GameState {
  if (n.rings.length === 0 || !n.rings.some((r) => r.passed === null && n.altitude <= r.altitude)) {
    return n;
  }
  let passed = n.ringsPassed;
  const rings = n.rings.map((ring) => {
    if (ring.passed !== null || n.altitude > ring.altitude || prevAltitude < ring.altitude) {
      return ring;
    }
    const dist = Math.hypot(n.posX - ring.x, n.posY - ring.y);
    const hit = inFreefall && dist <= ring.radius;
    if (hit) {
      passed += 1;
    }
    return { ...ring, passed: hit, centered: hit ? clamp(1 - dist / ring.radius, 0, 1) : 0 };
  });
  return { ...n, rings, ringsPassed: passed };
}

/** Grade a touchdown from the phase it happened in and how fast it was. */
export function judgeLanding(
  phase: Phase,
  descent: number,
  groundSpeed: number,
  cfg: GameConfig,
): LandingQuality {
  if (phase === Phase.Freefall || descent > cfg.crashSpeed) {
    return 'crash';
  }
  if (descent <= cfg.standupDescent && groundSpeed <= cfg.standupGroundSpeed) {
    return 'standup';
  }
  return descent <= cfg.slideDescent ? 'slide' : 'tumble';
}

/** Resolve a touchdown into a scored result. */
export function resolveJump(
  s: GameState,
  cfg: GameConfig,
  landing: LandingQuality,
  groundSpeed: number,
): JumpResult {
  const t = targetAt(cfg, s.elapsed);
  const landedDistance = Math.hypot(s.posX - t.x, s.posY - t.y);
  const crashed = landing === 'crash';
  const refallTime = s.cutawayAt === null ? null : s.freefallTime - s.cutawayAt;
  const breakdown = crashed
    ? null
    : scoreJump(
        {
          landedDistance,
          landing,
          pullAltitude: s.pullAltitude,
          rings: s.rings,
          spot: s.spot,
          refallTime,
        },
        cfg,
      );
  return {
    landedDistance,
    landingSpeed: s.descentSpeed,
    groundSpeed,
    landing,
    crashed,
    bullseye: !crashed && landedDistance <= cfg.bullseyeRadius,
    pullAltitude: s.pullAltitude,
    ringsPassed: s.ringsPassed,
    ringsTotal: s.rings.length,
    spot: s.spot,
    exitAltitude: cfg.jumpShip === 'balloon' ? balloonAltitude(cfg, s.planeTime) : cfg.exitAltitude,
    freefallTime: s.freefallTime,
    refallTime,
    score: breakdown?.total ?? 0,
    breakdown,
  };
}

/** Accuracy points for a touchdown `distance` metres from the centre. */
export function accuracyPoints(distance: number, cfg: GameConfig): number {
  if (distance > cfg.targetRadius) {
    return 0;
  }
  if (distance <= cfg.bullseyeRadius) {
    return ACCURACY_MAX;
  }
  const t = (distance - cfg.bullseyeRadius) / (cfg.targetRadius - cfg.bullseyeRadius);
  return Math.round(ACCURACY_MIN + (ACCURACY_MAX - ACCURACY_MIN) * (1 - t));
}

/** Pull bonus: peaks at the hard deck, nothing above the ceiling or below the deck. */
export function pullPoints(pullAltitude: number | null, cfg: GameConfig): number {
  if (pullAltitude === null || pullAltitude < cfg.hardDeck || pullAltitude >= cfg.pullCeiling) {
    return 0;
  }
  return Math.round(
    (PULL_MAX * (cfg.pullCeiling - pullAltitude)) / (cfg.pullCeiling - cfg.hardDeck),
  );
}

/** Double-drop bonus for a re-fall of `refallTime` seconds (0 without a cut-away). */
export function stuntPoints(refallTime: number | null): number {
  if (refallTime === null) {
    return 0;
  }
  return DOUBLE_DROP_POINTS + Math.min(REFALL_MAX, Math.round(refallTime * REFALL_POINTS_PER_S));
}

/** Itemise a safe touchdown into the result card's lines. */
export function scoreJump(
  j: {
    landedDistance: number;
    landing: LandingQuality;
    pullAltitude: number | null;
    rings: Ring[];
    spot: SpotLight;
    /** Seconds of re-fall after a cut-away (null or absent: no double drop). */
    refallTime?: number | null;
  },
  cfg: GameConfig,
): ScoreBreakdown {
  const accuracy = accuracyPoints(j.landedDistance, cfg);
  let rings = 0;
  let passed = 0;
  for (const ring of j.rings) {
    if (ring.passed) {
      rings += RING_POINTS * (0.5 + 0.5 * ring.centered);
      passed += 1;
    }
  }
  if (j.rings.length > 0 && passed === j.rings.length) {
    rings += RING_SWEEP_BONUS;
  }
  rings = Math.round(rings);
  const pull = pullPoints(j.pullAltitude, cfg);
  const landing = LANDING_POINTS[j.landing];
  const spot = SPOT_POINTS[j.spot];
  const stunt = stuntPoints(j.refallTime ?? null);
  const base = accuracy + rings + pull + landing + spot + stunt;
  return {
    accuracy,
    rings,
    pull,
    landing,
    spot,
    stunt,
    base,
    multiplier: cfg.scoreMultiplier,
    total: Math.round(base * cfg.scoreMultiplier),
  };
}

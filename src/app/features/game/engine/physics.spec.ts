import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, configForDifficulty } from './config';
import {
  accuracyPoints,
  createJump,
  forwardOf,
  integrate,
  judgeLanding,
  planePosition,
  pullPoints,
  scoreJump,
  spotLightAt,
} from './physics';
import type { GameConfig, GameState, InputState, Ring } from './types';
import { Phase } from './types';

const DT = 1 / 60;
const NEUTRAL: InputState = { turn: 0, drive: 0, action: false };
const ACTION: InputState = { ...NEUTRAL, action: true };

/** Calm air, no hoops: most physics tests want a clean column. */
function calm(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...BASE_CONFIG, windBase: 0, windGust: 0, ringCount: 0, ...overrides };
}

function run(state: GameState, input: InputState, cfg: GameConfig, frames: number): GameState {
  let s = state;
  for (let i = 0; i < frames; i++) {
    s = integrate(s, input, DT, cfg);
  }
  return s;
}

/** Step until `done` (or a frame cap), feeding `input`. */
function until(
  state: GameState,
  input: InputState | ((s: GameState) => InputState),
  cfg: GameConfig,
  done: (s: GameState) => boolean,
  cap = 60 * 300,
): GameState {
  let s = state;
  for (let i = 0; i < cap && !done(s); i++) {
    s = integrate(s, typeof input === 'function' ? input(s) : input, DT, cfg);
  }
  return s;
}

/** A fresh jump already out of the plane, in free fall. */
function falling(cfg: GameConfig): GameState {
  return integrate(
    createJump(cfg, () => 0.5),
    ACTION,
    DT,
    cfg,
  );
}

/** Open the canopy at `alt` and fly until it is fully open. */
function underCanopy(cfg: GameConfig, alt = 300): GameState {
  let s = until(falling(cfg), NEUTRAL, cfg, (x) => x.altitude <= alt);
  s = integrate(s, ACTION, DT, cfg);
  return until(s, NEUTRAL, cfg, (x) => x.phase === Phase.Canopy);
}

describe('createJump', () => {
  it('is deterministic for a seeded rng', () => {
    const cfg = BASE_CONFIG;
    expect(createJump(cfg, () => 0.3)).toEqual(createJump(cfg, () => 0.3));
  });

  it('keeps its rng draw order (windDir, windScale, heading, lateral, groundSeed)', () => {
    const draws = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    let i = 0;
    const s = createJump(BASE_CONFIG, () => draws[i++ % draws.length]);
    const scale = 0.5 + 0.8 * 0.2;
    expect(s.windScale).toBeCloseTo(scale);
    expect(s.windBaseX).toBeCloseTo(Math.cos(0.1 * Math.PI * 2) * BASE_CONFIG.windBase * scale);
    expect(s.planeHeading).toBeCloseTo(0.3 * Math.PI * 2);
    expect(s.groundSeed).toBe(Math.floor(0.5 * 0xffffffff) >>> 0);
  });

  it('starts aboard the plane at exit altitude, upstream of the ideal spot', () => {
    const cfg = BASE_CONFIG;
    const s = createJump(cfg, () => 0.5);
    expect(s.phase).toBe(Phase.Plane);
    expect(s.altitude).toBe(cfg.exitAltitude);
    const f = forwardOf(s.planeHeading);
    const along = (s.spotX - s.posX) * f.x + (s.spotY - s.posY) * f.y;
    expect(along).toBeCloseTo(cfg.planeSpeed * cfg.spotLeadTime);
  });

  it('puts the ideal exit upwind of the target', () => {
    const cfg = { ...BASE_CONFIG, planeLateral: 0 };
    const s = createJump(cfg, () => 0.25);
    // Spot → target points downwind.
    expect(-s.spotX * s.windBaseX + -s.spotY * s.windBaseY).toBeGreaterThan(0);
  });

  it('lays the hoops down the free-fall column, above the pull ceiling', () => {
    const cfg = BASE_CONFIG;
    const s = createJump(cfg, () => 0.5);
    expect(s.rings).toHaveLength(cfg.ringCount);
    for (let i = 1; i < s.rings.length; i++) {
      expect(s.rings[i].altitude).toBeLessThan(s.rings[i - 1].altitude);
    }
    expect(s.rings.at(-1)?.altitude).toBeGreaterThan(cfg.pullCeiling);
    expect(s.rings.every((r) => r.passed === null)).toBe(true);
  });

  it('starts straight in free fall when the run has no lead time (?fast=1)', () => {
    const cfg = { ...BASE_CONFIG, spotLeadTime: 0, spotOvertime: 0 };
    expect(createJump(cfg, () => 0.5).phase).toBe(Phase.Freefall);
  });
});

describe('jump run (spotting)', () => {
  it('carries the diver along the run line at the plane speed', () => {
    const cfg = BASE_CONFIG;
    const s = run(
      createJump(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      60,
    );
    const p = planePosition(s, cfg, 1);
    expect(s.phase).toBe(Phase.Plane);
    expect(s.posX).toBeCloseTo(p.x);
    expect(s.posY).toBeCloseTo(p.y);
  });

  it('shows green only around the ideal spot', () => {
    const cfg = BASE_CONFIG;
    const start = createJump(cfg, () => 0.5);
    expect(spotLightAt(start, cfg)).toBe('red');
    const atSpot = { ...start, posX: start.spotX, posY: start.spotY };
    expect(spotLightAt(atSpot, cfg)).toBe('green');
  });

  it('exits on the action key and records the light', () => {
    const cfg = BASE_CONFIG;
    let s = createJump(cfg, () => 0.5);
    s = until(s, NEUTRAL, cfg, (x) => spotLightAt(x, cfg) === 'green');
    s = integrate(s, ACTION, DT, cfg);
    expect(s.phase).toBe(Phase.Freefall);
    expect(s.spot).toBe('green');
  });

  it('tips the diver out at the end of the run', () => {
    const cfg = BASE_CONFIG;
    const s = until(
      createJump(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      (x) => x.phase !== Phase.Plane,
    );
    expect(s.phase).toBe(Phase.Freefall);
    expect(s.planeTime).toBeCloseTo(cfg.spotLeadTime + cfg.spotOvertime, 1);
    expect(s.spot).toBe('red');
  });

  it('leaves with the plane’s throw, which drag bleeds off', () => {
    const cfg = calm();
    let s = falling(cfg);
    expect(Math.hypot(s.velX, s.velY)).toBeGreaterThan(cfg.planeSpeed * 0.9);
    s = run(s, NEUTRAL, cfg, 300);
    expect(Math.hypot(s.velX, s.velY)).toBeLessThan(2);
  });
});

describe('free fall', () => {
  it('eases toward but never exceeds terminal velocity', () => {
    const cfg = calm();
    let s = falling(cfg);
    for (let i = 0; i < 400; i++) {
      s = integrate(s, NEUTRAL, DT, cfg);
      expect(s.descentSpeed).toBeLessThanOrEqual(cfg.freefallTerminal + 1e-9);
    }
    expect(s.descentSpeed).toBeGreaterThan(cfg.freefallTerminal * 0.9);
  });

  it('tracking (↑) dives faster and drives forward along the heading', () => {
    const cfg = calm();
    const base = run(falling(cfg), NEUTRAL, cfg, 300);
    const track = run(base, { ...NEUTRAL, drive: 1 }, cfg, 240);
    const f = forwardOf(track.heading);
    const forward = (track.posX - base.posX) * f.x + (track.posY - base.posY) * f.y;
    expect(forward).toBeGreaterThan(cfg.trackSpeed * 2);
    expect(track.descentSpeed).toBeGreaterThan(cfg.freefallTerminal + cfg.trackTerminalBoost * 0.6);
  });

  it('arching (↓) slows the fall', () => {
    const cfg = calm();
    const s = run(falling(cfg), { ...NEUTRAL, drive: -1 }, cfg, 400);
    expect(s.descentSpeed).toBeLessThan(cfg.freefallTerminal - cfg.archTerminalDrop * 0.8);
  });

  it('←/→ turn the heading, not the position', () => {
    const cfg = calm();
    const s0 = run(falling(cfg), NEUTRAL, cfg, 300);
    const s1 = run(s0, { ...NEUTRAL, turn: 1 }, cfg, 30);
    expect(s1.heading).not.toBeCloseTo(s0.heading);
    expect(s1.turnRate).toBeGreaterThan(0);
    expect(Math.hypot(s1.posX - s0.posX, s1.posY - s0.posY)).toBeLessThan(1);
  });

  it('drifts with the air mass when neutral', () => {
    const cfg = { ...calm(), windBase: 4 };
    const s = run(falling(cfg), NEUTRAL, cfg, 600);
    const speed = Math.hypot(s.velX - s.windX, s.velY - s.windY);
    expect(speed).toBeLessThan(0.5);
  });

  it('never pulling crashes', () => {
    const cfg = calm();
    const s = until(falling(cfg), NEUTRAL, cfg, (x) => x.result !== null);
    expect(s.phase).toBe(Phase.Crashed);
    expect(s.result?.landing).toBe('crash');
    expect(s.result?.score).toBe(0);
    expect(s.result?.breakdown).toBeNull();
  });

  it('is pure: never mutates its input state', () => {
    const cfg = calm();
    const s = falling(cfg);
    const snapshot = structuredClone(s);
    integrate(s, { turn: 1, drive: 1, action: true }, DT, cfg);
    expect(s).toEqual(snapshot);
  });
});

describe('opening', () => {
  it('records the pull altitude and opens after the deploy duration', () => {
    const cfg = calm();
    let s = until(falling(cfg), NEUTRAL, cfg, (x) => x.altitude <= 400);
    s = integrate(s, ACTION, DT, cfg);
    expect(s.phase).toBe(Phase.Deploying);
    expect(s.pullAltitude).toBeGreaterThan(395);
    s = run(s, NEUTRAL, cfg, Math.ceil(cfg.deployDuration / DT) + 1);
    expect(s.phase).toBe(Phase.Canopy);
    expect(s.descentSpeed).toBeLessThan(cfg.freefallTerminal * 0.6);
    s = run(s, NEUTRAL, cfg, 120); // the canopy keeps biting for a moment
    expect(s.descentSpeed).toBeLessThan(cfg.canopyDescent + 2);
  });

  it('a pull well below the hard deck does not open in time', () => {
    const cfg = calm();
    let s = until(falling(cfg), NEUTRAL, cfg, (x) => x.altitude <= 45);
    s = integrate(s, ACTION, DT, cfg);
    s = until(s, NEUTRAL, cfg, (x) => x.result !== null);
    expect(s.result?.landing).toBe('crash');
  });
});

describe('canopy flight', () => {
  it('flies forward at its airspeed with no input', () => {
    const cfg = calm();
    const s = run(underCanopy(cfg), NEUTRAL, cfg, 240);
    expect(Math.hypot(s.velX, s.velY)).toBeCloseTo(cfg.canopyAirspeed, 0);
    expect(s.descentSpeed).toBeCloseTo(cfg.canopyDescent, 0);
  });

  it('brakes (↓) slow it down and soften the descent; risers (↑) do the opposite', () => {
    const cfg = calm();
    const open = underCanopy(cfg);
    const brakes = run(open, { ...NEUTRAL, drive: -1 }, cfg, 240);
    const risers = run(open, { ...NEUTRAL, drive: 1 }, cfg, 240);
    expect(Math.hypot(brakes.velX, brakes.velY)).toBeLessThan(cfg.canopyAirspeed - 3);
    expect(brakes.descentSpeed).toBeLessThan(cfg.canopyDescent);
    expect(Math.hypot(risers.velX, risers.velY)).toBeGreaterThan(cfg.canopyAirspeed + 1);
    expect(risers.descentSpeed).toBeGreaterThan(cfg.canopyDescent + 2);
  });

  it('a held turn spirals: the heading swings and the descent steepens', () => {
    const cfg = calm();
    const open = underCanopy(cfg);
    const s = run(open, { ...NEUTRAL, turn: 1 }, cfg, 120);
    expect(Math.abs(s.turnRate)).toBeGreaterThan(cfg.canopyTurnRate * 0.9);
    expect(s.descentSpeed).toBeGreaterThan(cfg.canopyDescent + cfg.spiralDescent * 0.8);
  });

  it('into the wind the ground speed collapses; downwind it adds up', () => {
    const cfg = { ...calm(), windBase: 5 };
    const open = underCanopy(cfg);
    const into = Math.atan2(-open.windBaseX, open.windBaseY); // heading facing the wind
    const upwind = run({ ...open, heading: into }, NEUTRAL, cfg, 240);
    const downwind = run({ ...open, heading: into + Math.PI }, NEUTRAL, cfg, 240);
    expect(Math.hypot(upwind.velX, upwind.velY)).toBeLessThan(cfg.canopyAirspeed - 3);
    expect(Math.hypot(downwind.velX, downwind.velY)).toBeGreaterThan(cfg.canopyAirspeed + 3);
  });

  it('a flare kills the descent, then stalls if held too long, then recovers', () => {
    const cfg = calm();
    let s = integrate(run(underCanopy(cfg), NEUTRAL, cfg, 120), ACTION, DT, cfg);
    s = run(s, NEUTRAL, cfg, 45);
    expect(s.descentSpeed).toBeLessThan(cfg.flareDescent + 0.6);
    s = until(s, NEUTRAL, cfg, (x) => x.flareTime > cfg.flareDuration + 0.7);
    expect(s.descentSpeed).toBeGreaterThan(cfg.canopyDescent);
    s = until(s, NEUTRAL, cfg, (x) => x.flareTime === 0);
    expect(s.phase).toBe(Phase.Canopy);
  });
});

describe('touchdown', () => {
  it('judges landings from descent and ground speed', () => {
    const cfg = BASE_CONFIG;
    expect(judgeLanding(Phase.Freefall, 1, 0, cfg)).toBe('crash');
    expect(judgeLanding(Phase.Canopy, cfg.crashSpeed + 1, 0, cfg)).toBe('crash');
    expect(judgeLanding(Phase.Canopy, 1, 2, cfg)).toBe('standup');
    expect(judgeLanding(Phase.Canopy, 1, cfg.standupGroundSpeed + 1, cfg)).toBe('slide');
    expect(judgeLanding(Phase.Canopy, cfg.slideDescent - 0.1, 0, cfg)).toBe('slide');
    expect(judgeLanding(Phase.Canopy, cfg.slideDescent + 0.1, 0, cfg)).toBe('tumble');
  });

  it('no flare = a safe tumble; a well-timed flare = a stand-up', () => {
    const cfg = calm();
    const open = underCanopy(cfg, 200);
    const noFlare = until(open, NEUTRAL, cfg, (x) => x.result !== null);
    expect(noFlare.result?.landing).toBe('tumble');

    const flare = until(
      open,
      (x) => ({ ...NEUTRAL, action: x.altitude <= 3.5 && x.flareTime === 0 }),
      cfg,
      (x) => x.result !== null,
    );
    expect(flare.result?.landing).toBe('standup');
    expect(flare.result!.score).toBeGreaterThan(noFlare.result!.score);
  });

  it('a flare from too high runs out of energy and drops the diver', () => {
    const cfg = calm();
    const open = underCanopy(cfg, 200);
    const s = until(
      open,
      (x) => ({ ...NEUTRAL, action: x.altitude <= 14 && x.flareTime === 0 }),
      cfg,
      (x) => x.result !== null,
    );
    expect(s.result?.landing).not.toBe('standup');
  });

  it('the outro ticks down after touchdown and is skippable', () => {
    const cfg = calm();
    const landed = until(underCanopy(cfg, 150), NEUTRAL, cfg, (x) => x.result !== null);
    expect(landed.outroTimer).toBeCloseTo(cfg.outroDuration);
    const ticked = integrate(landed, NEUTRAL, DT, cfg);
    expect(ticked.outroTimer).toBeLessThan(landed.outroTimer);
    expect(integrate(landed, ACTION, DT, cfg).outroTimer).toBe(0);
    const done = { ...landed, outroTimer: 0 };
    expect(integrate(done, ACTION, DT, cfg)).toBe(done);
  });
});

describe('hoops', () => {
  function oneRing(cfg: GameConfig, s: GameState, dx: number): GameState {
    const ring: Ring = {
      altitude: s.altitude - 30,
      x: s.posX + dx,
      y: s.posY,
      radius: 10,
      passed: null,
      centered: 0,
    };
    return { ...s, rings: [ring] };
  }

  it('scores a hoop crossed inside its radius in free fall', () => {
    const cfg = calm();
    const s0 = run(falling(cfg), NEUTRAL, cfg, 300);
    const s = until(oneRing(cfg, s0, 0), NEUTRAL, cfg, (x) => x.rings[0].passed !== null);
    expect(s.rings[0].passed).toBe(true);
    expect(s.rings[0].centered).toBeGreaterThan(0.8);
    expect(s.ringsPassed).toBe(1);
  });

  it('misses a hoop crossed outside it, and never counts one under canopy', () => {
    const cfg = calm();
    const s0 = run(falling(cfg), NEUTRAL, cfg, 300);
    const miss = until(oneRing(cfg, s0, 40), NEUTRAL, cfg, (x) => x.rings[0].passed !== null);
    expect(miss.rings[0].passed).toBe(false);

    const open = underCanopy(cfg, 600);
    const canopy = until(oneRing(cfg, open, 0), NEUTRAL, cfg, (x) => x.rings[0].passed !== null);
    expect(canopy.rings[0].passed).toBe(false);
  });
});

describe('scoring', () => {
  const cfg = BASE_CONFIG;

  it('accuracy peaks in the bullseye and is 0 off the target', () => {
    expect(accuracyPoints(0, cfg)).toBe(1000);
    expect(accuracyPoints(cfg.bullseyeRadius, cfg)).toBe(1000);
    expect(accuracyPoints(cfg.targetRadius, cfg)).toBe(100);
    expect(accuracyPoints(cfg.targetRadius + 1, cfg)).toBe(0);
  });

  it('the pull bonus peaks at the hard deck and is 0 outside the window', () => {
    expect(pullPoints(null, cfg)).toBe(0);
    expect(pullPoints(cfg.hardDeck, cfg)).toBe(300);
    expect(pullPoints(cfg.hardDeck - 1, cfg)).toBe(0);
    expect(pullPoints(cfg.pullCeiling, cfg)).toBe(0);
    expect(pullPoints((cfg.hardDeck + cfg.pullCeiling) / 2, cfg)).toBe(150);
  });

  it('itemises every phase and applies the difficulty multiplier', () => {
    const ring = (passed: boolean, centered: number): Ring => ({
      altitude: 0,
      x: 0,
      y: 0,
      radius: 1,
      passed,
      centered,
    });
    const b = scoreJump(
      {
        landedDistance: 0,
        landing: 'standup',
        pullAltitude: cfg.hardDeck,
        rings: [ring(true, 1), ring(true, 0)],
        spot: 'green',
      },
      cfg,
    );
    expect(b.accuracy).toBe(1000);
    expect(b.rings).toBe(150 + 75 + 300); // two hoops + clean sweep
    expect(b.pull).toBe(300);
    expect(b.landing).toBe(400);
    expect(b.spot).toBe(150);
    expect(b.base).toBe(1000 + 525 + 300 + 400 + 150);
    expect(b.total).toBe(Math.round(b.base * cfg.scoreMultiplier));
  });
});

describe('difficulty', () => {
  it('barnstormer is rougher than rookie and pays more', () => {
    const rookie = configForDifficulty('rookie');
    const barn = configForDifficulty('barnstormer');
    expect(barn.windBase).toBeGreaterThan(rookie.windBase);
    expect(barn.targetRadius).toBeLessThan(rookie.targetRadius);
    expect(barn.ringRadius).toBeLessThan(rookie.ringRadius);
    expect(barn.spotWindow).toBeLessThan(rookie.spotWindow);
    expect(barn.scoreMultiplier).toBeGreaterThan(rookie.scoreMultiplier);
  });
});

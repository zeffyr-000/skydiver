import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, configForDifficulty } from './config';
import { computeScore, createInitialState, integrate } from './physics';
import type { GameConfig, GameState, InputState } from './types';
import { Phase } from './types';

const DT = 1 / 60;
const NEUTRAL: InputState = { steerX: 0, steerY: 0, deployPressed: false, flare: 0 };
const DEPLOY: InputState = { ...NEUTRAL, deployPressed: true };

function noWind(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...BASE_CONFIG, windBase: 0, windGust: 0, ...overrides };
}

function run(state: GameState, input: InputState, cfg: GameConfig, frames: number): GameState {
  let s = state;
  for (let i = 0; i < frames; i++) {
    s = integrate(s, input, DT, cfg);
  }
  return s;
}

describe('physics: vertical', () => {
  it('free fall eases toward but never exceeds terminal velocity', () => {
    const cfg = noWind();
    let s = createInitialState(cfg, () => 0.5);
    for (let i = 0; i < 300; i++) {
      s = integrate(s, NEUTRAL, DT, cfg);
      expect(s.descentSpeed).toBeLessThanOrEqual(cfg.freefallTerminal + 1e-9);
    }
    expect(s.phase).toBe(Phase.Freefall);
    expect(s.descentSpeed).toBeGreaterThan(cfg.freefallTerminal * 0.8);
  });

  it('deploying the canopy sharply reduces descent speed', () => {
    const cfg = noWind();
    let s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      300,
    );
    const freefallSpeed = s.descentSpeed;
    s = integrate(s, DEPLOY, DT, cfg);
    s = run(s, NEUTRAL, cfg, 120);
    expect(s.phase).toBe(Phase.Canopy);
    expect(s.descentSpeed).toBeLessThan(freefallSpeed);
    expect(s.descentSpeed).toBeLessThan(cfg.canopyTerminal + 1);
  });
});

describe('physics: horizontal inertia & wind', () => {
  it('horizontal momentum carries on after steering stops', () => {
    const cfg = noWind();
    let s = createInitialState(cfg, () => 0.5);
    s = { ...s, posX: 0, posY: 0, velX: 0, velY: 0 };

    s = run(s, { ...NEUTRAL, steerX: 1 }, cfg, 60);
    const velAfterInput = s.velX;
    const posAfterInput = s.posX;
    expect(velAfterInput).toBeGreaterThan(0);

    s = run(s, NEUTRAL, cfg, 30);
    expect(s.velX).toBeGreaterThan(0); // still gliding
    expect(s.velX).toBeLessThan(velAfterInput); // but bleeding off
    expect(s.posX).toBeGreaterThan(posAfterInput); // kept drifting after release

    s = run(s, NEUTRAL, cfg, 600);
    expect(Math.abs(s.velX)).toBeLessThan(0.1); // eventually settles (no wind)
  });

  it('wind drifts the diver far more under canopy than in free fall', () => {
    const cfg: GameConfig = { ...BASE_CONFIG, windBase: 5, windGust: 0 };
    const base: GameState = {
      ...createInitialState(cfg, () => 0.5),
      posX: 0,
      posY: 0,
      velX: 0,
      velY: 0,
      windBaseX: 5,
      windBaseY: 0,
    };

    const freefall = run(base, NEUTRAL, cfg, 180);
    let canopy = integrate(base, DEPLOY, DT, cfg);
    canopy = run(canopy, NEUTRAL, cfg, 180);

    expect(freefall.posX).toBeGreaterThan(0); // drifts downwind (east)
    expect(Math.abs(canopy.posX)).toBeGreaterThan(Math.abs(freefall.posX) * 2);
  });
});

describe('physics: flare & stall', () => {
  it('gentle flare slows descent, over-flaring stalls the canopy', () => {
    const cfg = noWind();
    let s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      200,
    );
    s = integrate(s, DEPLOY, DT, cfg);
    s = run(s, NEUTRAL, cfg, 120);
    const settled = s.descentSpeed;

    const flared = run(s, { ...NEUTRAL, flare: 0.5 }, cfg, 60);
    expect(flared.descentSpeed).toBeLessThan(settled);
    expect(flared.stalled).toBe(false);

    const stalled = run(s, { ...NEUTRAL, flare: 1 }, cfg, 60);
    expect(stalled.stalled).toBe(true);
    expect(stalled.descentSpeed).toBeGreaterThan(settled); // canopy collapsed, falling again
  });
});

describe('physics: landing & scoring', () => {
  it('hitting the ground in free fall is a crash worth no points', () => {
    const cfg = noWind({ startAltitude: 30 });
    const s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      600,
    );
    expect(s.phase).toBe(Phase.Crashed);
    expect(s.result?.crashed).toBe(true);
    expect(s.result?.score).toBe(0);
  });

  it('scores highest at the centre and zero beyond the target', () => {
    const cfg = BASE_CONFIG;
    expect(computeScore(0, 0, cfg)).toBeGreaterThan(computeScore(cfg.targetRadius * 0.5, 0, cfg));
    expect(computeScore(cfg.targetRadius * 0.5, 0, cfg)).toBeGreaterThan(
      computeScore(cfg.targetRadius * 0.9, 0, cfg),
    );
    expect(computeScore(cfg.targetRadius + 1, 0, cfg)).toBe(0);
  });

  it('rewards a longer free fall (later deploy)', () => {
    const cfg = BASE_CONFIG;
    expect(computeScore(0, 20, cfg)).toBeGreaterThan(computeScore(0, 5, cfg));
  });
});

describe('physics: determinism & difficulty', () => {
  it('is deterministic for a fixed seed and input sequence', () => {
    const cfg = BASE_CONFIG;
    const play = (): GameState => {
      let s = createInitialState(cfg, () => 0.42);
      for (let i = 0; i < 500; i++) {
        const input: InputState =
          i === 100
            ? { steerX: 1, steerY: -1, deployPressed: true, flare: 0 }
            : { steerX: i % 2 ? 1 : -1, steerY: 0, deployPressed: false, flare: i > 300 ? 0.4 : 0 };
        s = integrate(s, input, DT, cfg);
      }
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('difficulty scales wind up and target down', () => {
    expect(configForDifficulty('barnstormer').windBase).toBeGreaterThan(
      configForDifficulty('rookie').windBase,
    );
    expect(configForDifficulty('barnstormer').targetRadius).toBeLessThan(
      configForDifficulty('rookie').targetRadius,
    );
  });
});

describe('physics: stall recovery & gentle landing', () => {
  it('re-inflates the canopy after the stall timer elapses', () => {
    const cfg = noWind();
    let s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      200,
    );
    s = integrate(s, DEPLOY, DT, cfg);
    s = run(s, { ...NEUTRAL, flare: 1 }, cfg, 30); // over-flare into a stall
    expect(s.stalled).toBe(true);

    // Release and wait out the stall (stallDuration = 1.5s ≈ 90 frames).
    s = run(s, NEUTRAL, cfg, 120);
    expect(s.stalled).toBe(false);
    expect(s.flareAmount).toBeCloseTo(0, 5);
  });

  it('a slow touchdown under canopy lands safely (not a crash)', () => {
    const cfg = noWind({ startAltitude: 40 });
    let s = createInitialState(cfg, () => 0.5);
    s = integrate(s, DEPLOY, DT, cfg); // open the chute immediately
    s = run(s, NEUTRAL, cfg, 1000); // ride it down to the ground

    expect(s.phase).toBe(Phase.Landed);
    expect(s.result?.crashed).toBe(false);
    expect(s.descentSpeed).toBeLessThanOrEqual(cfg.safeLandingSpeed);
  });
});

describe('physics: scoring bonuses', () => {
  it('awards the bullseye bonus only inside the inner radius', () => {
    const cfg = BASE_CONFIG;
    // Dead centre: 1000 proximity + 500 bullseye, no freefall bonus.
    expect(computeScore(0, 0, cfg)).toBe(1500);
    // Just outside the bullseye: max proximity but no 500 bonus, so the centre
    // beats it by at least the bonus.
    const justOutside = computeScore(cfg.bullseyeRadius + 0.01, 0, cfg);
    expect(justOutside).toBeLessThanOrEqual(1000);
    expect(computeScore(0, 0, cfg) - justOutside).toBeGreaterThanOrEqual(500);
  });
});

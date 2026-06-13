import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, configForDifficulty } from './config';
import { computeScore, createInitialState, integrate } from './physics';
import type { GameConfig, GameState, InputState } from './types';
import { Phase } from './types';

const DT = 1 / 60;
const NEUTRAL: InputState = {
  steerX: 0,
  steerY: 0,
  deployPressed: false,
  skipPressed: false,
  flare: 0,
};
const DEPLOY: InputState = { ...NEUTRAL, deployPressed: true };
const SKIP: InputState = { ...NEUTRAL, skipPressed: true };

/** Wind off and intro skipped: most physics tests want to start falling at once. */
function noWind(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...BASE_CONFIG, windBase: 0, windGust: 0, introDuration: 0, ...overrides };
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
    const cfg: GameConfig = { ...BASE_CONFIG, windBase: 5, windGust: 0, introDuration: 0 };
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
  it('is deterministic for a fixed seed and input sequence across all phases', () => {
    // Covers intro skip, pitched freefall, deploying, canopy flare, touchdown
    // and the outro countdown in a single replay.
    const cfg: GameConfig = { ...BASE_CONFIG, startAltitude: 300 };
    const play = (): GameState => {
      let s = createInitialState(cfg, () => 0.42);
      for (let i = 0; i < 2500; i++) {
        const input: InputState =
          i === 30
            ? SKIP
            : i === 250
              ? { ...DEPLOY, steerX: 1 }
              : {
                  ...NEUTRAL,
                  steerX: i % 2 ? 1 : -1,
                  steerY: i < 150 ? -1 : 1,
                  flare: i > 600 ? 0.4 : 0,
                };
        s = integrate(s, input, DT, cfg);
      }
      return s;
    };
    const a = play();
    expect(a).toEqual(play());
    expect(a.phase === Phase.Landed || a.phase === Phase.Crashed).toBe(true);
    expect(a.outroTimer).toBe(0);
  });

  it('keeps the original rng draw order: a fixed seed still yields the same wind and spawn', () => {
    // Plane direction, ground seed and the weather scale were appended AFTER
    // the original three draws (windDir, spreadDir, spreadMag) — the wind
    // DIRECTION and spawn position must never move for a given seed.
    const s = createInitialState(BASE_CONFIG, () => 0.5);
    expect(s.windGustScale).toBeCloseTo(0.9, 10); // 0.4 + rng
    expect(s.windBaseX).toBeCloseTo(-BASE_CONFIG.windBase * 0.9, 10); // cos(π) · base · weather
    expect(s.windBaseY).toBeCloseTo(0, 10);
    expect(s.posX).toBeCloseTo(-0.7 * BASE_CONFIG.startSpread, 10); // cos(π) · 0.7 · spread
    expect(s.posY).toBeCloseTo(0, 10);
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
    // Ride out the opening (~60 frames), then over-flare into a stall.
    s = run(s, { ...NEUTRAL, flare: 1 }, cfg, 100);
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

describe('physics: plane-approach intro', () => {
  it('starts in the plane when introDuration > 0 and freezes the diver until exit', () => {
    const cfg = noWind({ introDuration: 1 });
    let s = createInitialState(cfg, () => 0.5);
    expect(s.phase).toBe(Phase.PlaneApproach);
    const startAlt = s.altitude;
    const startX = s.posX;

    s = run(s, NEUTRAL, cfg, 30); // halfway through the intro
    expect(s.phase).toBe(Phase.PlaneApproach);
    expect(s.altitude).toBe(startAlt);
    expect(s.posX).toBe(startX);
    expect(s.descentSpeed).toBe(0);

    s = run(s, NEUTRAL, cfg, 31); // past the full second
    expect(s.phase).toBe(Phase.Freefall);
  });

  it('skips straight to free fall on the skip edge and realigns the clock', () => {
    const cfg = noWind({ introDuration: 2 });
    let s = createInitialState(cfg, () => 0.5);
    s = integrate(s, SKIP, DT, cfg);
    expect(s.phase).toBe(Phase.Freefall);
    expect(s.elapsed).toBe(cfg.introDuration);
    expect(s.introTimer).toBe(0);
  });

  it('treats a deploy press during the intro as a skip, not a deploy', () => {
    const cfg = noWind({ introDuration: 2 });
    let s = createInitialState(cfg, () => 0.5);
    s = integrate(s, DEPLOY, DT, cfg);
    expect(s.phase).toBe(Phase.Freefall);
  });

  it('starts directly in free fall when introDuration is 0', () => {
    const s = createInitialState(noWind(), () => 0.5);
    expect(s.phase).toBe(Phase.Freefall);
  });
});

describe('physics: freefall pitch', () => {
  const TRACK: InputState = { ...NEUTRAL, steerY: -1 }; // up arrow → lean forward
  const ARCH: InputState = { ...NEUTRAL, steerY: 1 }; // down arrow → arch back

  it('smooths pitch toward the stick instead of snapping', () => {
    const cfg = noWind();
    let s = createInitialState(cfg, () => 0.5);
    s = integrate(s, TRACK, DT, cfg);
    expect(s.pitch).toBeGreaterThan(0);
    expect(s.pitch).toBeLessThan(0.2);
    s = run(s, TRACK, cfg, 120);
    expect(s.pitch).toBeCloseTo(1, 2);
  });

  it('tracking raises terminal velocity, arching lowers it', () => {
    const cfg = noWind();
    const base = createInitialState(cfg, () => 0.5);
    const tracked = run(base, TRACK, cfg, 300);
    const arched = run(base, ARCH, cfg, 300);
    expect(tracked.descentSpeed).toBeGreaterThan(cfg.freefallTerminal);
    expect(tracked.descentSpeed).toBeLessThanOrEqual(
      cfg.freefallTerminal + cfg.trackTerminalBoost + 1e-9,
    );
    expect(arched.descentSpeed).toBeLessThan(cfg.freefallTerminal - cfg.archTerminalDrop + 2);
  });

  it('tracking drives hard toward -Y while arching backslides weakly toward +Y', () => {
    const cfg = noWind();
    const base = { ...createInitialState(cfg, () => 0.5), posX: 0, posY: 0 };
    const tracked = run(base, TRACK, cfg, 180);
    const arched = run(base, ARCH, cfg, 180);
    expect(tracked.posY).toBeLessThan(0);
    expect(arched.posY).toBeGreaterThan(0);
    expect(Math.abs(tracked.posY)).toBeGreaterThan(Math.abs(arched.posY));
  });

  it('arching costs lateral authority', () => {
    const cfg = noWind();
    const base = { ...createInitialState(cfg, () => 0.5), posX: 0, posY: 0 };
    const neutral = run(base, { ...NEUTRAL, steerX: 1 }, cfg, 180);
    const arched = run(base, { ...ARCH, steerX: 1 }, cfg, 180);
    expect(arched.posX).toBeGreaterThan(0);
    expect(arched.posX).toBeLessThan(neutral.posX);
  });

  it('a full-track jump leaves less freefall time than a full-arch jump', () => {
    const cfg = noWind({ startAltitude: 400 });
    const base = createInitialState(cfg, () => 0.5);
    const tracked = run(base, TRACK, cfg, 3000);
    const arched = run(base, ARCH, cfg, 3000);
    expect(tracked.phase).toBe(Phase.Crashed);
    expect(arched.phase).toBe(Phase.Crashed);
    expect(tracked.freefallTime).toBeLessThan(arched.freefallTime);
  });
});

describe('physics: canopy opening (Deploying)', () => {
  it('passes through Deploying for deployDuration before reaching Canopy', () => {
    const cfg = noWind();
    let s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      200,
    );
    s = integrate(s, DEPLOY, DT, cfg);
    expect(s.phase).toBe(Phase.Deploying);

    const midway = run(s, NEUTRAL, cfg, 30); // ~0.5s into a 1s opening
    expect(midway.phase).toBe(Phase.Deploying);
    expect(midway.descentSpeed).toBeLessThan(cfg.freefallTerminal);
    expect(midway.descentSpeed).toBeGreaterThan(cfg.canopyTerminal);

    const open = run(s, NEUTRAL, cfg, Math.ceil(cfg.deployDuration / DT) + 2);
    expect(open.phase).toBe(Phase.Canopy);
  });

  it('ignores a second deploy press while the canopy is opening', () => {
    const cfg = noWind();
    let s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      200,
    );
    s = integrate(s, DEPLOY, DT, cfg);
    const timer = s.deployTimer;
    s = integrate(s, DEPLOY, DT, cfg);
    expect(s.phase).toBe(Phase.Deploying);
    expect(s.deployTimer).toBeLessThan(timer); // still counting down, not reset
  });

  it('stops accumulating freefall time at the pull, not at full inflation', () => {
    const cfg = noWind();
    let s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      200,
    );
    const atPull = s.freefallTime;
    s = integrate(s, DEPLOY, DT, cfg);
    s = run(s, NEUTRAL, cfg, 30);
    expect(s.freefallTime).toBeCloseTo(atPull + DT, 10);
  });

  it('hitting the ground while still opening is a crash', () => {
    const cfg = noWind({ startAltitude: 200 });
    let s = run(
      createInitialState(cfg, () => 0.5),
      NEUTRAL,
      cfg,
      270,
    ); // ~4.5s of freefall
    expect(s.phase).toBe(Phase.Freefall);
    s = integrate(s, DEPLOY, DT, cfg); // pull at ~40m — far too low
    s = run(s, NEUTRAL, cfg, 600);
    expect(s.phase).toBe(Phase.Crashed);
    expect(s.result?.crashed).toBe(true);
  });
});

describe('physics: landing outro', () => {
  function landed(cfg: GameConfig): GameState {
    let s = createInitialState(cfg, () => 0.5);
    s = integrate(s, DEPLOY, DT, cfg);
    return run(s, NEUTRAL, cfg, 2000);
  }

  it('sets the result immediately at touchdown and starts the outro countdown', () => {
    const cfg = noWind({ startAltitude: 40 });
    const s = landed(cfg);
    expect(s.phase).toBe(Phase.Landed);
    expect(s.result).not.toBeNull();
    expect(s.outroTimer).toBe(0); // 2000 frames is far past the outro
  });

  it('counts the outro down and then freezes the state for good', () => {
    const cfg = noWind({ startAltitude: 40, outroDuration: 1 });
    let s = createInitialState(cfg, () => 0.5);
    s = integrate(s, DEPLOY, DT, cfg);
    while (s.phase !== Phase.Landed && s.phase !== Phase.Crashed) {
      s = integrate(s, NEUTRAL, DT, cfg);
    }
    expect(s.outroTimer).toBeCloseTo(1, 10);

    s = run(s, NEUTRAL, cfg, 30);
    expect(s.outroTimer).toBeCloseTo(0.5, 5);
    expect(s.result).not.toBeNull();

    s = run(s, NEUTRAL, cfg, 31);
    expect(s.outroTimer).toBe(0);
    const frozen = integrate(s, NEUTRAL, DT, cfg);
    expect(frozen).toBe(s); // identical reference once fully resolved
  });

  it('skip fast-forwards the outro', () => {
    const cfg = noWind({ startAltitude: 40, outroDuration: 5 });
    let s = createInitialState(cfg, () => 0.5);
    s = integrate(s, DEPLOY, DT, cfg);
    while (s.phase !== Phase.Landed && s.phase !== Phase.Crashed) {
      s = integrate(s, NEUTRAL, DT, cfg);
    }
    s = integrate(s, SKIP, DT, cfg);
    expect(s.outroTimer).toBe(0);
  });
});

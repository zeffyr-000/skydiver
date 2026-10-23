import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from './config';
import { createJump, integrate } from './physics';
import { ambienceFor, cuesBetween, type JumpCue } from './sound-cues';
import type { GameConfig, GameState, InputState } from './types';
import { Phase } from './types';

const cfg = { ...BASE_CONFIG, windBase: 0, windGust: 0 };
const DT = 1 / 60;
const IDLE: InputState = { turn: 0, drive: 0, action: false };

/** Fly with `pilot`, collecting every cue in order. */
function fly(
  pilot: (s: GameState) => InputState,
  conf: GameConfig = cfg,
): { cues: JumpCue[]; last: GameState } {
  let s = createJump(conf, () => 0.5);
  const cues: JumpCue[] = [];
  for (let i = 0; i < 60 * 200 && !s.result; i++) {
    const next = integrate(s, pilot(s), DT, conf);
    cues.push(...cuesBetween(s, next, conf));
    s = next;
  }
  return { cues, last: s };
}

describe('cuesBetween', () => {
  it('voices a whole jump in order: light, exit, pull, opening, flare, stand-up', () => {
    const { cues } = fly((s) => ({
      ...IDLE,
      action:
        (s.phase === Phase.Plane && s.planeTime > cfg.spotLeadTime) ||
        (s.phase === Phase.Freefall && s.altitude < 300) ||
        (s.phase === Phase.Canopy && s.altitude < 3.5 && s.flareTime === 0),
    }));
    const order = ['spotGreen', 'jump', 'deploy', 'canopyOpen', 'flare', 'standup'];
    const firsts = order.map((c) => cues.indexOf(c as JumpCue));
    expect(firsts.every((i) => i >= 0)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
  });

  it('snaps the cut-away of a double drop, then opens the second canopy', () => {
    const two = { ...cfg, canopies: 2 };
    const { cues } = fly(
      (s) => ({
        ...IDLE,
        action:
          s.phase === Phase.Plane ||
          (s.phase === Phase.Freefall && s.altitude < (s.cutawayAt === null ? 700 : 300)) ||
          (s.phase === Phase.Canopy && s.cutawayAt === null && s.canopyTime > 2),
      }),
      two,
    );
    const cut = cues.indexOf('cutaway');
    expect(cut).toBeGreaterThan(cues.indexOf('canopyOpen'));
    expect(cues.indexOf('canopyOpen', cut)).toBeGreaterThan(cut);
  });

  it('beeps the altimeter warning near the deck, then crashes a no-pull', () => {
    const { cues } = fly((s) => ({ ...IDLE, action: s.phase === Phase.Plane }));
    expect(cues.filter((c) => c === 'deckBeep').length).toBeGreaterThan(1);
    expect(cues.at(-1)).toBe('crash');
    expect(cues).not.toContain('cheer');
  });

  it('chimes hoops as they resolve', () => {
    const s = createJump(cfg, () => 0.5);
    const ring = { altitude: 500, x: 0, y: 0, radius: 10, passed: null, centered: 0 };
    const prev = { ...s, phase: Phase.Freefall, rings: [ring] };
    const hit = { ...prev, rings: [{ ...ring, passed: true }] };
    const miss = { ...prev, rings: [{ ...ring, passed: false }] };
    expect(cuesBetween(prev, hit, cfg)).toContain('ringPass');
    expect(cuesBetween(prev, miss, cfg)).toContain('ringMiss');
  });
});

describe('ambienceFor', () => {
  it('roars in free fall (music ducked), drones on the run, hushes on the ground', () => {
    const s = createJump(cfg, () => 0.5);
    const plane = ambienceFor(s, cfg);
    const falling = ambienceFor(
      { ...s, phase: Phase.Freefall, descentSpeed: 70, elapsed: 30, planeTime: 3 },
      cfg,
    );
    const ground = ambienceFor({ ...s, phase: Phase.Landed, elapsed: 60 }, cfg);
    expect(plane.engine).toBe(1);
    expect(falling.wind).toBeGreaterThan(0.9);
    expect(falling.music).toBeLessThan(plane.music);
    expect(falling.engine).toBe(0);
    expect(ground.wind).toBeLessThan(0.1);
  });
});

describe('the crowd', () => {
  it('is silent aloft and swells as the jumper comes down over the field', () => {
    const s = createJump(cfg, () => 0.5);
    const canopy = { ...s, phase: Phase.Canopy, elapsed: 60, planeTime: 3 };
    const high = ambienceFor({ ...canopy, altitude: 400, posX: 0, posY: 0 }, cfg);
    const low = ambienceFor({ ...canopy, altitude: 20, posX: 0, posY: 0 }, cfg);
    const lowFar = ambienceFor({ ...canopy, altitude: 20, posX: 600, posY: 0 }, cfg);
    expect(ambienceFor(s, cfg).crowd).toBe(0);
    expect(high.crowd).toBe(0);
    expect(low.crowd).toBeGreaterThan(0.7);
    expect(lowFar.crowd).toBeLessThan(low.crowd);
  });
});

describe('a balloon act', () => {
  it('has no engine, only a breath of wind on the way up', () => {
    const balloon = { ...cfg, jumpShip: 'balloon' as const, windBase: 3 };
    const s = createJump(balloon, () => 0.5);
    const a = ambienceFor(s, balloon);
    expect(a.engine).toBe(0);
    expect(a.wind).toBeLessThan(
      ambienceFor(
        createJump(cfg, () => 0.5),
        cfg,
      ).wind,
    );
  });
});

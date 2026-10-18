import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from './config';
import { createJump, integrate } from './physics';
import { ambienceFor, cuesBetween, type JumpCue } from './sound-cues';
import type { GameState, InputState } from './types';
import { Phase } from './types';

const cfg = { ...BASE_CONFIG, windBase: 0, windGust: 0 };
const DT = 1 / 60;
const IDLE: InputState = { turn: 0, drive: 0, action: false };

/** Fly with `pilot`, collecting every cue in order. */
function fly(pilot: (s: GameState) => InputState): { cues: JumpCue[]; last: GameState } {
  let s = createJump(cfg, () => 0.5);
  const cues: JumpCue[] = [];
  for (let i = 0; i < 60 * 200 && !s.result; i++) {
    const next = integrate(s, pilot(s), DT, cfg);
    cues.push(...cuesBetween(s, next, cfg));
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

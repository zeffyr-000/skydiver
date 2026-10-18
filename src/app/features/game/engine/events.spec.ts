import { describe, expect, it } from 'vitest';
import { casualPilot, naivePilot, skilledPilot, type Pilot } from './autopilot';
import {
  arcadeRun,
  circuitRun,
  dailyRun,
  dayKey,
  EVENTS,
  eventConfig,
  medalFor,
  medalRank,
  nextEvent,
} from './events';
import { mulberry32 } from './ground';
import { createJump, integrate } from './physics';
import type { GameConfig } from './types';

function play(pilot: Pilot, cfg: GameConfig, seed: number): number {
  let s = createJump(cfg, mulberry32(seed));
  for (let t = 0; !s.result && t < 300; t += 1 / 60) {
    s = integrate(s, pilot(s, cfg), 1 / 60, cfg);
  }
  return s.result?.score ?? 0;
}

describe('circuit events', () => {
  it('have unique ids, increasing medal thresholds and plain (unmultiplied) scoring', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.medals[0]).toBeLessThan(e.medals[1]);
      expect(e.medals[1]).toBeLessThan(e.medals[2]);
      expect(eventConfig(e).scoreMultiplier).toBe(1);
      expect(eventConfig(e).venue).toBe(e.venue);
    }
  });

  it('chain in order, the first one teaching the basics', () => {
    expect(EVENTS[0].tutorial).toBe(true);
    expect(nextEvent(EVENTS[0].id)).toBe(EVENTS[1]);
    expect(nextEvent(EVENTS.at(-1)!.id)).toBeNull();
  });

  // Medal calibration guard: scripted pilots fly every event's fixed jump.
  const results = EVENTS.map((e) => {
    const cfg = eventConfig(e);
    return {
      e,
      naive: medalFor(play(naivePilot, cfg, e.seed), e.medals),
      casual: medalFor(play(casualPilot, cfg, e.seed), e.medals),
      skilled: medalFor(play(skilledPilot(), cfg, e.seed), e.medals),
    };
  });

  it('a do-nothing pilot never earns better than bronze', () => {
    for (const r of results) {
      expect(medalRank(r.naive), r.e.id).toBeLessThanOrEqual(1);
    }
  });

  it('a decent pilot medals almost everywhere', () => {
    expect(results.filter((r) => r.casual).length).toBeGreaterThanOrEqual(8);
  });

  it('a skilled pilot earns at least silver everywhere, and gold on most', () => {
    for (const r of results) {
      expect(medalRank(r.skilled), r.e.id).toBeGreaterThanOrEqual(2);
    }
    expect(results.filter((r) => r.skilled === 'gold').length).toBeGreaterThanOrEqual(6);
  });
});

describe('medals', () => {
  it('awards the best threshold reached', () => {
    const m = [100, 200, 300] as const;
    expect(medalFor(99, m)).toBeNull();
    expect(medalFor(100, m)).toBe('bronze');
    expect(medalFor(250, m)).toBe('silver');
    expect(medalFor(300, m)).toBe('gold');
    expect(medalRank(null)).toBe(0);
    expect(medalRank('gold')).toBe(3);
  });
});

describe('runs', () => {
  it('a circuit run is the event’s single seeded jump', () => {
    const run = circuitRun(EVENTS[2].id)!;
    expect(run.mode).toBe('circuit');
    expect(run.jumps).toHaveLength(1);
    expect(run.jumps[0].seed).toBe(EVENTS[2].seed);
    expect(circuitRun('nope')).toBeNull();
  });

  it('an arcade run is three random jumps at three different venues', () => {
    const run = arcadeRun('ace', () => 0.3);
    expect(run.jumps).toHaveLength(3);
    expect(run.jumps.every((j) => j.seed === null)).toBe(true);
    expect(new Set(run.jumps.map((j) => j.config.venue)).size).toBe(3);
  });

  it('the daily jump is the same all day and changes the next day', () => {
    const morning = dailyRun(new Date(2026, 9, 18, 8));
    const evening = dailyRun(new Date(2026, 9, 18, 22));
    const tomorrow = dailyRun(new Date(2026, 9, 19, 8));
    expect(morning).toEqual(evening);
    expect(morning.day).toBe('2026-10-18');
    expect(tomorrow.jumps[0].seed).not.toBe(morning.jumps[0].seed);
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

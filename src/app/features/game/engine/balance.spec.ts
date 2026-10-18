import { describe, expect, it } from 'vitest';
import { casualPilot, naivePilot, skilledPilot, type Pilot } from './autopilot';
import { configForDifficulty } from './config';
import { mulberry32 } from './ground';
import { createJump, integrate } from './physics';
import { Phase, type GameConfig, type JumpResult } from './types';

/**
 * Balance guard: scripted pilots (engine/autopilot.ts) play whole jumps through
 * the real engine and the game must keep rewarding skill. The audit that led to
 * the v2 engine found a do-nothing bot hitting 100% bullseyes on every
 * difficulty — these specs make sure tuning can never drift back there.
 */

const DT = 1 / 60;
const naive = naivePilot;
const casual = casualPilot;
const skilled = skilledPilot;
type Bot = Pilot;

interface Stats {
  crash: number;
  bullseye: number;
  onTarget: number;
  standup: number;
  rings: number;
  score: number;
  seconds: number;
  /** Exit to pull. */
  freefall: number;
  /** Pull to touchdown. */
  canopy: number;
  /** Mean time between two hoops. */
  ringGap: number;
}

function play(bot: Bot, cfg: GameConfig, seeds: number): Stats {
  const st: Stats = {
    crash: 0,
    bullseye: 0,
    onTarget: 0,
    standup: 0,
    rings: 0,
    score: 0,
    seconds: 0,
    freefall: 0,
    canopy: 0,
    ringGap: 0,
  };
  let ringsTotal = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let s = createJump(cfg, mulberry32(seed));
    let t = 0;
    let exitAt = 0;
    let pullAt = 0;
    const ringAt: number[] = [];
    while (!s.result && t < 300) {
      const prev = s;
      s = integrate(s, bot(s, cfg), DT, cfg);
      t += DT;
      if (prev.phase === Phase.Plane && s.phase !== Phase.Plane) exitAt = t;
      if (prev.phase === Phase.Freefall && s.phase === Phase.Deploying) pullAt = t;
      s.rings.forEach(
        (r, i) => prev.rings[i].passed === null && r.passed !== null && ringAt.push(t),
      );
    }
    st.freefall += (pullAt || t) - exitAt;
    st.canopy += pullAt ? t - pullAt : 0;
    st.ringGap += ringAt.length > 1 ? (ringAt.at(-1)! - ringAt[0]) / (ringAt.length - 1) : 0;
    const r = s.result as JumpResult;
    st.crash += r.crashed ? 1 : 0;
    st.bullseye += r.bullseye ? 1 : 0;
    st.onTarget += !r.crashed && r.landedDistance <= cfg.targetRadius ? 1 : 0;
    st.standup += r.landing === 'standup' ? 1 : 0;
    st.rings += r.ringsPassed;
    ringsTotal += r.ringsTotal;
    st.score += r.score;
    st.seconds += t;
  }
  return {
    crash: st.crash / seeds,
    bullseye: st.bullseye / seeds,
    onTarget: st.onTarget / seeds,
    standup: st.standup / seeds,
    rings: ringsTotal ? st.rings / ringsTotal : 0,
    score: st.score / seeds,
    seconds: st.seconds / seeds,
    freefall: st.freefall / seeds,
    canopy: st.canopy / seeds,
    ringGap: st.ringGap / seeds,
  };
}

const SEEDS = 40;

describe('balance (Ace)', () => {
  const cfg = configForDifficulty('ace');
  const naiveStats = play(naive, cfg, SEEDS);
  const casualStats = play(casual, cfg, SEEDS);
  const skilledStats = play(skilled(), cfg, SEEDS);

  it('a do-nothing pilot rarely hits the bullseye and never stands up', () => {
    expect(naiveStats.bullseye).toBeLessThan(0.3);
    expect(naiveStats.standup).toBe(0);
    expect(naiveStats.rings).toBe(0);
  });

  it('skill pays: each step up roughly multiplies the score', () => {
    expect(casualStats.score).toBeGreaterThan(naiveStats.score * 1.4);
    expect(skilledStats.score).toBeGreaterThan(naiveStats.score * 2.4);
    expect(skilledStats.score).toBeGreaterThan(casualStats.score * 1.4);
  });

  it('a skilled pilot clears the hoops, lands on target and stands it up', () => {
    expect(skilledStats.crash).toBe(0);
    expect(skilledStats.rings).toBeGreaterThan(0.85);
    expect(skilledStats.onTarget).toBeGreaterThan(0.9);
    expect(skilledStats.standup).toBeGreaterThan(0.6);
  });

  it('a decent pilot gets through safely and usually stands up', () => {
    expect(casualStats.crash).toBe(0);
    expect(casualStats.standup).toBeGreaterThan(0.6);
  });

  it('pulling below the hard deck is (almost always) fatal', () => {
    expect(play(skilled(55), cfg, 20).crash).toBeGreaterThan(0.9);
  });

  it('a played jump lasts about a minute, never a slog', () => {
    expect(skilledStats.seconds).toBeGreaterThan(40);
    expect(casualStats.seconds).toBeLessThan(75);
  });

  // Playtest feedback (Oct 2026): free fall felt rushed, the hoops came one on
  // top of the other and the canopy was over before it could be flown.
  it('free fall is long enough to fly: ~25 s+, a hoop every ~4 s or more', () => {
    expect(casualStats.freefall).toBeGreaterThan(24);
    expect(skilledStats.freefall).toBeGreaterThan(24);
    expect(skilledStats.ringGap).toBeGreaterThan(3.8);
  });

  it('even a pull at the deck leaves time to fly the canopy', () => {
    expect(skilledStats.canopy).toBeGreaterThan(15);
    expect(casualStats.canopy).toBeLessThan(40);
  });
});

describe('balance across difficulties', () => {
  it('the same skill scores less of the target as conditions roughen', () => {
    const rookie = play(skilled(), configForDifficulty('rookie'), 20);
    const barn = play(skilled(), configForDifficulty('barnstormer'), 20);
    expect(rookie.onTarget).toBeGreaterThanOrEqual(barn.onTarget);
    expect(rookie.crash).toBe(0);
    expect(barn.crash).toBe(0);
  });
});

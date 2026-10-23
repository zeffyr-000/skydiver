import type { JumpResult, ScoreBreakdown } from '../engine/types';
import { headlineFor } from './result-card';

function result(over: Partial<JumpResult> = {}, base = 1500, accuracy = 600): JumpResult {
  const breakdown: ScoreBreakdown = {
    accuracy,
    rings: 0,
    pull: 0,
    landing: 0,
    spot: 0,
    stunt: 0,
    base,
    multiplier: 1,
    total: base,
  };
  return {
    landedDistance: 8,
    landingSpeed: 3,
    groundSpeed: 1,
    landing: 'standup',
    crashed: false,
    bullseye: false,
    pullAltitude: 200,
    ringsPassed: 0,
    ringsTotal: 0,
    spot: 'green',
    exitAltitude: 1500,
    freefallTime: 25,
    refallTime: null,
    score: base,
    breakdown,
    ...over,
  };
}

describe('headlineFor', () => {
  it('leads with the most newsworthy thing about the jump', () => {
    expect(headlineFor(result({ crashed: true, breakdown: null }), true)).toBe('crashed');
    expect(headlineFor(result({ bullseye: true }), true)).toBe('water');
    expect(headlineFor(result({ bullseye: true }), false)).toBe('bullseye');
    expect(headlineFor(result({ refallTime: 8 }, 2200), false)).toBe('double');
    expect(headlineFor(result({}, 900, 0), false)).toBe('missed');
    expect(headlineFor(result({}, 2400), false)).toBe('great');
    expect(headlineFor(result({}, 1500), false)).toBe('good');
    expect(headlineFor(result({}, 800), false)).toBe('poor');
  });

  it('a double drop only makes the headline if the jump was good', () => {
    expect(headlineFor(result({ refallTime: 8 }, 1200), false)).toBe('good');
  });
});

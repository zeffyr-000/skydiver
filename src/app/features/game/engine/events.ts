import type { Difficulty } from '../../../shared/settings.store';
import { BASE_CONFIG, configForDifficulty } from './config';
import { mulberry32 } from './ground';
import type { GameConfig, Venue } from './types';

/**
 * The Grand Tour: the circuit's events, the daily jump and the arcade run, as
 * pure data. Each circuit event is one jump with fixed conditions and a fixed
 * seed (the same drop zone every attempt, so it can be learned and mastered),
 * scored in plain points (no difficulty multiplier) against medal thresholds.
 */

export type Medal = 'bronze' | 'silver' | 'gold';
export const MEDALS: readonly Medal[] = ['bronze', 'silver', 'gold'];

/** What an event asks of the player (also its i18n key). */
export type Objective =
  | 'firstJump'
  | 'hoops'
  | 'seaBreeze'
  | 'lowPull'
  | 'precision'
  | 'slalom'
  | 'wagon'
  | 'crosswind'
  | 'showcase'
  | 'grandPrix'
  | 'balloon'
  | 'doubleDrop'
  | 'grandAct';

/**
 * Where an event sits on the Grand Tour screen: with its venue, or among the
 * period acts that extend the tour once the Grand Prix has a medal.
 */
export type EventGroup = 'venue' | 'heritage';

export interface EventDef {
  /** Stable id (persistence key, route param, i18n key). */
  id: string;
  venue: Venue;
  objective: Objective;
  /** Fixed jump seed: the same weather, run and drop zone on every attempt. */
  seed: number;
  /** Shows the coaching tips. */
  tutorial: boolean;
  /** The tour's panel it is listed in (its venue's, unless a period act). */
  group?: EventGroup;
  /** Overrides on top of the base (Ace) tuning; scores are never multiplied. */
  overrides: Partial<GameConfig>;
  /** Minimum jump score for bronze, silver, gold. */
  medals: readonly [number, number, number];
}

export const VENUES: readonly Venue[] = ['county', 'seaside', 'lake', 'airfield', 'meeting'];

/**
 * A balloon act's run: the balloon drifts at the wind's speed, so the green
 * light comes later and lasts a few metres; hoops are a plane-age invention.
 */
const BALLOON_ACT: Partial<GameConfig> = {
  jumpShip: 'balloon',
  spotLeadTime: 14,
  spotOvertime: 12,
  spotWindow: 10,
  spotUpwindTime: 14,
  ringCount: 0,
  hardDeck: 120,
  pullCeiling: 320,
  targetRadius: 30,
  bullseyeRadius: 2.5,
};

export const EVENTS: readonly EventDef[] = [
  {
    id: 'fair-first',
    venue: 'county',
    objective: 'firstJump',
    seed: 1101,
    tutorial: true,
    overrides: {
      windBase: 1.5,
      windGust: 0.3,
      targetRadius: 55,
      bullseyeRadius: 4,
      ringCount: 4,
      ringRadius: 26,
      planeLateral: 50,
      spotWindow: 70,
      crashSpeed: 9.5,
      standupDescent: 3,
    },
    medals: [800, 1600, 2400],
  },
  {
    id: 'fair-hoops',
    venue: 'county',
    objective: 'hoops',
    seed: 1207,
    tutorial: false,
    overrides: { windBase: 3, ringCount: 7, ringRadius: 20, ringJitter: 12 },
    medals: [1200, 2100, 2900],
  },
  {
    id: 'sea-breeze',
    venue: 'seaside',
    objective: 'seaBreeze',
    seed: 2311,
    tutorial: false,
    overrides: { windBase: 5.5, windGust: 1.2, ringCount: 5 },
    medals: [1000, 1700, 2500],
  },
  {
    id: 'sea-low',
    venue: 'seaside',
    objective: 'lowPull',
    seed: 2417,
    tutorial: false,
    overrides: { exitAltitude: 1100, hardDeck: 120, pullCeiling: 260, ringCount: 4 },
    medals: [1000, 1600, 2300],
  },
  {
    id: 'lake-shore',
    venue: 'lake',
    objective: 'precision',
    seed: 3109,
    tutorial: false,
    overrides: {
      targetRadius: 30,
      bullseyeRadius: 2.5,
      windBase: 3.5,
      windGust: 1.5,
      ringCount: 5,
    },
    medals: [1200, 1900, 2500],
  },
  {
    id: 'lake-slalom',
    venue: 'lake',
    objective: 'slalom',
    seed: 3221,
    tutorial: false,
    overrides: { windBase: 2.5, ringCount: 8, ringRadius: 15, ringJitter: 18 },
    medals: [1200, 2000, 2900],
  },
  {
    id: 'field-wagon',
    venue: 'airfield',
    objective: 'wagon',
    seed: 4103,
    tutorial: false,
    overrides: {
      targetSpeed: 3,
      targetHeading: Math.PI / 2,
      targetRadius: 6,
      bullseyeRadius: 1.5,
      ringCount: 4,
      windBase: 3,
    },
    medals: [800, 1500, 2400],
  },
  {
    id: 'field-crosswind',
    venue: 'airfield',
    objective: 'crosswind',
    seed: 4219,
    tutorial: false,
    overrides: { windBase: 7.5, windGust: 1.5, ringCount: 5 },
    medals: [900, 1500, 2200],
  },
  {
    id: 'meet-show',
    venue: 'meeting',
    objective: 'showcase',
    seed: 5113,
    tutorial: false,
    overrides: {
      windBase: 4.5,
      ringCount: 6,
      ringRadius: 16,
      targetRadius: 32,
      bullseyeRadius: 2.5,
    },
    medals: [1000, 1800, 2600],
  },
  {
    id: 'meet-grand-prix',
    venue: 'meeting',
    objective: 'grandPrix',
    seed: 5227,
    tutorial: false,
    overrides: {
      windBase: 6,
      windGust: 1.6,
      ringCount: 6,
      ringRadius: 14,
      ringJitter: 18,
      targetSpeed: 2.5,
      targetHeading: 0,
      targetRadius: 6,
      bullseyeRadius: 1.2,
      spotWindow: 35,
      planeLateral: 150,
      deployDuration: 1.4,
    },
    medals: [900, 1600, 2300],
  },

  // --- The period acts (see the Sky Gazette): they extend the tour past the Grand Prix ---
  {
    // The fairground professors' balloon ascension: no engine, no throw, the wind does it all.
    id: 'fair-balloon',
    venue: 'county',
    objective: 'balloon',
    group: 'heritage',
    seed: 6101,
    tutorial: false,
    overrides: { ...BALLOON_ACT, exitAltitude: 900, windBase: 4, windGust: 0.6, planeLateral: 25 },
    medals: [1100, 1550, 1750],
  },
  {
    // Lindbergh's and Phoebe Omlie's star turn: open, cut away, fall again, open the second.
    id: 'meet-double',
    venue: 'meeting',
    objective: 'doubleDrop',
    group: 'heritage',
    seed: 6203,
    tutorial: false,
    overrides: { canopies: 2, windBase: 3.5, ringCount: 0, targetRadius: 35, bullseyeRadius: 3 },
    medals: [1500, 2250, 2450],
  },
  {
    // Tiny Broadwick's act: a double drop from a balloon, over the seaside crowd.
    id: 'sea-grand-act',
    venue: 'seaside',
    objective: 'grandAct',
    group: 'heritage',
    seed: 6307,
    tutorial: false,
    overrides: {
      ...BALLOON_ACT,
      canopies: 2,
      exitAltitude: 1100,
      windBase: 5,
      windGust: 1,
      planeLateral: 30,
      spotUpwindTime: 16,
    },
    medals: [1400, 2100, 2300],
  },
];

export function eventById(id: string): EventDef | null {
  return EVENTS.find((e) => e.id === id) ?? null;
}

/** The event after `id` on the tour (null at the end). */
export function nextEvent(id: string): EventDef | null {
  const i = EVENTS.findIndex((e) => e.id === id);
  return i >= 0 && i + 1 < EVENTS.length ? EVENTS[i + 1] : null;
}

/** The full tuning for an event: base Ace feel, the event's twists, plain scoring. */
export function eventConfig(e: EventDef): GameConfig {
  return { ...BASE_CONFIG, ...e.overrides, venue: e.venue, scoreMultiplier: 1 };
}

/** Best medal earned by a score (null below bronze). */
export function medalFor(score: number, medals: readonly [number, number, number]): Medal | null {
  if (score >= medals[2]) return 'gold';
  if (score >= medals[1]) return 'silver';
  if (score >= medals[0]) return 'bronze';
  return null;
}

/** Rank of a medal for comparisons (0 none … 3 gold). */
export function medalRank(m: Medal | null): number {
  return m ? MEDALS.indexOf(m) + 1 : 0;
}

// ------------------------------------------------------------------- runs ---

export type RunMode = 'circuit' | 'arcade' | 'daily';

/** One jump of a run: its tuning and seed (null = a fresh random drop zone). */
export interface JumpPlan {
  config: GameConfig;
  seed: number | null;
}

export interface RunPlan {
  mode: RunMode;
  /** The circuit event being flown (circuit mode only). */
  event: EventDef | null;
  jumps: JumpPlan[];
  tutorial: boolean;
  /** Local calendar day of a daily jump ("YYYY-MM-DD"). */
  day: string | null;
}

/** A run is this many jumps in arcade mode. */
export const ARCADE_JUMPS = 3;

export function circuitRun(id: string): RunPlan | null {
  const event = eventById(id);
  if (!event) {
    return null;
  }
  return {
    mode: 'circuit',
    event,
    jumps: [{ config: eventConfig(event), seed: event.seed }],
    tutorial: event.tutorial,
    day: null,
  };
}

/** Three jumps at the chosen difficulty, each at a different venue. */
export function arcadeRun(difficulty: Difficulty, rng: () => number = Math.random): RunPlan {
  const base = configForDifficulty(difficulty);
  const start = Math.floor(rng() * VENUES.length);
  return {
    mode: 'arcade',
    event: null,
    jumps: Array.from({ length: ARCADE_JUMPS }, (_, i) => ({
      config: { ...base, venue: VENUES[(start + i) % VENUES.length] },
      seed: null,
    })),
    tutorial: false,
    day: null,
  };
}

/** "YYYY-MM-DD" in local time. */
export function dayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The jump of the day: the same conditions for everyone on a given date (no
 * backend needed — they're derived from the date), one jump, plain points.
 */
export function dailyRun(date: Date): RunPlan {
  const day = dayKey(date);
  const seed = hashString(`skydiver:${day}`);
  const rng = mulberry32(seed);
  const venue = VENUES[Math.floor(rng() * VENUES.length)];
  const wagon = rng() < 0.2;
  const config: GameConfig = {
    ...BASE_CONFIG,
    venue,
    scoreMultiplier: 1,
    windBase: 2.5 + rng() * 4,
    ringCount: 4 + Math.floor(rng() * 4),
    ringRadius: 15 + rng() * 8,
    targetRadius: wagon ? 6 : 32 + rng() * 18,
    bullseyeRadius: wagon ? 1.5 : 3,
    targetSpeed: wagon ? 2.5 : 0,
    targetHeading: rng() < 0.5 ? 0 : Math.PI / 2,
  };
  return { mode: 'daily', event: null, jumps: [{ config, seed }], tutorial: false, day };
}

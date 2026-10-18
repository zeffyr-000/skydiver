import type { Difficulty } from '../../../shared/settings.store';
import type { GameConfig } from './types';

/**
 * Baseline tuning (the "Ace" feel). Game-y, not physically exact: a jump lasts
 * about a minute — ~30 s of free fall with a hoop every ~4–5 s, then ~25–40 s
 * under a canopy nimble enough to really fly — and every phase asks for
 * something: pick the exit, chase the hoops, pull late but above the deck, fly
 * an approach against the wind, time the flare. `balance.spec.ts` guards that
 * this stays a skill game (and these durations).
 */
export const BASE_CONFIG: GameConfig = {
  // Jump run
  exitAltitude: 1500,
  planeSpeed: 35,
  spotLeadTime: 4.5,
  spotOvertime: 3.5,
  spotWindow: 45,
  planeLateral: 110,
  spotUpwindTime: 26,

  // Free fall
  gravity: 30,
  freefallTerminal: 48,
  trackTerminalBoost: 14,
  archTerminalDrop: 16,
  trackSpeed: 16,
  archBackslide: 3,
  freefallTurnRate: 1.9,
  pitchRate: 5,
  freefallDrag: 1.2,

  // Opening
  deployDuration: 1.2,
  hardDeck: 150,
  pullCeiling: 400,

  // Canopy
  canopyAirspeed: 10.5,
  brakeAirspeed: 4,
  riserAirspeed: 14,
  canopyDescent: 5.5,
  brakeDescent: 3.8,
  riserDescent: 8.5,
  spiralDescent: 2,
  canopyTurnRate: 1.75,
  turnResponse: 7,
  canopyResponse: 3.5,
  flareDuration: 2,
  stallDuration: 1.4,
  flareDescent: 1.6,
  flareAirspeed: 2,
  stallDescent: 10,

  // Touchdown
  crashSpeed: 9,
  standupDescent: 2.6,
  standupGroundSpeed: 5,
  slideDescent: 4.8,

  // Weather & target
  windBase: 4,
  windGust: 1,
  targetRadius: 40,
  bullseyeRadius: 3,

  // Hoops
  ringCount: 5,
  ringRadius: 18,
  ringJitter: 14,

  venue: 'county',
  targetSpeed: 0,
  targetHeading: Math.PI / 2,

  outroDuration: 2.2,
  scoreMultiplier: 1.5,
};

/**
 * Difficulty reshapes the weather (wind to fight under canopy), the target
 * (margin for error), the hoops (count/size) and the jump run (how far off the
 * line passes, how wide the green light is). Rougher conditions pay more. Each
 * jump then re-rolls its own weather and run within those bounds.
 */
export function configForDifficulty(difficulty: Difficulty): GameConfig {
  switch (difficulty) {
    case 'rookie':
      return {
        ...BASE_CONFIG,
        windBase: 2.5,
        windGust: 0.5,
        targetRadius: 55,
        bullseyeRadius: 4,
        planeLateral: 70,
        spotWindow: 60,
        ringCount: 5,
        ringRadius: 24,
        ringJitter: 10,
        crashSpeed: 9.5,
        standupDescent: 3,
        scoreMultiplier: 1,
      };
    case 'ace':
      return { ...BASE_CONFIG };
    case 'barnstormer':
      return {
        ...BASE_CONFIG,
        windBase: 6,
        windGust: 1.6,
        targetRadius: 30,
        bullseyeRadius: 2.5,
        planeLateral: 150,
        spotWindow: 35,
        ringCount: 6,
        ringRadius: 14,
        ringJitter: 18,
        deployDuration: 1.4,
        standupDescent: 2.2,
        scoreMultiplier: 2,
      };
  }
}

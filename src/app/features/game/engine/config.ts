import type { Difficulty } from '../../../shared/settings.store';
import type { GameConfig } from './types';

/**
 * Baseline tuning (the "Ace" feel). Values are game-y, not physically exact —
 * tuned so a jump lasts ~20-30s and movement carries momentum. Everything here
 * is meant to be iterated on.
 */
export const BASE_CONFIG: GameConfig = {
  startAltitude: 900,
  gravity: 30,
  freefallTerminal: 60,
  canopyTerminal: 6,
  steerAccelFreefall: 8,
  steerAccelCanopy: 16,
  damping: 0.35,
  windBase: 3,
  windFreefallFactor: 0.3,
  windCanopyFactor: 1,
  windGust: 0.6,
  flareSlowdown: 3.5,
  stallThreshold: 0.85,
  stallDuration: 1.5,
  safeLandingSpeed: 9,
  targetRadius: 50,
  bullseyeRadius: 6,
  startSpread: 160,
  introDuration: 2.8,
  deployDuration: 1,
  outroDuration: 2,
  pitchRate: 3,
  trackTerminalBoost: 20,
  archTerminalDrop: 25,
  trackAccel: 14,
  backslideAccel: 5,
  archSteerPenalty: 0.5,
  deploySteerFactor: 0.4,
};

/**
 * Difficulty changes three things: wind strength (drift to fight), target size
 * (margin for error), and landing tolerance (how gentle you must be).
 */
export function configForDifficulty(difficulty: Difficulty): GameConfig {
  switch (difficulty) {
    case 'rookie':
      return {
        ...BASE_CONFIG,
        windBase: 2,
        windGust: 0.3,
        targetRadius: 70,
        safeLandingSpeed: 11,
        startSpread: 120,
      };
    case 'ace':
      return { ...BASE_CONFIG };
    case 'barnstormer':
      return {
        ...BASE_CONFIG,
        windBase: 5,
        windGust: 1,
        targetRadius: 35,
        safeLandingSpeed: 7,
        startSpread: 210,
        deployDuration: 1.3, // slower opening punishes low pulls harder
      };
  }
}

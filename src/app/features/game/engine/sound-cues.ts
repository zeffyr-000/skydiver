import { clamp, spotLightAt } from './physics';
import type { GameConfig, GameState } from './types';
import { Phase } from './types';

/**
 * What the jump should sound like, derived purely from consecutive states —
 * the audio layer just plays what this returns. Keeping it pure keeps the
 * engine testable (and the sound design reviewable in a spec).
 */

/** One-shot sounds triggered by something happening in the jump. */
export type JumpCue =
  | 'spotGreen'
  | 'jump'
  | 'deploy'
  | 'canopyOpen'
  | 'flare'
  | 'stall'
  | 'ringPass'
  | 'ringMiss'
  | 'deckBeep'
  | 'standup'
  | 'slide'
  | 'tumble'
  | 'crash'
  | 'cheer'
  | 'bullseye';

/** Continuous sound levels (0..1), refreshed a few times a second. */
export interface Ambience {
  /** Rushing air. */
  wind: number;
  /** Brightness of the rush (0 low hiss … 1 roaring). */
  windPitch: number;
  /** The biplane's engine. */
  engine: number;
  /** Music level multiplier (ducked under the free-fall roar). */
  music: number;
}

export const SILENCE: Ambience = { wind: 0, windPitch: 0, engine: 0, music: 1 };

/** Seconds between the hard-deck warning beeps. */
const DECK_BEEP_S = 0.35;

/** Cues for the step from `prev` to `next`. */
export function cuesBetween(prev: GameState, next: GameState, cfg: GameConfig): JumpCue[] {
  const cues: JumpCue[] = [];
  if (prev.phase === Phase.Plane && next.phase === Phase.Plane) {
    if (spotLightAt(next, cfg) === 'green' && spotLightAt(prev, cfg) !== 'green') {
      cues.push('spotGreen');
    }
  }
  if (prev.phase === Phase.Plane && next.phase !== Phase.Plane) {
    cues.push('jump');
  }
  if (prev.phase === Phase.Freefall && next.phase === Phase.Deploying) {
    cues.push('deploy');
  }
  if (prev.phase === Phase.Deploying && next.phase === Phase.Canopy) {
    cues.push('canopyOpen');
  }
  if (next.phase === Phase.Canopy) {
    if (prev.flareTime <= 0 && next.flareTime > 0) {
      cues.push('flare');
    }
    if (prev.flareTime < cfg.flareDuration && next.flareTime >= cfg.flareDuration) {
      cues.push('stall');
    }
  }
  // Hoops resolved this step.
  for (let i = 0; i < next.rings.length; i++) {
    if (prev.rings[i]?.passed === null && next.rings[i].passed !== null) {
      cues.push(next.rings[i].passed ? 'ringPass' : 'ringMiss');
    }
  }
  // The altimeter warning: beeps while falling through the last 40 m above the deck.
  if (next.phase === Phase.Freefall && next.altitude < cfg.hardDeck + 40) {
    if (Math.floor(next.elapsed / DECK_BEEP_S) !== Math.floor(prev.elapsed / DECK_BEEP_S)) {
      cues.push('deckBeep');
    }
  }
  // Touchdown.
  if (!prev.result && next.result) {
    const r = next.result;
    cues.push(r.landing === 'crash' ? 'crash' : r.landing);
    if (r.bullseye) {
      cues.push('bullseye');
    }
    if (!r.crashed && r.landedDistance <= cfg.targetRadius) {
      cues.push('cheer');
    }
  }
  return cues;
}

/** The continuous soundscape for a state. */
export function ambienceFor(s: GameState, cfg: GameConfig): Ambience {
  // The engine drones on the run, then fades as the ship flies off.
  const sinceExit = s.phase === Phase.Plane ? 0 : s.elapsed - s.planeTime;
  const engine = s.phase === Phase.Plane ? 1 : clamp(1 - sinceExit / 5, 0, 1);
  switch (s.phase) {
    case Phase.Plane:
      return { wind: 0.25, windPitch: 0.25, engine, music: 1 };
    case Phase.Freefall: {
      const rush = clamp(s.descentSpeed / (cfg.freefallTerminal + cfg.trackTerminalBoost), 0, 1);
      return { wind: 0.25 + 0.75 * rush, windPitch: rush, engine, music: 0.45 };
    }
    case Phase.Deploying:
      return { wind: 0.8, windPitch: 0.7, engine, music: 0.5 };
    case Phase.Canopy: {
      const speed = Math.hypot(s.velX - s.windX, s.velY - s.windY);
      return {
        wind: clamp(0.15 + speed / 40 + s.descentSpeed / 60, 0, 0.6),
        windPitch: 0.15,
        engine,
        music: 1,
      };
    }
    default:
      // On the ground: the air is still.
      return { wind: 0.05, windPitch: 0, engine: 0, music: 1 };
  }
}

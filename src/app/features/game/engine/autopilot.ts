import { forwardOf, spotLightAt, targetAt } from './physics';
import type { GameConfig, GameState, InputState } from './types';
import { Phase } from './types';

/**
 * Scripted pilots: pure functions from a state to an input, with digital keys
 * like a keyboard player. They play whole jumps through the real engine — the
 * balance and medal specs use them to prove that skill pays, and the title
 * screen's attract mode flies the skilled one.
 */
export type Pilot = (s: GameState, cfg: GameConfig) => InputState;

const IDLE: InputState = { turn: 0, drive: 0, action: false };

function wrap(a: number): number {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

function headingTo(dx: number, dy: number): number {
  return Math.atan2(dx, -dy);
}

function steerTo(s: GameState, desired: number, dead: number): number {
  const d = wrap(desired - s.heading - s.turnRate * 0.25);
  return d > dead ? 1 : d < -dead ? -1 : 0;
}

/** Where the target will be when we touch down (it may be a moving wagon). */
function aimPoint(s: GameState, cfg: GameConfig): { x: number; y: number } {
  const eta = s.altitude / Math.max(1, s.descentSpeed);
  return targetAt(cfg, s.elapsed + eta);
}

/** Air heading whose ground track points at (tx, ty), given airspeed `a`. */
function crabHeading(s: GameState, tx: number, ty: number, a: number): number {
  const dx = tx - s.posX;
  const dy = ty - s.posY;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const along = s.windX * ux + s.windY * uy;
  const px = s.windX - along * ux;
  const py = s.windY - along * uy;
  const p = Math.hypot(px, py);
  if (p >= a) {
    return headingTo(-s.windX, -s.windY);
  }
  const c = Math.sqrt(1 - (p * p) / (a * a));
  return headingTo(-px / a + ux * c, -py / a + uy * c);
}

/** Never spots, never steers in free fall, pulls high, aims the canopy at the target, no flare. */
export const naivePilot: Pilot = (s, cfg) => {
  if (s.phase === Phase.Plane) {
    return IDLE;
  }
  if (s.phase === Phase.Freefall) {
    return { ...IDLE, action: s.altitude <= cfg.pullCeiling - 50 };
  }
  const t = aimPoint(s, cfg);
  return { ...IDLE, turn: steerTo(s, headingTo(t.x - s.posX, t.y - s.posY), 0.15) };
};

/** A decent human: jumps on green, tracks toward the target, pulls mid-window, flares around 4 m. */
export const casualPilot: Pilot = (s, cfg) => {
  if (s.phase === Phase.Plane) {
    return { ...IDLE, action: spotLightAt(s, cfg) === 'green' };
  }
  const t = aimPoint(s, cfg);
  const aim = headingTo(t.x - s.posX, t.y - s.posY);
  if (s.phase === Phase.Freefall) {
    return {
      turn: steerTo(s, aim, 0.2),
      drive: Math.hypot(t.x - s.posX, t.y - s.posY) > 60 ? 1 : 0,
      action: s.altitude <= cfg.hardDeck + 90,
    };
  }
  return {
    turn: steerTo(s, aim, 0.12),
    drive: 0,
    action: s.phase === Phase.Canopy && s.altitude <= 4 && s.flareTime === 0,
  };
};

/** Plays it all: tight spot, hoops, pull just above the deck, crabbed approach, timed flare. */
export function skilledPilot(pullAt?: number): Pilot {
  return (s, cfg) => {
    const pull = pullAt ?? cfg.hardDeck + 15;
    if (s.phase === Phase.Plane) {
      const f = forwardOf(s.planeHeading);
      const along = (s.posX - s.spotX) * f.x + (s.posY - s.spotY) * f.y;
      return { ...IDLE, action: Math.abs(along) < cfg.spotWindow * 0.4 };
    }
    const target = aimPoint(s, cfg);
    if (s.phase === Phase.Freefall) {
      const next = s.rings.find((r) => r.passed === null && r.altitude < s.altitude);
      const goal = next ? next.altitude : pull;
      const tt = (s.altitude - goal) / Math.max(30, s.descentSpeed);
      const drift = next ? tt : tt + 18;
      const tx = (next ? next.x : target.x) - s.windX * drift;
      const ty = (next ? next.y : target.y) - s.windY * drift;
      const dx = tx - s.posX;
      const dy = ty - s.posY;
      const d = Math.hypot(dx, dy);
      const want = headingTo(dx, dy);
      const drive = d / Math.max(0.5, tt) > 4 ? 1 : d < 4 ? -1 : 0.4;
      return {
        turn: d > 3 ? steerTo(s, want, 0.08) : 0,
        drive: Math.abs(wrap(want - s.heading)) > 1.2 ? 0 : drive,
        action: s.altitude <= pull,
      };
    }
    const d = Math.hypot(target.x - s.posX, target.y - s.posY);
    let desired: number;
    let drive = 0;
    if (d < 6 && s.altitude < 25) {
      desired = headingTo(-s.windX, -s.windY); // hover over it, facing the wind
      drive = -1;
    } else {
      desired = crabHeading(s, target.x, target.y, cfg.canopyAirspeed);
      const closing = (s.velX * (target.x - s.posX) + s.velY * (target.y - s.posY)) / (d || 1);
      if (closing * (s.altitude / Math.max(1, s.descentSpeed)) > d + 10) {
        drive = -1; // overshooting: brakes
      }
    }
    return {
      turn: s.altitude < 3 ? 0 : steerTo(s, desired, 0.08),
      drive,
      action: s.phase === Phase.Canopy && s.altitude <= 3.6 && s.flareTime === 0,
    };
  };
}

import { skilledPilot, type Pilot } from './autopilot';
import { BASE_CONFIG } from './config';
import { VENUES } from './events';
import { createJump, integrate } from './physics';
import type { GameConfig, GameState, InputState } from './types';
import { Phase, type Venue } from './types';

/**
 * 'attract': whole jumps back to back across the venues (the title screen's
 * demo, like an arcade cabinet). 'calm': a canopy circling a drop zone at a
 * steady height (the living backdrop behind the menus).
 */
export type DemoMode = 'attract' | 'calm';

/** Height the calm canopy hovers at (m). */
const CALM_ALTITUDE = 150;
/** Seconds the attract demo lingers on a landing before the next jump. */
const ATTRACT_HOLD = 2.5;
/** The calm canopy keeps within this distance of the target (m). */
const CALM_RADIUS = 260;

/**
 * The menus' backdrop: the real engine, flown by the skilled autopilot. Pure
 * apart from the injected rng (which picks each jump's drop zone).
 */
export class DemoFlight {
  cfg!: GameConfig;
  state!: GameState;
  /** Increments with every new jump, so the view can fade between them. */
  jumpCount = 0;

  private venueIndex: number;
  private hold = 0;
  private readonly pilot: Pilot = skilledPilot();

  constructor(
    readonly mode: DemoMode,
    private readonly rng: () => number = Math.random,
  ) {
    this.venueIndex = Math.floor(rng() * VENUES.length);
    this.start();
  }

  get venue(): Venue {
    return this.cfg.venue;
  }

  /** Advance the demo by `dt` seconds. */
  step(dt: number): void {
    if (this.mode === 'calm') {
      this.state = integrate(this.state, this.circle(), dt, this.cfg);
      // Hover: the backdrop never lands.
      this.state = { ...this.state, altitude: CALM_ALTITUDE, descentSpeed: this.cfg.canopyDescent };
      return;
    }
    const s = this.state;
    if ((s.phase === Phase.Landed || s.phase === Phase.Crashed) && s.outroTimer <= 0) {
      this.hold += dt;
      if (this.hold >= ATTRACT_HOLD) {
        this.start();
      }
      return;
    }
    this.state = integrate(s, this.pilot(s, this.cfg), dt, this.cfg);
  }

  /** A lazy circle over the drop zone, turning back toward it when far out. */
  private circle(): InputState {
    const s = this.state;
    const d = Math.hypot(s.posX, s.posY);
    if (d > CALM_RADIUS) {
      const home = Math.atan2(-s.posX, s.posY);
      const err = Math.atan2(Math.sin(home - s.heading), Math.cos(home - s.heading));
      return { turn: err > 0.1 ? 0.6 : err < -0.1 ? -0.6 : 0, drive: 0, action: false };
    }
    return { turn: 0.25, drive: 0, action: false };
  }

  private start(): void {
    const venue = VENUES[this.venueIndex % VENUES.length];
    this.venueIndex++;
    this.cfg = { ...BASE_CONFIG, venue, ringCount: 4, scoreMultiplier: 1 };
    const s = createJump(this.cfg, this.rng);
    this.state =
      this.mode === 'calm'
        ? {
            ...s,
            phase: Phase.Canopy,
            altitude: CALM_ALTITUDE,
            descentSpeed: this.cfg.canopyDescent,
            pullAltitude: 400,
            canopyTime: 30,
            posX: (this.rng() - 0.5) * 200,
            posY: (this.rng() - 0.5) * 200,
            heading: this.rng() * Math.PI * 2,
            rings: [],
          }
        : s;
    this.hold = 0;
    this.jumpCount++;
  }
}

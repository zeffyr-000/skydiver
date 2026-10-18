import { describe, expect, it } from 'vitest';
import { DemoFlight } from './demo';
import { mulberry32 } from './ground';
import { Phase } from './types';

const DT = 1 / 60;

describe('DemoFlight', () => {
  it('attract: flies whole jumps with the autopilot, then starts the next at another venue', () => {
    const demo = new DemoFlight('attract', mulberry32(3));
    const firstVenue = demo.venue;
    let landed = false;
    for (let i = 0; i < 60 * 120 && demo.jumpCount === 1; i++) {
      demo.step(DT);
      landed ||= demo.state.phase === Phase.Landed;
    }
    expect(landed).toBe(true); // the skilled pilot doesn't crash the demo
    expect(demo.jumpCount).toBe(2);
    expect(demo.venue).not.toBe(firstVenue);
    expect(demo.state.phase).toBe(Phase.Plane);
  });

  it('calm: a canopy that circles the drop zone at a steady height, never landing', () => {
    const demo = new DemoFlight('calm', mulberry32(5));
    let maxDist = 0;
    for (let i = 0; i < 60 * 90; i++) {
      demo.step(DT);
      maxDist = Math.max(maxDist, Math.hypot(demo.state.posX, demo.state.posY));
    }
    expect(demo.state.phase).toBe(Phase.Canopy);
    expect(demo.state.altitude).toBe(150);
    expect(maxDist).toBeLessThan(450);
    expect(demo.jumpCount).toBe(1);
  });
});

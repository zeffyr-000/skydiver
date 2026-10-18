import { describe, expect, it } from 'vitest';
import { CANOPY_LIFT, cameraFor, floorRow, horizonY, project, rowElevation } from './camera';
import { BASE_CONFIG } from './config';
import { createJump, integrate } from './physics';
import { Phase } from './types';

const W = 384;
const H = 216;
const cfg = BASE_CONFIG;

describe('cameraFor', () => {
  it('frames the diver on the principal point (and his canopy above it)', () => {
    const s = createJump(cfg, () => 0.4);
    for (const phase of [Phase.Plane, Phase.Freefall]) {
      const cam = cameraFor({ ...s, phase }, cfg, W, H);
      const p = project(cam, s.posX, s.posY, s.altitude);
      expect(p?.sx).toBeCloseTo(W / 2);
      expect(p?.sy).toBeCloseTo(H / 2);
    }
    const open = { ...s, phase: Phase.Canopy, pullAltitude: 300, canopyTime: 5 };
    const cam = cameraFor(open, cfg, W, H);
    const diver = project(cam, s.posX, s.posY, s.altitude);
    const pivot = project(cam, s.posX, s.posY, s.altitude + CANOPY_LIFT);
    expect(diver?.sx).toBeCloseTo(W / 2);
    expect(diver!.sy).toBeGreaterThan(H / 2);
    expect(pivot?.sy).toBeCloseTo(H / 2);
  });

  it('looks steeply down in free fall and toward the horizon under a low canopy', () => {
    const s = integrate(
      createJump(cfg, () => 0.4),
      { turn: 0, drive: 0, action: true },
      1 / 60,
      cfg,
    );
    const falling = cameraFor({ ...s, freefallTime: 5 }, cfg, W, H);
    const lowCanopy = cameraFor(
      { ...s, phase: Phase.Canopy, pullAltitude: 200, canopyTime: 10, altitude: 5 },
      cfg,
      W,
      H,
    );
    expect(falling.pitch).toBeGreaterThan(lowCanopy.pitch);
    expect(horizonY(falling)).toBeLessThan(0); // no sky in the column view
    expect(horizonY(lowCanopy)).toBeGreaterThan(0); // horizon on screen near the ground
  });
});

describe('floor projection', () => {
  it('rows hit the ground farther away toward the horizon', () => {
    const s = createJump(cfg, () => 0.4);
    const cam = cameraFor(
      { ...s, phase: Phase.Canopy, pullAltitude: 200, canopyTime: 9, altitude: 20 },
      cfg,
      W,
      H,
    );
    const near = floorRow(cam, H - 0.5);
    const mid = floorRow(cam, H / 2 + 0.5);
    expect(near && mid).toBeTruthy();
    expect(mid!.forward).toBeGreaterThan(near!.forward);
    expect(floorRow(cam, horizonY(cam) - 2)).toBeNull();
  });

  it('agrees with the point projection', () => {
    const s = createJump(cfg, () => 0.7);
    const cam = cameraFor(
      { ...s, phase: Phase.Canopy, pullAltitude: 200, canopyTime: 9, altitude: 40 },
      cfg,
      W,
      H,
    );
    const row = floorRow(cam, 180.5);
    expect(row).toBeTruthy();
    const f = { x: Math.sin(cam.heading), y: -Math.cos(cam.heading) };
    const p = project(cam, cam.x + f.x * row!.forward, cam.y + f.y * row!.forward, 0);
    expect(p?.sy).toBeCloseTo(180.5, 3);
    expect(p?.sx).toBeCloseTo(cam.cx, 3);
  });

  it('elevation is 0 at the horizon and negative below it', () => {
    const s = createJump(cfg, () => 0.4);
    const cam = cameraFor(
      { ...s, phase: Phase.Canopy, pullAltitude: 200, canopyTime: 9, altitude: 5 },
      cfg,
      W,
      H,
    );
    expect(rowElevation(cam, horizonY(cam))).toBeCloseTo(0, 6);
    expect(rowElevation(cam, H - 1)).toBeLessThan(0);
  });

  it('points behind the camera do not project', () => {
    const s = createJump(cfg, () => 0.4);
    const cam = cameraFor(s, cfg, W, H);
    const f = { x: Math.sin(cam.heading), y: -Math.cos(cam.heading) };
    expect(project(cam, cam.x - f.x * 100, cam.y - f.y * 100, cam.z)).toBeNull();
  });
});

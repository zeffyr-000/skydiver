import { describe, expect, it } from 'vitest';
import { horizonY, type Camera } from './camera';
import { SUN_HEADING } from './ground';
import { FOG, paintRidges, paintSkyRow, paintSun, SKY, skyFrame } from './horizon';

const W = 160;
const H = 90;

function camera(heading: number, pitch: number): Camera {
  return {
    x: 0,
    y: 0,
    z: 50,
    heading,
    pitch,
    focal: H / 2 / Math.tan((32 * Math.PI) / 180),
    cx: W / 2,
    cy: H / 2,
  };
}

const SKY_COLOURS = new Set(SKY.map(([, c]) => c));

describe('horizon', () => {
  it('the sunset glow peaks in the columns facing the sun', () => {
    const toward = skyFrame(camera(SUN_HEADING, 0.2), W);
    const away = skyFrame(camera(SUN_HEADING + Math.PI, 0.2), W);
    expect(toward.glow[W / 2]).toBeGreaterThan(0.95);
    expect(away.glow[W / 2]).toBeLessThan(0.05);
    // Azimuths fan out symmetrically around the centre column.
    expect(toward.azimuth[0]).toBeCloseTo(-toward.azimuth[W - 1], 5);
  });

  it('paints a sky row only in sky colours away from the sun, dithered between two bands', () => {
    const px = new Uint32Array(W);
    paintSkyRow(px, 0, W, 3, 0.2, skyFrame(camera(SUN_HEADING + Math.PI, 0), W));
    const used = new Set(px);
    expect(used.size).toBe(2);
    for (const c of used) expect(SKY_COLOURS.has(c)).toBe(true);
  });

  it('puts the hills on the horizon, and nothing when the camera looks straight down', () => {
    const cam = camera(1, 0.25);
    const px = new Uint32Array(W * H);
    paintRidges(px, W, H, cam, skyFrame(cam, W));
    const hy = Math.floor(horizonY(cam));
    const column = (x: number) => Array.from({ length: H }, (_, y) => px[y * W + x]);
    const painted = column(40).findIndex((c) => c !== 0);
    expect(painted).toBeGreaterThanOrEqual(0);
    expect(painted).toBeLessThan(hy);
    expect(
      column(40)
        .slice(hy)
        .every((c) => c === 0),
    ).toBe(true); // the ground's rows untouched

    const down = camera(1, 1.3);
    const none = new Uint32Array(W * H);
    paintRidges(none, W, H, down, skyFrame(down, W));
    expect(none.every((c) => c === 0)).toBe(true);
  });

  it('sets the sun above the horizon when facing it, and nowhere when facing away', () => {
    const facing = camera(SUN_HEADING, 0.05);
    const px = new Uint32Array(W * H).fill(FOG);
    paintSun(px, W, H, facing);
    const lit = px.findIndex((c) => c !== FOG);
    expect(lit).toBeGreaterThanOrEqual(0);
    expect(Math.floor(lit / W)).toBeLessThan(horizonY(facing));

    const away = new Uint32Array(W * H).fill(FOG);
    paintSun(away, W, H, camera(SUN_HEADING + Math.PI, 0.05));
    expect(away.every((c) => c === FOG)).toBe(true);
  });
});

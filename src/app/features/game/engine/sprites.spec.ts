import { describe, expect, it } from 'vitest';
import { BAKED_SPECS } from './baked-sprites';
import { CROWD_STYLES, PROP_SIZE, type PropKind } from './ground';
import { bakedFrame } from './sprites';

const DEG = Math.PI / 180;

describe('bakedFrame', () => {
  const plane = BAKED_SPECS.plane; // 16 yaws × elevations

  it('picks the elevation row nearest to the camera', () => {
    expect(bakedFrame(plane, plane.elevs[0] * DEG)).toBe(0);
    const last = plane.elevs.length - 1;
    expect(bakedFrame(plane, 89 * DEG)).toBe(last * plane.cols);
  });

  it('picks the yaw step nearest to the relative heading, wrapping both ways', () => {
    const step = (Math.PI * 2) / plane.yaws;
    expect(bakedFrame(plane, 0, step * 3)).toBe(3);
    expect(bakedFrame(plane, 0, -step)).toBe(plane.yaws - 1);
    expect(bakedFrame(plane, 0, Math.PI * 2 + step * 0.4)).toBe(0);
  });

  it('adds the animation column inside a yaw step', () => {
    const mill = BAKED_SPECS.windmill; // 8 yaws × 2 sail frames
    expect(bakedFrame(mill, 0, (Math.PI * 2) / mill.yaws, 1)).toBe(1 * mill.anim + 1);
  });

  it('treats non-directional sheets as variants only', () => {
    const fall = BAKED_SPECS['diver-fall']; // 7 poses
    expect(bakedFrame(fall, fall.elevs[1] * DEG, 1.2, 6)).toBe(fall.cols + 6);
  });
});

describe('BAKED_SPECS', () => {
  it('bakes a sheet for every prop on the ground', () => {
    for (const kind of Object.keys(PROP_SIZE) as PropKind[]) {
      expect(BAKED_SPECS[kind]).toBeDefined();
    }
  });

  it('bakes each crowd style watching and cheering', () => {
    expect(BAKED_SPECS.spectator.cols).toBe(CROWD_STYLES * 2);
  });

  it('bakes the Jenny with and without the jumper on its wing, frame for frame', () => {
    const { plane, 'plane-empty': empty } = BAKED_SPECS;
    expect([empty.cols, empty.yaws, empty.elevs]).toEqual([plane.cols, plane.yaws, plane.elevs]);
  });
});

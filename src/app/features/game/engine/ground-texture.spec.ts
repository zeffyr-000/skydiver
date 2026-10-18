import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from './config';
import { generateTerrain } from './ground';
import {
  buildGroundTexture,
  hexToPacked,
  levelForFootprint,
  packRgb,
  sampleGround,
  shade,
} from './ground-texture';

// Small pyramid so the spec stays fast.
const LEVELS: [number, number][] = [
  [0.5, 256],
  [4, 256],
  [16, 128],
];
const cfg = BASE_CONFIG;
const terrain = generateTerrain(7, cfg);

describe('packing', () => {
  it('packs little-endian RGBA like an ImageData Uint32 view', () => {
    expect(packRgb(1, 2, 3)).toBe(0xff030201);
    expect(hexToPacked('#c1352b')).toBe(packRgb(0xc1, 0x35, 0x2b));
    expect(shade(packRgb(100, 100, 100), 0.5)).toBe(packRgb(50, 50, 50));
  });
});

describe('buildGroundTexture', () => {
  const tex = buildGroundTexture(terrain, cfg, 7, LEVELS);

  it('is deterministic per seed', () => {
    const again = buildGroundTexture(terrain, cfg, 7, LEVELS);
    expect(again.levels[0].data).toEqual(tex.levels[0].data);
  });

  it('paints the bullseye red with a white centre and the outer ring white', () => {
    const red = hexToPacked('#c1352b');
    const white = hexToPacked('#fff7e0');
    expect(sampleGround(tex, 0.1, 0.1, 0)).toBe(white);
    expect(sampleGround(tex, cfg.bullseyeRadius * 0.8, 0, 0)).toBe(red);
    expect(sampleGround(tex, cfg.targetRadius, 0, 0)).toBe(white);
  });

  it('falls back to coarser levels outside a level, and the last one wraps', () => {
    const far = 10_000;
    expect(() => sampleGround(tex, far, -far, 0)).not.toThrow();
    expect(sampleGround(tex, far, -far, 0)).toBeGreaterThan(0);
  });

  it('picks finer levels for smaller pixel footprints', () => {
    expect(levelForFootprint(tex, 0.1)).toBe(0);
    expect(levelForFootprint(tex, 6)).toBe(1);
    expect(levelForFootprint(tex, 1000)).toBe(2);
  });
});

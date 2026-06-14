import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from './config';
import { generateTerrain, mulberry32, TERRAIN_EXTENT } from './ground';
import { TerrainSprite } from './sprites';

describe('mulberry32', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('diverges for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('generateTerrain', () => {
  const cfg = BASE_CONFIG;

  it('is deterministic per seed', () => {
    expect(generateTerrain(42, cfg)).toEqual(generateTerrain(42, cfg));
    expect(generateTerrain(42, cfg)).not.toEqual(generateTerrain(43, cfg));
  });

  it('keeps scenery out of the target area so the bullseye stays readable', () => {
    const dressing = new Set([
      TerrainSprite.Tent,
      TerrainSprite.SpectatorA,
      TerrainSprite.SpectatorB,
      TerrainSprite.Windsock,
    ]);
    for (const seed of [1, 99, 123456]) {
      const t = generateTerrain(seed, cfg);
      for (const d of t.decorations) {
        if (dressing.has(d.sprite)) {
          continue; // drop-zone dressing sits deliberately at the ring edge
        }
        expect(Math.hypot(d.x, d.y)).toBeGreaterThanOrEqual(cfg.targetRadius + 15);
      }
    }
  });

  it('rolls one landmark per jump and hits all three kinds across seeds', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      kinds.add(generateTerrain(seed, cfg).landmark.kind);
    }
    expect(kinds).toEqual(new Set(['lake', 'airstrip', 'forest']));
  });

  it('keeps the landmark clear of the target', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const lm = generateTerrain(seed, cfg).landmark;
      if (lm.kind === 'lake') {
        expect(Math.hypot(lm.x, lm.y)).toBeGreaterThanOrEqual(
          cfg.targetRadius + Math.max(lm.rx, lm.ry) * 0.3,
        );
      } else if (lm.kind === 'forest') {
        expect(Math.hypot(lm.x, lm.y)).toBeGreaterThanOrEqual(cfg.targetRadius);
      } else {
        const offset = lm.orientation === 'h' ? lm.y : lm.x;
        expect(Math.abs(offset)).toBeGreaterThanOrEqual(cfg.targetRadius + lm.widthM / 2);
      }
    }
  });

  it('a forest landmark ships its trees as decorations', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const t = generateTerrain(seed, cfg);
      if (t.landmark.kind !== 'forest') {
        continue;
      }
      const lm = t.landmark;
      const inside = t.decorations.filter(
        (d) =>
          (d.sprite === TerrainSprite.TreeA || d.sprite === TerrainSprite.TreeB) &&
          Math.hypot(d.x - lm.x, d.y - lm.y) <= lm.r,
      );
      expect(inside.length).toBeGreaterThan(25);
    }
  });

  it('produces a populated world within the decorated extent', () => {
    const t = generateTerrain(7, cfg);
    expect(t.fields.length).toBeGreaterThanOrEqual(10);
    expect(t.fields.length).toBeLessThanOrEqual(18);
    expect(t.decorations.length).toBeGreaterThan(80);
    for (const d of t.decorations) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(TERRAIN_EXTENT);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(TERRAIN_EXTENT);
    }
    expect(Math.abs(t.road.offset)).toBeGreaterThanOrEqual(100);
  });

  it('sorts decorations by y for painter-order drawing', () => {
    const t = generateTerrain(11, cfg);
    for (let i = 1; i < t.decorations.length; i++) {
      expect(t.decorations[i].y).toBeGreaterThanOrEqual(t.decorations[i - 1].y);
    }
  });

  it('always places exactly one windsock and one tent', () => {
    const t = generateTerrain(5, cfg);
    const count = (sprite: TerrainSprite): number =>
      t.decorations.filter((d) => d.sprite === sprite).length;
    expect(count(TerrainSprite.Windsock)).toBe(1);
    expect(count(TerrainSprite.Tent)).toBe(1);
  });
});

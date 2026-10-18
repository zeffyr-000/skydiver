import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from './config';
import {
  distanceToPolyline,
  generateTerrain,
  mulberry32,
  PROP_SIZE,
  TERRAIN_EXTENT,
} from './ground';

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
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
  const DRESSING = new Set(['marquee', 'grandstand', 'spectator', 'windsock']);

  it('is deterministic per seed', () => {
    expect(generateTerrain(42, cfg)).toEqual(generateTerrain(42, cfg));
    expect(generateTerrain(42, cfg)).not.toEqual(generateTerrain(43, cfg));
  });

  it('keeps scenery out of the target area so the bullseye stays readable', () => {
    for (const seed of seeds) {
      for (const p of generateTerrain(seed, cfg).props) {
        if (DRESSING.has(p.kind)) {
          continue; // the drop-zone dressing sits deliberately at the ring edge
        }
        expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(cfg.targetRadius + 15);
      }
    }
  });

  it('dresses every drop zone: one marquee, one grandstand, one windsock and a crowd', () => {
    for (const seed of seeds) {
      const props = generateTerrain(seed, cfg).props;
      const count = (kind: string) => props.filter((p) => p.kind === kind).length;
      expect(count('marquee')).toBe(1);
      expect(count('grandstand')).toBe(1);
      expect(count('windsock')).toBe(1);
      expect(count('spectator')).toBeGreaterThanOrEqual(14);
    }
  });

  it('rolls one landmark per jump and hits all three kinds across seeds', () => {
    const kinds = new Set(seeds.map((seed) => generateTerrain(seed, cfg).landmark.kind));
    expect(kinds).toEqual(new Set(['lake', 'airstrip', 'forest']));
  });

  it('keeps the landmark clear of the target', () => {
    for (const seed of seeds) {
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

  it('a forest landmark is full of trees; an airstrip gets its hangar', () => {
    for (const seed of seeds) {
      const t = generateTerrain(seed, cfg);
      const lm = t.landmark;
      if (lm.kind === 'forest') {
        const inside = t.props.filter(
          (p) =>
            (p.kind === 'pine' || p.kind === 'oak') && Math.hypot(p.x - lm.x, p.y - lm.y) <= lm.r,
        );
        expect(inside.length).toBeGreaterThan(25);
      } else if (lm.kind === 'airstrip') {
        expect(t.props.some((p) => p.kind === 'hangar')).toBe(true);
      }
    }
  });

  it('keeps rivers well clear of the target and props out of the water', () => {
    let rivers = 0;
    for (const seed of seeds) {
      const t = generateTerrain(seed, cfg);
      if (!t.river) continue;
      rivers++;
      expect(distanceToPolyline(0, 0, t.river.points)).toBeGreaterThan(cfg.targetRadius + 50);
      for (const p of t.props) {
        if (p.kind === 'oak' || p.kind === 'bush' || p.kind === 'rock' || p.kind === 'bale') {
          expect(distanceToPolyline(p.x, p.y, t.river.points)).toBeGreaterThan(t.river.width / 2);
        }
      }
    }
    expect(rivers).toBeGreaterThan(5); // some drop zones have one…
    expect(rivers).toBeLessThan(seeds.length); // …not all
  });

  it('builds villages with a windmill on some drop zones', () => {
    const withVillage = seeds.map((s) => generateTerrain(s, cfg)).filter((t) => t.village);
    expect(withVillage.length).toBeGreaterThan(10);
    for (const t of withVillage) {
      expect(t.props.filter((p) => p.kind === 'house').length).toBeGreaterThanOrEqual(5);
      expect(t.props.some((p) => p.kind === 'windmill')).toBe(true);
    }
  });

  it('hangs balloons low over the field and clouds in the free-fall band', () => {
    const t = generateTerrain(7, cfg);
    const balloons = t.sky.filter((k) => k.kind === 'balloon');
    const clouds = t.sky.filter((k) => k.kind === 'cloud');
    expect(balloons.length).toBeGreaterThanOrEqual(2);
    expect(clouds.length).toBeGreaterThanOrEqual(7);
    for (const b of balloons) expect(b.z).toBeLessThan(cfg.pullCeiling + 100);
    for (const c of clouds) expect(c.z).toBeGreaterThan(cfg.pullCeiling);
  });

  it('produces a populated world within the hand-placed extent', () => {
    const t = generateTerrain(7, cfg);
    expect(t.fields.length).toBeGreaterThanOrEqual(10);
    expect(t.fields.length).toBeLessThanOrEqual(18);
    expect(t.props.length + t.ponds.length).toBeGreaterThan(100);
    for (const p of t.props) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(TERRAIN_EXTENT + 80);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(TERRAIN_EXTENT + 80);
      expect(PROP_SIZE[p.kind]).toBeDefined();
    }
    expect(Math.abs(t.road.offset)).toBeGreaterThanOrEqual(100);
  });
});

/**
 * Deterministic ground decoration for a jump. Pure data — no Angular, no DOM:
 * `generateTerrain(seed, cfg)` always returns the same layout for the same
 * seed, so the renderer can cache it per jump (`GameState.groundSeed`) and
 * tests can snapshot it.
 *
 * World units are metres; the bullseye centre is (0, 0). The view spans at
 * most ~1200m at exit altitude, so everything lives within ±EXTENT of origin.
 */

import { TerrainSprite } from './sprites';
import type { GameConfig } from './types';

/** Half-size of the decorated square around the target (metres). */
export const TERRAIN_EXTENT = 700;

/** Mulberry32 — tiny seeded PRNG, plenty for decoration placement. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A rectangular patch of farmland in one of a few muted tints. */
export interface FieldPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tint index into the renderer's field palette. */
  tint: number;
}

export interface RoadSpec {
  /** 'h' runs along X at y = offset; 'v' runs along Y at x = offset. */
  orientation: 'h' | 'v';
  offset: number;
  widthM: number;
}

export interface Decoration {
  sprite: TerrainSprite;
  x: number;
  y: number;
  /** Drawn size in metres (sprite is square). */
  sizeM: number;
}

/** One big landmark per jump — a place, not a sprinkle. */
export type Landmark =
  | { kind: 'lake'; x: number; y: number; rx: number; ry: number }
  | {
      kind: 'airstrip';
      orientation: 'h' | 'v';
      /** Centre of the strip. */
      x: number;
      y: number;
      lengthM: number;
      widthM: number;
    }
  | { kind: 'forest'; x: number; y: number; r: number };

export interface Terrain {
  fields: FieldPatch[];
  road: RoadSpec;
  landmark: Landmark;
  /** Scenery, pre-sorted by y for painter's-order drawing. */
  decorations: Decoration[];
}

const SCENERY: { sprite: TerrainSprite; sizeM: number }[] = [
  { sprite: TerrainSprite.TreeA, sizeM: 14 },
  { sprite: TerrainSprite.TreeB, sizeM: 11 },
  { sprite: TerrainSprite.Bush, sizeM: 7 },
  { sprite: TerrainSprite.Rock, sizeM: 6 },
  { sprite: TerrainSprite.HayBale, sizeM: 5 },
  { sprite: TerrainSprite.Pond, sizeM: 18 },
];

// Scenery weights per biome (indexed like SCENERY: treeA, treeB, bush, rock,
// hay, pond). Each jump rolls one, so consecutive drop zones read differently.
const BIOME_WEIGHTS: number[][] = [
  [3, 3, 2, 1, 2, 1], // meadow — the original balanced mix
  [6, 5, 3, 1, 1, 1], // woodland
  [2, 2, 3, 2, 1, 4], // wetland
  [2, 1, 2, 1, 6, 1], // farmstead
];

export function generateTerrain(seed: number, cfg: GameConfig): Terrain {
  const rng = mulberry32(seed);
  const keepOut = cfg.targetRadius + 15; // the target stays the visual focus

  // --- Farmland patchwork ---
  const fields: FieldPatch[] = [];
  const fieldCount = 10 + Math.floor(rng() * 9);
  for (let i = 0; i < fieldCount; i++) {
    const w = 80 + rng() * 170;
    const h = 80 + rng() * 170;
    fields.push({
      x: -TERRAIN_EXTENT + rng() * (2 * TERRAIN_EXTENT - w),
      y: -TERRAIN_EXTENT + rng() * (2 * TERRAIN_EXTENT - h),
      w,
      h,
      tint: Math.floor(rng() * 4),
    });
  }

  // --- One straight road, kept away from the target ---
  const orientation = rng() < 0.5 ? 'h' : 'v';
  const side = rng() < 0.5 ? -1 : 1;
  const road: RoadSpec = {
    orientation,
    offset: side * (100 + rng() * (TERRAIN_EXTENT * 0.6 - 100)),
    widthM: 6,
  };

  // --- Landmark: each jump features one big place — lake, airstrip or forest ---
  const clampTo = (v: number, margin: number) =>
    Math.max(-(TERRAIN_EXTENT - margin), Math.min(TERRAIN_EXTENT - margin, v));
  const landmarkRoll = rng();
  const landmarkAngle = rng() * Math.PI * 2;
  let landmark: Landmark;
  const forestTrees: Decoration[] = [];
  if (landmarkRoll < 1 / 3) {
    const rx = 90 + rng() * 70;
    const ry = 60 + rng() * 50;
    const dist = keepOut + Math.max(rx, ry) + 60 + rng() * 200;
    landmark = {
      kind: 'lake',
      x: clampTo(Math.cos(landmarkAngle) * dist, rx),
      y: clampTo(Math.sin(landmarkAngle) * dist, ry),
      rx,
      ry,
    };
  } else if (landmarkRoll < 2 / 3) {
    const orientation: 'h' | 'v' = rng() < 0.5 ? 'h' : 'v';
    const offSide = rng() < 0.5 ? -1 : 1;
    const lengthM = 220 + rng() * 120;
    const widthM = 20;
    const offset = offSide * (keepOut + 40 + rng() * 220);
    const along = (rng() * 2 - 1) * 200;
    landmark = {
      kind: 'airstrip',
      orientation,
      x: orientation === 'h' ? clampTo(along, lengthM / 2) : offset,
      y: orientation === 'h' ? offset : clampTo(along, lengthM / 2),
      lengthM,
      widthM,
    };
  } else {
    const r = 110 + rng() * 70;
    const dist = keepOut + r + 40 + rng() * 180;
    const fx = clampTo(Math.cos(landmarkAngle) * dist, r);
    const fy = clampTo(Math.sin(landmarkAngle) * dist, r);
    landmark = { kind: 'forest', x: fx, y: fy, r };
    const treeCount = 40 + Math.floor(rng() * 25);
    for (let i = 0; i < treeCount; i++) {
      const a = rng() * Math.PI * 2;
      const d = r * Math.sqrt(rng()) * 0.92; // uniform over the disc, inside the floor
      const x = fx + Math.cos(a) * d;
      const y = fy + Math.sin(a) * d;
      if (Math.hypot(x, y) < keepOut) continue;
      forestTrees.push({
        sprite: rng() < 0.55 ? TerrainSprite.TreeA : TerrainSprite.TreeB,
        x,
        y,
        sizeM: 11 + rng() * 5,
      });
    }
  }

  // --- Scenery: biome-weighted, clustered into groves with open clearings ---
  const weights = BIOME_WEIGHTS[Math.floor(rng() * BIOME_WEIGHTS.length)];
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const clusters = Array.from({ length: 2 + Math.floor(rng() * 2) }, () => ({
    x: (rng() * 2 - 1) * (TERRAIN_EXTENT - 160),
    y: (rng() * 2 - 1) * (TERRAIN_EXTENT - 160),
    r: 60 + rng() * 100,
  }));

  const decorations: Decoration[] = [];
  let guard = 0;
  while (decorations.length < 100 && guard < 1000) {
    guard++;
    let x: number;
    let y: number;
    if (rng() < 0.55) {
      // Grove sample: triangular falloff around a cluster centre.
      const c = clusters[Math.floor(rng() * clusters.length)];
      x = c.x + (rng() + rng() - 1) * c.r;
      y = c.y + (rng() + rng() - 1) * c.r;
    } else {
      x = (rng() * 2 - 1) * TERRAIN_EXTENT;
      y = (rng() * 2 - 1) * TERRAIN_EXTENT;
    }
    if (Math.abs(x) > TERRAIN_EXTENT || Math.abs(y) > TERRAIN_EXTENT) continue;
    if (Math.hypot(x, y) < keepOut) continue;
    let pick = rng() * totalWeight;
    const index = weights.findIndex((w) => (pick -= w) < 0);
    const kind = SCENERY[Math.max(0, index)];
    decorations.push({ sprite: kind.sprite, x, y, sizeM: kind.sizeM });
  }

  // --- Drop-zone dressing just outside the target ring ---
  const ringR = cfg.targetRadius + 8;
  const tentAngle = rng() * Math.PI * 2;
  decorations.push({
    sprite: TerrainSprite.Tent,
    x: Math.cos(tentAngle) * ringR,
    y: Math.sin(tentAngle) * ringR,
    sizeM: 10,
  });
  const crowd = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < crowd; i++) {
    const a = tentAngle + (rng() - 0.5) * 1.6;
    const r = ringR + rng() * 12;
    decorations.push({
      sprite: rng() < 0.5 ? TerrainSprite.SpectatorA : TerrainSprite.SpectatorB,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      sizeM: 3,
    });
  }
  decorations.push({
    sprite: TerrainSprite.Windsock,
    x: Math.cos(tentAngle + Math.PI) * ringR,
    y: Math.sin(tentAngle + Math.PI) * ringR,
    sizeM: 6,
  });

  decorations.push(...forestTrees);
  decorations.sort((a, b) => a.y - b.y);
  return { fields, road, landmark, decorations };
}

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

export interface Terrain {
  fields: FieldPatch[];
  road: RoadSpec;
  /** Scenery, pre-sorted by y for painter's-order drawing. */
  decorations: Decoration[];
}

const SCENERY: { sprite: TerrainSprite; sizeM: number; weight: number }[] = [
  { sprite: TerrainSprite.TreeA, sizeM: 14, weight: 3 },
  { sprite: TerrainSprite.TreeB, sizeM: 11, weight: 3 },
  { sprite: TerrainSprite.Bush, sizeM: 7, weight: 2 },
  { sprite: TerrainSprite.Rock, sizeM: 6, weight: 1 },
  { sprite: TerrainSprite.HayBale, sizeM: 5, weight: 2 },
  { sprite: TerrainSprite.Pond, sizeM: 18, weight: 1 },
];

export function generateTerrain(seed: number, cfg: GameConfig): Terrain {
  const rng = mulberry32(seed);
  const keepOut = cfg.targetRadius + 15; // the target stays the visual focus

  // --- Farmland patchwork ---
  const fields: FieldPatch[] = [];
  const fieldCount = 12 + Math.floor(rng() * 5);
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

  // --- Scenery: rejection-sampled outside the keep-out circle ---
  const totalWeight = SCENERY.reduce((s, k) => s + k.weight, 0);
  const decorations: Decoration[] = [];
  let guard = 0;
  while (decorations.length < 100 && guard < 1000) {
    guard++;
    const x = (rng() * 2 - 1) * TERRAIN_EXTENT;
    const y = (rng() * 2 - 1) * TERRAIN_EXTENT;
    if (Math.hypot(x, y) < keepOut) continue;
    let pick = rng() * totalWeight;
    const kind = SCENERY.find((k) => (pick -= k.weight) < 0) ?? SCENERY[0];
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

  decorations.sort((a, b) => a.y - b.y);
  return { fields, road, decorations };
}

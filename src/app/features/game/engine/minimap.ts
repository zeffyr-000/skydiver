import { generateTerrain, type Terrain } from './ground';
import {
  buildGroundTexture,
  hexToPacked,
  levelForFootprint,
  sampleGround,
  shade,
  type GroundTexture,
} from './ground-texture';
import { forwardOf, planePosition, TARGET_PASS_TIME, targetAt } from './physics';
import { Raster } from './raster';
import type { GameConfig, GameState } from './types';

/**
 * The briefing's drop-zone map: the jump's own ground texture seen from
 * straight above (north up, centred on the target), overlaid with the plan —
 * the run line and its green-light window, the hoops, the target (or the
 * wagon's road) and the wind. Pure: paints into a Raster.
 */

const C = {
  run: hexToPacked('#c1352b'),
  spot: hexToPacked('#7bd05a'),
  ring: hexToPacked('#ffcc33'),
  ink: hexToPacked('#11161f'),
  white: hexToPacked('#fff7e0'),
  red: hexToPacked('#e0503f'),
  brass: hexToPacked('#d9a441'),
  building: hexToPacked('#7e2622'),
  tree: hexToPacked('#1f3320'),
};

/** A small texture pyramid is plenty for a map (and builds fast). */
const MAP_LEVELS: [number, number][] = [
  [2, 512],
  [8, 256],
];

export interface MinimapWorld {
  terrain: Terrain;
  texture: GroundTexture;
}

export function minimapWorld(s: GameState, cfg: GameConfig): MinimapWorld {
  const terrain = generateTerrain(s.groundSeed, cfg);
  return { terrain, texture: buildGroundTexture(terrain, cfg, s.groundSeed, MAP_LEVELS) };
}

/** Paint the map of `s` (a fresh jump) over `spanM` metres into `r`. */
export function paintMinimap(
  r: Raster,
  s: GameState,
  cfg: GameConfig,
  world: MinimapWorld,
  spanM = 900,
): void {
  const { w, h } = r;
  const mpp = spanM / Math.max(w, h);
  const level = levelForFootprint(world.texture, mpp);
  const toX = (wx: number) => w / 2 + wx / mpp;
  const toY = (wy: number) => h / 2 + wy / mpp;

  for (let y = 0; y < h; y++) {
    const wy = (y + 0.5 - h / 2) * mpp;
    for (let x = 0; x < w; x++) {
      const c = sampleGround(world.texture, (x + 0.5 - w / 2) * mpp, wy, level);
      r.px[y * w + x] = shade(c, 0.92);
    }
  }

  // Buildings and trees as dots (they read as the place's landmarks).
  for (const p of world.terrain.props) {
    const building = [
      'barn',
      'house',
      'windmill',
      'hangar',
      'grandstand',
      'marquee',
      'lighthouse',
      'ferris',
      'bigtop',
      'church',
      'watertower',
      'huts',
      'bessonneau',
    ].includes(p.kind);
    if (building || p.kind === 'oak' || p.kind === 'pine' || p.kind === 'poplar') {
      r.plot(toX(p.x), toY(p.y), building ? C.building : C.tree);
      if (building) r.plot(toX(p.x) + 1, toY(p.y), C.building);
    }
  }

  // The target — or the wagon's road with its direction of travel.
  if (cfg.targetSpeed > 0) {
    const a = targetAt(cfg, 0);
    const b = targetAt(cfg, TARGET_PASS_TIME * 2);
    dashed(r, toX(a.x), toY(a.y), toX(b.x), toY(b.y), C.white, 4);
    const at = targetAt(cfg, TARGET_PASS_TIME);
    const f = forwardOf(cfg.targetHeading);
    arrowHead(r, toX(at.x) + f.x * 9, toY(at.y) + f.y * 9, f.x, f.y, C.red);
    r.disc(toX(at.x), toY(at.y), 3, C.red);
    r.disc(toX(at.x), toY(at.y), 1.2, C.white);
  } else {
    const rad = Math.max(3, cfg.targetRadius / mpp);
    r.circle(toX(0), toY(0), rad + 1, C.ink);
    r.circle(toX(0), toY(0), rad, C.white);
    r.disc(toX(0), toY(0), Math.max(1.5, rad * 0.3), C.red);
  }

  // Hoops, in order.
  for (const ring of s.rings) {
    const rr = Math.max(2, ring.radius / mpp);
    r.circle(toX(ring.x), toY(ring.y), rr + 1, C.ink);
    r.circle(toX(ring.x), toY(ring.y), rr, C.ring);
  }

  // The jump run: the whole line, its green-light window, the exit spot.
  const total = cfg.spotLeadTime + cfg.spotOvertime;
  const start = planePosition(s, cfg, 0);
  const end = planePosition(s, cfg, total);
  dashed(r, toX(start.x), toY(start.y), toX(end.x), toY(end.y), C.run, 3);
  const f = forwardOf(s.planeHeading);
  const g0 = { x: s.spotX - f.x * cfg.spotWindow, y: s.spotY - f.y * cfg.spotWindow };
  const g1 = { x: s.spotX + f.x * cfg.spotWindow, y: s.spotY + f.y * cfg.spotWindow };
  r.line(toX(g0.x), toY(g0.y), toX(g1.x), toY(g1.y), C.spot, 2);
  arrowHead(r, toX(end.x), toY(end.y), f.x, f.y, C.run);
  r.disc(toX(s.spotX), toY(s.spotY), 2.5, C.ink);
  r.disc(toX(s.spotX), toY(s.spotY), 1.5, C.spot);

  // Wind arrow in the corner (blowing toward).
  const wx = w - 14;
  const wyy = 14;
  r.disc(wx, wyy, 11, C.ink);
  r.circle(wx, wyy, 11, C.brass);
  const speed = Math.hypot(s.windBaseX, s.windBaseY);
  if (speed > 0.1) {
    const ux = s.windBaseX / speed;
    const uy = s.windBaseY / speed;
    r.line(wx - ux * 7, wyy - uy * 7, wx + ux * 4, wyy + uy * 4, C.white, 2);
    arrowHead(r, wx + ux * 6, wyy + uy * 6, ux, uy, C.white);
  }
}

function dashed(
  r: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: number,
  dash: number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(len / dash));
  for (let i = 0; i < n; i += 2) {
    const a = i / n;
    const b = Math.min(1, (i + 1) / n);
    r.line(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, c, 2);
  }
}

function arrowHead(r: Raster, x: number, y: number, ux: number, uy: number, c: number): void {
  const px = -uy;
  const py = ux;
  r.tri(
    x + ux * 4,
    y + uy * 4,
    x - ux * 3 + px * 4,
    y - uy * 3 + py * 4,
    x - ux * 3 - px * 4,
    y - uy * 3 - py * 4,
    c,
  );
}

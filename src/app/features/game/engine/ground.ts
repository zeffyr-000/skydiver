/**
 * Deterministic world layout for a jump. Pure data — no Angular, no DOM:
 * `generateTerrain(seed, cfg)` always returns the same drop zone for the same
 * seed, so the renderer can cache it per jump (`GameState.groundSeed`) and
 * tests can snapshot it.
 *
 * World units are metres; the bullseye centre is (0, 0). Flat things (fields,
 * road, river, ponds, the landmark's ground) are painted into the ground
 * texture; standing things are `props` (voxel-baked sprites); `sky` holds the
 * balloons and clouds.
 */

import type { GameConfig } from './types';

/** Half-size of the hand-placed area around the target (metres). */
export const TERRAIN_EXTENT = 700;

/** Low golden-hour sun: bearing (rad, clockwise from north) and elevation (rad). */
export const SUN_HEADING = 4.3;
export const SUN_ELEVATION = 0.07;

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

export type PropKind =
  | 'oak'
  | 'poplar'
  | 'pine'
  | 'bush'
  | 'rock'
  | 'bale'
  | 'marquee'
  | 'spectator'
  | 'windsock'
  | 'barn'
  | 'house'
  | 'windmill'
  | 'hangar'
  | 'grandstand'
  | 'lighthouse'
  | 'ferris'
  | 'bigtop'
  | 'car'
  | 'watertower'
  | 'church'
  | 'huts'
  | 'pylon'
  | 'bessonneau'
  | 'jenny';

/** Real height and shadow radius (m) per prop — for the painted golden-hour shadows. */
export const PROP_SIZE: Record<PropKind, { height: number; radius: number }> = {
  oak: { height: 8, radius: 2.8 },
  poplar: { height: 11, radius: 1.3 },
  pine: { height: 10, radius: 1.9 },
  bush: { height: 2, radius: 1.2 },
  rock: { height: 1.3, radius: 0.9 },
  bale: { height: 1.6, radius: 0.8 },
  marquee: { height: 4.5, radius: 2.6 },
  spectator: { height: 1.8, radius: 0.3 },
  windsock: { height: 5, radius: 0.2 },
  barn: { height: 6.5, radius: 4 },
  house: { height: 6, radius: 3 },
  windmill: { height: 14, radius: 2.2 },
  hangar: { height: 5.2, radius: 5.5 },
  grandstand: { height: 5, radius: 5.5 },
  lighthouse: { height: 16, radius: 2 },
  ferris: { height: 15, radius: 2 },
  bigtop: { height: 9.6, radius: 6 },
  car: { height: 1.9, radius: 1.2 },
  watertower: { height: 13, radius: 2.2 },
  church: { height: 19, radius: 4 },
  huts: { height: 3.5, radius: 3.5 },
  pylon: { height: 10.5, radius: 0.8 },
  bessonneau: { height: 8.3, radius: 9 },
  jenny: { height: 3.6, radius: 5 },
};

/** A standing object on the ground. */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Heading the object faces (rad, clockwise from north). */
  yaw: number;
  /** Size multiplier (variety). */
  scale: number;
  /** Sheet variant (the spectator's Sunday best, the Ford's hood…). */
  variant: number;
}

/** A rectangular patch of farmland in one of a few crops. */
export interface FieldPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Crop index into the ground texture's field palette. */
  tint: number;
}

export interface RoadSpec {
  /** 'h' runs along X at y = offset; 'v' runs along Y at x = offset. */
  orientation: 'h' | 'v';
  offset: number;
  widthM: number;
}

export interface Pond {
  x: number;
  y: number;
  r: number;
}

/** A meandering river, as a polyline of centre points. */
export interface River {
  points: [number, number][];
  width: number;
}

/** Something hanging in the sky: a hot-air balloon or a cumulus. */
export interface SkyProp {
  kind: 'balloon' | 'cloud';
  x: number;
  y: number;
  /** Height above the ground (m). */
  z: number;
  variant: number;
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

/**
 * The sea (seaside venue): everything past a wavy shoreline. `nx, ny` is the
 * unit direction out to sea, `d` the shoreline's distance from the target.
 */
export interface Sea {
  nx: number;
  ny: number;
  d: number;
  amp: number;
  phase: number;
}

/** Signed distance into the sea (m): > 0 is water, < 0 is land. */
export function seaDepth(sea: Sea, x: number, y: number): number {
  const along = -x * sea.ny + y * sea.nx;
  return x * sea.nx + y * sea.ny - (sea.d + sea.amp * Math.sin(along / 95 + sea.phase));
}

/** Width of the sand beach along the shore (m). */
export const BEACH_M = 26;

export interface Terrain {
  fields: FieldPatch[];
  road: RoadSpec;
  landmark: Landmark;
  river: River | null;
  ponds: Pond[];
  props: Prop[];
  sky: SkyProp[];
  /** Where the village sits (null when this drop zone has none). */
  village: { x: number; y: number } | null;
  /** The sea, at the seaside venue. */
  sea: Sea | null;
}

/** Spectator styles in the baked sheet (suits, dresses, a child…). */
export const CROWD_STYLES = 8;

type Scenery = PropKind | 'pond';
const SCENERY: Scenery[] = ['oak', 'poplar', 'pine', 'bush', 'rock', 'bale', 'pond'];

// Scenery weights per biome (indexed like SCENERY). Each jump rolls one, so
// consecutive drop zones read differently.
const BIOME_WEIGHTS: number[][] = [
  [4, 3, 1, 2, 1, 2, 1], // meadow
  [5, 2, 6, 3, 1, 0, 1], // woodland
  [3, 4, 1, 3, 2, 1, 4], // wetland
  [3, 3, 0, 2, 1, 6, 1], // farmstead
];

/** Heading (clockwise from north) from (x, y) toward (tx, ty). */
function headingTo(x: number, y: number, tx: number, ty: number): number {
  return Math.atan2(tx - x, -(ty - y));
}

/** Distance from a point to a polyline. */
export function distanceToPolyline(x: number, y: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
  }
  return best;
}

export function generateTerrain(seed: number, cfg: GameConfig): Terrain {
  const rng = mulberry32(seed);
  const R = cfg.targetRadius;
  const keepOut = R + 25; // the target stays the visual focus
  const props: Prop[] = [];
  const ponds: Pond[] = [];
  const rand = (a: number, b: number) => a + (b - a) * rng();

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

  // --- One straight road, kept away from the target — unless the target is a
  // wagon, which drives down it right through the drop zone ---
  const moving = cfg.targetSpeed > 0;
  const orientation = rng() < 0.5 ? 'h' : 'v';
  const side = rng() < 0.5 ? -1 : 1;
  const roadOffset = side * (100 + rng() * (TERRAIN_EXTENT * 0.6 - 100));
  const road: RoadSpec = moving
    ? { orientation: Math.abs(Math.sin(cfg.targetHeading)) > 0.5 ? 'h' : 'v', offset: 0, widthM: 7 }
    : { orientation, offset: roadOffset, widthM: 6 };
  const onRoad = (x: number, y: number, margin: number) =>
    Math.abs((road.orientation === 'h' ? y : x) - road.offset) < road.widthM / 2 + margin;

  // --- Landmark: a lake, an airstrip or a forest ---
  const clampTo = (v: number, margin: number) =>
    Math.max(-(TERRAIN_EXTENT - margin), Math.min(TERRAIN_EXTENT - margin, v));
  const venue = cfg.venue;
  // The lake and airfield venues are built around their landmark, close by.
  const rolled = rng();
  const landmarkRoll = venue === 'lake' ? 0.1 : venue === 'airfield' ? 0.5 : rolled;
  const close = venue === 'lake' || venue === 'airfield';
  const landmarkAngle = rng() * Math.PI * 2;
  let landmark: Landmark;
  if (landmarkRoll < 1 / 3) {
    const rx = 90 + rng() * 70;
    const ry = 60 + rng() * 50;
    const dist = keepOut + Math.max(rx, ry) + (close ? 15 + rng() * 40 : 60 + rng() * 200);
    landmark = {
      kind: 'lake',
      x: clampTo(Math.cos(landmarkAngle) * dist, rx),
      y: clampTo(Math.sin(landmarkAngle) * dist, ry),
      rx,
      ry,
    };
  } else if (landmarkRoll < 2 / 3) {
    const o: 'h' | 'v' = rng() < 0.5 ? 'h' : 'v';
    const offSide = rng() < 0.5 ? -1 : 1;
    const lengthM = 220 + rng() * 120;
    const widthM = 20;
    const offset = offSide * (keepOut + (close ? 30 + rng() * 30 : 40 + rng() * 220));
    const along = (rng() * 2 - 1) * 200;
    landmark = {
      kind: 'airstrip',
      orientation: o,
      x: o === 'h' ? clampTo(along, lengthM / 2) : offset,
      y: o === 'h' ? offset : clampTo(along, lengthM / 2),
      lengthM,
      widthM,
    };
    // The jump ship's hangar by the threshold.
    const end =
      o === 'h'
        ? [landmark.x - lengthM / 2 + 20, offset + Math.sign(offset) * 28]
        : [offset + Math.sign(offset) * 28, landmark.y - lengthM / 2 + 20];
    props.push({
      kind: 'hangar',
      x: end[0],
      y: end[1],
      yaw: headingTo(end[0], end[1], landmark.x, landmark.y),
      scale: 1,
      variant: 0,
    });
  } else {
    const r = 110 + rng() * 70;
    const dist = keepOut + r + 40 + rng() * 180;
    const fx = clampTo(Math.cos(landmarkAngle) * dist, r);
    const fy = clampTo(Math.sin(landmarkAngle) * dist, r);
    landmark = { kind: 'forest', x: fx, y: fy, r };
    const treeCount = 45 + Math.floor(rng() * 25);
    for (let i = 0; i < treeCount; i++) {
      const a = rng() * Math.PI * 2;
      const d = r * Math.sqrt(rng()) * 0.92;
      const x = fx + Math.cos(a) * d;
      const y = fy + Math.sin(a) * d;
      const kind = rng() < 0.55 ? 'pine' : 'oak';
      if (Math.hypot(x, y) < keepOut) continue;
      props.push({ kind, x, y, yaw: 0, scale: rand(0.85, 1.2), variant: 0 });
    }
  }

  // --- A river, sometimes: a meander kept well clear of the target ---
  let river: River | null = null;
  if (rng() < 0.45) {
    const alongX = rng() < 0.5;
    const base = (rng() < 0.5 ? -1 : 1) * rand(220, 520);
    const amp = rand(40, 90);
    const ph1 = rng() * Math.PI * 2;
    const ph2 = rng() * Math.PI * 2;
    const points: [number, number][] = [];
    for (let t = -1600; t <= 1600; t += 40) {
      const off = base + amp * Math.sin(t / 170 + ph1) + amp * 0.35 * Math.sin(t / 61 + ph2);
      points.push(alongX ? [t, off] : [off, t]);
    }
    river = { points, width: rand(8, 13) };
  }
  // --- The sea, at the seaside: a wavy shoreline past a sandy beach ---
  let sea: Sea | null = null;
  if (venue === 'seaside') {
    const a = rng() * Math.PI * 2;
    sea = {
      nx: Math.cos(a),
      ny: Math.sin(a),
      d: rand(130, 200),
      amp: rand(15, 35),
      phase: rng() * 6.3,
    };
  }
  const wet = (x: number, y: number, margin: number) =>
    (!!river && distanceToPolyline(x, y, river.points) < river.width / 2 + margin) ||
    (!!sea && seaDepth(sea, x, y) > -BEACH_M - margin);

  // --- Scenery: biome-weighted, clustered into groves with open clearings ---
  const biome =
    venue === 'lake' ? 1 : venue === 'county' ? Math.floor(rng() * BIOME_WEIGHTS.length) : 0;
  const weights = BIOME_WEIGHTS[biome];
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const clusters = Array.from({ length: 2 + Math.floor(rng() * 2) }, () => ({
    x: (rng() * 2 - 1) * (TERRAIN_EXTENT - 160),
    y: (rng() * 2 - 1) * (TERRAIN_EXTENT - 160),
    r: 60 + rng() * 100,
  }));
  let placed = 0;
  for (let guard = 0; placed < 120 && guard < 1200; guard++) {
    let x: number;
    let y: number;
    if (rng() < 0.55) {
      const c = clusters[Math.floor(rng() * clusters.length)];
      x = c.x + (rng() + rng() - 1) * c.r;
      y = c.y + (rng() + rng() - 1) * c.r;
    } else {
      x = (rng() * 2 - 1) * TERRAIN_EXTENT;
      y = (rng() * 2 - 1) * TERRAIN_EXTENT;
    }
    let pick = rng() * totalWeight;
    const kind =
      SCENERY[
        Math.max(
          0,
          weights.findIndex((w) => (pick -= w) < 0),
        )
      ];
    const scale = rand(0.8, 1.25);
    const yaw = rng() * Math.PI * 2;
    if (Math.abs(x) > TERRAIN_EXTENT || Math.abs(y) > TERRAIN_EXTENT) continue;
    if (Math.hypot(x, y) < keepOut || wet(x, y, 4) || (moving && onRoad(x, y, 6))) continue;
    placed++;
    if (kind === 'pond') {
      ponds.push({ x, y, r: 7 + scale * 4 });
    } else {
      props.push({ kind, x, y, yaw, scale, variant: 0 });
    }
  }

  // --- Farmsteads: a barn (sometimes a house) with bales around ---
  const farms = 2 + Math.floor(rng() * 2);
  for (let f = 0; f < farms; f++) {
    const a = rng() * Math.PI * 2;
    const d = rand(180, TERRAIN_EXTENT - 80);
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const yaw = Math.floor(rng() * 4) * (Math.PI / 2) + rand(-0.15, 0.15);
    if (wet(x, y, 12)) continue;
    props.push({ kind: 'barn', x, y, yaw, scale: rand(0.9, 1.15), variant: 0 });
    if (rng() < 0.6) {
      props.push({
        kind: 'house',
        x: x + Math.cos(yaw) * 16,
        y: y + Math.sin(yaw) * 16,
        yaw,
        scale: 1,
        variant: 0,
      });
    }
    const bales = 3 + Math.floor(rng() * 5);
    for (let b = 0; b < bales; b++) {
      props.push({
        kind: 'bale',
        x: x + rand(-30, 30),
        y: y + rand(14, 38) * (rng() < 0.5 ? -1 : 1),
        yaw: rng() * Math.PI * 2,
        scale: 1,
        variant: 0,
      });
    }
  }

  // --- A village strung along the road, with its windmill ---
  let village: { x: number; y: number } | null = null;
  if (rng() < 0.6) {
    let along = (rng() < 0.5 ? -1 : 1) * rand(260, 560);
    const toward = road.orientation === 'h' ? [along, road.offset] : [road.offset, along];
    if (Math.hypot(toward[0], toward[1]) < 250) {
      along = Math.sign(along) * 560;
    }
    const cx = road.orientation === 'h' ? along : road.offset;
    const cy = road.orientation === 'h' ? road.offset : along;
    village = { x: cx, y: cy };
    const houses = 5 + Math.floor(rng() * 4);
    for (let k = 0; k < houses; k++) {
      const s = k % 2 ? 1 : -1;
      const t = (k - houses / 2) * 22 + rand(-4, 4);
      const back = s * rand(14, 20);
      const x = road.orientation === 'h' ? cx + t : cx + back;
      const y = road.orientation === 'h' ? cy + back : cy + t;
      const facing = road.orientation === 'h' ? headingTo(x, y, x, cy) : headingTo(x, y, cx, y);
      props.push({ kind: 'house', x, y, yaw: facing, scale: rand(0.9, 1.1), variant: 0 });
      if (rng() < 0.5) {
        props.push({
          kind: 'poplar',
          x: x + rand(-8, 8),
          y: y + rand(-8, 8) + s * 8,
          yaw: 0,
          scale: rand(0.9, 1.1),
          variant: 0,
        });
      }
    }
    // The windmill stands off the road on dry ground (a few tries).
    let mx = cx;
    let my = cy;
    for (let tries = 0; tries < 8; tries++) {
      const off = rand(40, 90) * (rng() < 0.5 ? -1 : 1);
      const along = rand(-70, 70);
      mx = cx + (road.orientation === 'h' ? along : off);
      my = cy + (road.orientation === 'h' ? off : along);
      if (!wet(mx, my, 8)) break;
    }
    props.push({ kind: 'windmill', x: mx, y: my, yaw: rng() * Math.PI * 2, scale: 1, variant: 0 });
  }

  // --- The drop zone: marquee, grandstand and crowd at the ring, a windsock.
  // Beside the road for a wagon target (its "ring" is the road verge). ---
  const rolledA0 = rng() * Math.PI * 2;
  const a0 = moving
    ? (road.orientation === 'h' ? Math.PI / 2 : 0) + (side > 0 ? Math.PI : 0)
    : rolledA0;
  const Rd = moving ? 26 : R;
  const at = (a: number, d: number) => [Math.cos(a) * d, Math.sin(a) * d] as const;
  const [tx, ty] = at(a0, Rd + 16);
  props.push({ kind: 'marquee', x: tx, y: ty, yaw: 0, scale: 1, variant: 0 });
  const [gx, gy] = at(a0 + 0.75, Rd + 30);
  props.push({
    kind: 'grandstand',
    x: gx,
    y: gy,
    yaw: headingTo(gx, gy, 0, 0),
    scale: 1,
    variant: 0,
  });
  const crowd = 14 + Math.floor(rng() * 8);
  for (let i = 0; i < crowd; i++) {
    const a = a0 + 0.2 + rng() * 1.3;
    const [x, y] = at(a, Rd + 6 + rng() * 8);
    props.push({
      kind: 'spectator',
      x,
      y,
      yaw: headingTo(x, y, 0, 0),
      scale: rand(0.95, 1.05),
      variant: Math.floor(rng() * CROWD_STYLES),
    });
  }
  const [wx, wy] = at(a0 + (moving ? -0.9 : Math.PI), Rd + 10);
  props.push({ kind: 'windsock', x: wx, y: wy, yaw: 0, scale: 1, variant: 0 });

  // The Grand Meeting: stands all round, a second marquee, a bigger crowd.
  if (venue === 'meeting') {
    for (const da of [-0.9, Math.PI + 0.3, Math.PI - 0.6]) {
      const [x, y] = at(a0 + da, Rd + 32 + rng() * 6);
      props.push({ kind: 'grandstand', x, y, yaw: headingTo(x, y, 0, 0), scale: 1, variant: 0 });
    }
    const [mx, my] = at(a0 + Math.PI + 1.2, Rd + 18);
    props.push({ kind: 'marquee', x: mx, y: my, yaw: 0, scale: 1.1, variant: 0 });
    for (let i = 0; i < 18; i++) {
      const a = a0 + Math.PI - 0.4 + rng() * 1.6;
      const [x, y] = at(a, Rd + 6 + rng() * 9);
      props.push({
        kind: 'spectator',
        x,
        y,
        yaw: headingTo(x, y, 0, 0),
        scale: rand(0.95, 1.05),
        variant: Math.floor(rng() * CROWD_STYLES),
      });
    }
  }
  // The airfield: a second hangar and a windsock by the strip.
  if (venue === 'airfield' && landmark.kind === 'airstrip') {
    const lm = landmark;
    const end =
      lm.orientation === 'h'
        ? [lm.x + lm.lengthM / 2 - 30, lm.y + Math.sign(lm.y) * 30]
        : [lm.x + Math.sign(lm.x) * 30, lm.y + lm.lengthM / 2 - 30];
    props.push({
      kind: 'hangar',
      x: end[0],
      y: end[1],
      yaw: headingTo(end[0], end[1], lm.x, lm.y),
      scale: 1,
      variant: 0,
    });
    props.push({
      kind: 'windsock',
      x: lm.x + (lm.orientation === 'h' ? 0 : -Math.sign(lm.x) * 18),
      y: lm.y + (lm.orientation === 'h' ? -Math.sign(lm.y) * 18 : 0),
      yaw: 0,
      scale: 1,
      variant: 0,
    });
  }
  // The seaside: a lighthouse on the shore.
  if (sea) {
    const along = rand(-220, 220);
    let lx = sea.nx * sea.d - sea.ny * along;
    let ly = sea.ny * sea.d + sea.nx * along;
    const dd = seaDepth(sea, lx, ly);
    lx -= sea.nx * (dd + 12);
    ly -= sea.ny * (dd + 12);
    props.push({ kind: 'lighthouse', x: lx, y: ly, yaw: 0, scale: 1, variant: 0 });
  }

  // --- Period dressing: the crowd's Model Ts and what each venue is known
  // for. It draws from its own stream, so everything above — and every event
  // calibrated on it — stays exactly where it was ---
  const deco = mulberry32(seed ^ 0x51ed270b);
  const drand = (a: number, b: number) => a + (b - a) * deco();
  /** Inside the landmark: the lake, the wood, or on the strip. */
  const onLandmark = (x: number, y: number, r: number): boolean => {
    const lm = landmark;
    if (lm.kind === 'lake') {
      return ((x - lm.x) / (lm.rx + r + 4)) ** 2 + ((y - lm.y) / (lm.ry + r + 4)) ** 2 <= 1;
    }
    if (lm.kind === 'forest') {
      return Math.hypot(x - lm.x, y - lm.y) < lm.r + r;
    }
    const [along, across] = lm.orientation === 'h' ? [x - lm.x, y - lm.y] : [y - lm.y, x - lm.x];
    return Math.abs(along) < lm.lengthM / 2 + r && Math.abs(across) < lm.widthM / 2 + r;
  };
  /** Clear ground for something of radius `r`, `gap` metres from its neighbours. */
  const roomFor = (x: number, y: number, r: number, gap = 2) =>
    Math.hypot(x, y) >= R + 20 + r &&
    Math.abs(x) <= TERRAIN_EXTENT &&
    Math.abs(y) <= TERRAIN_EXTENT &&
    !onRoad(x, y, r + 2) &&
    !onLandmark(x, y, r) &&
    ponds.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 2) &&
    props.every((p) => Math.hypot(p.x - x, p.y - y) > PROP_SIZE[p.kind].radius + r + gap);
  const place = (kind: PropKind, x: number, y: number, yaw: number, variant = 0): boolean => {
    const r = PROP_SIZE[kind].radius;
    // Fords park side by side; everything else keeps its distance.
    if (!roomFor(x, y, r, kind === 'car' ? 0.4 : 2) || wet(x, y, r)) return false;
    props.push({ kind, x, y, yaw, scale: 1, variant });
    return true;
  };
  /** Place facing the target somewhere around bearing `a` (a few tries further round). */
  const placeAround = (kind: PropKind, a: number, d: number): boolean => {
    for (let k = 0; k < 6; k++) {
      const [x, y] = at(a + k * 0.45, d);
      if (place(kind, x, y, headingTo(x, y, 0, 0))) return true;
    }
    return false;
  };
  // The crowd came by Ford: a row parked past the stands (two at a meeting),
  // further round the ring if a pond or the road is in the way.
  for (let row = 0; row < (venue === 'meeting' ? 2 : 1); row++) {
    const d = Rd + 30 + row * 7;
    const cars = venue === 'meeting' ? 9 : 4 + Math.floor(deco() * 4);
    for (const start of [1.75, -0.5, 2.4, -1.3]) {
      let parked = 0;
      for (let i = 0; i < cars; i++) {
        const [x, y] = at(a0 + start + (i * 3.4 + row * 1.7) / d, d);
        const yaw = headingTo(x, y, 0, 0) + drand(-0.2, 0.2);
        if (place('car', x, y, yaw, deco() < 0.6 ? 0 : 1)) parked++;
      }
      if (parked >= 3) break;
    }
  }
  if (venue === 'county') {
    // The county fair: the big wheel and the circus.
    const a = a0 + Math.PI + 0.9;
    const d = Rd + drand(70, 95);
    placeAround('ferris', a, d);
    placeAround('bigtop', a + 0.4, d + 8);
  }
  if (venue === 'meeting') {
    // The air-race course round the field, and the flight line of Jennys.
    for (let k = 0; k < 3; k++) {
      placeAround('pylon', a0 + 0.4 + (k * Math.PI * 2) / 3, drand(170, 210));
    }
    for (let k = 0; k < 3; k++) {
      placeAround('jenny', a0 - 1.55 - k * 0.16, Rd + 70);
    }
  }
  if (landmark.kind === 'airstrip') {
    // Planes parked along the strip; at the airfield, the canvas Bessonneau
    // beside the hangar and a water tower.
    const lm = landmark;
    const h = lm.orientation === 'h';
    const off = Math.sign(h ? lm.y : lm.x);
    const spot = (along: number, side: number): [number, number] =>
      h ? [lm.x + along, lm.y + off * side] : [lm.x + off * side, lm.y + along];
    const planes = venue === 'airfield' ? 3 : 1;
    for (let k = 0; k < planes; k++) {
      const along = -lm.lengthM / 2 + 70 + k * 17;
      const [x, y] = spot(along, 21);
      place('jenny', x, y, headingTo(x, y, ...spot(along, 0)));
    }
    if (venue === 'airfield') {
      const [bx, by] = spot(-lm.lengthM / 2 + 46, 40);
      place('bessonneau', bx, by, headingTo(bx, by, ...spot(-lm.lengthM / 2 + 46, 0)));
      const [qx, qy] = spot(-lm.lengthM / 2 - 4, 46);
      place('watertower', qx, qy, 0);
    }
  }
  if (sea) {
    // Bathing huts in rows on the upper beach, doors to the sea.
    const rows = 2 + Math.floor(deco() * 2);
    for (let k = 0; k < rows; k++) {
      const along = drand(-260, 260);
      let hx = sea.nx * sea.d - sea.ny * along;
      let hy = sea.ny * sea.d + sea.nx * along;
      const dd = seaDepth(sea, hx, hy);
      hx -= sea.nx * (dd + 19);
      hy -= sea.ny * (dd + 19);
      if (roomFor(hx, hy, PROP_SIZE.huts.radius)) {
        const yaw = headingTo(hx, hy, hx + sea.nx, hy + sea.ny);
        props.push({ kind: 'huts', x: hx, y: hy, yaw, scale: 1, variant: 0 });
      }
    }
  }
  if (village) {
    // The village church, set back behind the houses.
    const v = village;
    for (let tries = 0; tries < 4; tries++) {
      const back = (deco() < 0.5 ? -1 : 1) * drand(34, 44);
      const t = drand(-30, 30);
      const x = road.orientation === 'h' ? v.x + t : v.x + back;
      const y = road.orientation === 'h' ? v.y + back : v.y + t;
      const facing = road.orientation === 'h' ? headingTo(x, y, x, v.y) : headingTo(x, y, v.x, y);
      if (place('church', x, y, facing)) break;
    }
  }
  if (venue === 'county' && deco() < 0.6) {
    // A water tower by one of the farms.
    const barn = props.find((p) => p.kind === 'barn');
    if (barn) place('watertower', barn.x + drand(-18, 18), barn.y + drand(-18, 18), 0);
  }

  // --- Sky: a few balloons over the field and a scattered cumulus layer ---
  const sky: SkyProp[] = [];
  const balloons = venue === 'meeting' ? 5 : 2 + Math.floor(rng() * 2);
  for (let i = 0; i < balloons; i++) {
    const [x, y] = at(rng() * Math.PI * 2, rand(140, 600));
    sky.push({ kind: 'balloon', x, y, z: rand(110, 420), variant: i % 3 });
  }
  const clouds = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < clouds; i++) {
    sky.push({
      kind: 'cloud',
      x: rand(-1600, 1600),
      y: rand(-1600, 1600),
      z: rand(480, 820),
      variant: Math.floor(rng() * 3),
    });
  }

  // Nothing stands in the water: drop props in the river or the lake.
  const inLake = (x: number, y: number) =>
    landmark.kind === 'lake' &&
    ((x - landmark.x) / (landmark.rx + 4)) ** 2 + ((y - landmark.y) / (landmark.ry + 4)) ** 2 <= 1;
  const inSea = (x: number, y: number) => !!sea && seaDepth(sea, x, y) > -BEACH_M * 0.5;
  // (The lighthouse and the bathing huts stand on the beach on purpose.)
  const dry = props.filter((p) =>
    p.kind === 'lighthouse'
      ? true
      : p.kind === 'huts'
        ? !inLake(p.x, p.y) && !inSea(p.x, p.y)
        : !wet(p.x, p.y, 3) && !inLake(p.x, p.y) && !inSea(p.x, p.y),
  );

  return { fields, road, landmark, river, ponds, props: dry, sky, village, sea };
}

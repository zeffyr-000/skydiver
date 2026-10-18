import type { BakedName } from './baked-sprites';
import { cameraFor, floorRow, project, rowElevation, type Camera } from './camera';
import {
  BAYER4,
  FOG,
  paintRidges,
  paintSkyRow,
  paintSun,
  skyFrame,
  type SkyFrame,
} from './horizon';
import type { HudFonts, PixelFont } from './font';
import { generateTerrain, PROP_SIZE, type PropKind, type Terrain } from './ground';
import {
  buildGroundTexture,
  DEFAULT_LEVELS,
  hexToPacked,
  levelForFootprint,
  sampleGround,
  WATER_COLORS,
  type GroundTexture,
} from './ground-texture';
import { clamp, forwardOf, planePosition, spotLightAt, targetAt } from './physics';
import { mixPacked, Raster, tinyText, tinyWidth } from './raster';
import { bakedFrame, drawBaked, type BakedAtlas } from './sprites';
import type { GameConfig, GameState, LandingQuality, Ring } from './types';
import { Phase } from './types';

/** Every translatable HUD string; the Game component supplies them (Transloco). */
export const HUD_KEYS = [
  'alt',
  'score',
  'wind',
  'rings',
  'spotRed',
  'spotAmber',
  'spotGreen',
  'jumpPrompt',
  'pullPrompt',
  'pullZone',
  'pullNow',
  'belowDeck',
  'flarePrompt',
  'stall',
  'ringHit',
  'ringMiss',
  'standup',
  'slide',
  'tumble',
  'crash',
  'bullseye',
  'splash',
  'hintPlane',
  'hintFreefall',
  'hintCanopy',
  'tipPlane',
  'tipFreefall',
  'tipPull',
  'tipCanopy',
  'tipFlare',
] as const;
export type HudKey = (typeof HUD_KEYS)[number];
export type HudLabels = Partial<Record<HudKey, string>>;

/** Run-level info the HUD shows but the jump state doesn't know. */
export interface HudRun {
  score: number;
  /** e.g. "JUMP 2/3" (already translated). */
  jump: string;
}

// Canvas colours (palette mirrored from src/styles/_tokens.scss).
const INK = {
  highlight: '#fff7e0',
  parchment: '#e8d8b0',
  brass: '#d9a441',
  red: '#e0503f',
  green: '#7bd05a',
  shadow: '#11161f',
  amber: '#f0b062',
  water: '#8ab8e0',
  brassDark: '#a9781f',
};

// Packed colours for the rasters.
const P = {
  shadow: hexToPacked('#11161f'),
  face: hexToPacked('#1e1d2a'),
  brass: hexToPacked('#d9a441'),
  brassDark: hexToPacked('#a9781f'),
  brassLight: hexToPacked('#f2c866'),
  faceTick: hexToPacked('#5c5870'),
  parchmentDim: hexToPacked('#b8a882'),
  highlight: hexToPacked('#fff7e0'),
  parchment: hexToPacked('#e8d8b0'),
  red: hexToPacked('#c1352b'),
  redHot: hexToPacked('#e0503f'),
  amber: hexToPacked('#e8a35c'),
  green: hexToPacked('#7bd05a'),
  greenDark: hexToPacked('#3a7a2a'),
  gold: hexToPacked('#ffcc33'),
  goldDark: hexToPacked('#8a6a12'),
  line: hexToPacked('#2b1f12'),
  glint: hexToPacked('#fff4d8'),
};

// Distance haze fades the ground into the horizon sky colour. Its range grows
// with the camera's height so the column below stays clear in free fall.
const FOG_MAX = 0.86;
/** Haze blend per dithered step (0..6 sixths), in 1/256ths. */
const FOG_Q = [0, 43, 85, 128, 171, 213, 256];

function fogRange(camZ: number): [number, number] {
  return [200 + camZ * 0.8, 2600 + camZ * 5];
}

/** HUD layout on the 640×360 grid (px; the wind gauge is offset from the centre). */
const HUD = {
  gauge: { x: 42, y: 42, r: 30 },
  spot: { x: 26, y: 112, r: 8 },
  wind: { dx: -52, y: 22, r: 13 },
  /** Edge arrows and the target chevron keep inside these bands. */
  pointerTop: 104,
  pointerBottom: 70,
} as const;

/** Real-world sizes (m). */
const CANOPY_M = 7.5;
/** Height of the canopy rig's visual middle above the harness (m). */
const RIG_MID_M = 3.3;
/** Metres per turn of the altimeter needle (ten ticks of 200 m): a whole jump fits one turn. */
const ALTIMETER_DIAL = 2000;

/** Cumulus volume half-extents (m) for the fly-through whiteout. */
const CLOUD_RADII: [number, number, number] = [30, 22, 14];
const CLOUD_MID_Z = 12;

// 1-pixel stand-ins for props too far away to read as sprites.
const PROP_DOTS: Record<PropKind, number> = {
  oak: hexToPacked('#2c4a1e'),
  poplar: hexToPacked('#365a28'),
  pine: hexToPacked('#1f3320'),
  bush: hexToPacked('#365a28'),
  rock: hexToPacked('#8e8682'),
  bale: hexToPacked('#d0a84a'),
  marquee: hexToPacked('#e8d8b0'),
  spectator: hexToPacked('#c1352b'),
  windsock: hexToPacked('#c1352b'),
  barn: hexToPacked('#7e2622'),
  house: hexToPacked('#bc5e34'),
  windmill: hexToPacked('#8e8682'),
  hangar: hexToPacked('#76786e'),
  grandstand: hexToPacked('#86603a'),
  lighthouse: hexToPacked('#c1352b'),
};

/** A raster plus the canvas it's composited through (null without a DOM canvas). */
interface Layer {
  raster: Raster;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function makeLayer(w: number, h: number): Layer | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  let ctx: CanvasRenderingContext2D | null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null; // jsdom: no canvas implementation
  }
  return ctx ? { raster: new Raster(w, h), canvas, ctx } : null;
}

/** One world sprite queued for painter's-order drawing. */
interface WorldSprite {
  depth: number;
  sheet: BakedName;
  frame: number;
  x: number;
  y: number;
  scale: number;
  alpha: number;
}

/**
 * Mode 7 renderer: a chase camera over a perspective-mapped ground, rendered at
 * a small fixed internal resolution and scaled up with nearest-neighbour.
 *
 * Layers, back to front: the world raster (dithered golden-hour sky with the
 * sun and the hills — horizon.ts — then the ground texture sampled row by row
 * with distance haze and water glints, the diver's shadow) → depth-sorted
 * world sprites (voxel-baked props,
 * balloons, clouds) → the "air" raster (hoops, speed lines) → the plane and
 * the diver → touchdown effects and the cloud whiteout → the HUD raster
 * (altimeter, arrows) → HUD text.
 *
 * Everything drawn is a pure function of (state, config): animations derive
 * from `elapsed` and the state timers, never the wall clock.
 */
export class SkyDiverRenderer {
  /** Optional voxel-baked sheets (plane, canopy, diver, props, sky). */
  baked: BakedAtlas | null = null;
  /** Optional HUD fonts; HUD text is skipped until they load. */
  fonts: HudFonts | null = null;
  labels: HudLabels = {};
  run: HudRun = { score: 0, jump: '' };
  /** Show the coaching tips (the circuit's first event). */
  tutorial = false;
  /** Draw the HUD (off for the menus' backdrop). */
  hud = true;
  /** Calm the screen: no shake, speed lines or blinking; softer cloud whiteout and confetti. */
  reducedMotion = false;
  /** Ground texture pyramid (overridable: specs use a small one). */
  textureLevels: readonly [number, number][] = DEFAULT_LEVELS;

  private w = 0;
  /** Pixel scale of hand-sized effects relative to the 216-line canvas they were drawn for. */
  private k = 1;
  private h = 0;
  private world!: Raster;
  private air: Layer | null = null;
  private hudLayer: Layer | null = null;
  private terrain: Terrain | null = null;
  private texture: GroundTexture | null = null;
  private worldKey = '';
  /** What the last frame was drawn from — an identical frame is skipped. */
  private lastFrame: readonly unknown[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ) {
    this.resize(w, h);
  }

  /** Change the internal resolution (the canvas element must match). */
  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) {
      return;
    }
    this.w = w;
    this.h = h;
    this.k = h / 216;
    this.world = new Raster(w, h);
    this.air = makeLayer(w, h);
    this.hudLayer = makeLayer(w, h);
  }

  draw(s: GameState, cfg: GameConfig): void {
    // The frame is a pure function of these: a paused, briefed or frozen scene
    // (or the menus' still backdrop) costs nothing after its first frame.
    const frame = [
      s,
      cfg,
      this.w,
      this.h,
      this.baked,
      this.fonts,
      this.labels,
      this.run,
      this.tutorial,
      this.hud,
      this.reducedMotion,
    ];
    if (frame.every((v, i) => v === this.lastFrame[i])) {
      return;
    }
    this.lastFrame = frame;

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    this.ensureWorld(s, cfg);

    const cam = cameraFor(s, cfg, this.w, this.h);
    if (!this.reducedMotion) {
      const [shakeX, shakeY] = shake(s, cfg);
      cam.cx += shakeX;
      cam.cy += shakeY;
    }

    // --- World raster: sky, sun and hills, ground ---
    const sky = skyFrame(cam, this.w);
    this.paintSkyAndGround(cam, s.elapsed, sky);
    paintSun(this.world.px, this.w, this.h, cam);
    paintRidges(this.world.px, this.w, this.h, cam, sky);
    this.paintShadow(s, cam);
    const sprites = this.collectSprites(s, cfg, cam);
    ctx.putImageData(this.world.image, 0, 0);

    // --- World sprites ---
    this.drawSprites(sprites);

    // --- Air layer: hoops and speed lines ---
    if (this.air) {
      const r = this.air.raster;
      r.clear();
      this.paintRings(r, s, cam);
      this.paintSpeedLines(r, s, cam);
      this.composite(this.air);
    }

    this.drawPlane(s, cfg, cam);
    this.drawDiver(s, cfg, cam);
    this.drawTouchdownFx(s, cfg, cam);
    this.drawCloudWhiteout(s, cam);

    // --- HUD ---
    if (!this.hud) {
      return;
    }
    if (this.hudLayer) {
      const r = this.hudLayer.raster;
      r.clear();
      this.paintHud(r, s, cfg, cam);
      this.composite(this.hudLayer);
    }
    this.drawHudText(s, cfg, cam);
  }

  private composite(layer: Layer): void {
    layer.ctx.putImageData(layer.raster.image, 0, 0);
    this.ctx.drawImage(layer.canvas, 0, 0);
  }

  /** (Re)build the jump's terrain + ground texture when the seed changes. */
  private ensureWorld(s: GameState, cfg: GameConfig): void {
    const key = [
      s.groundSeed,
      cfg.targetRadius,
      cfg.bullseyeRadius,
      cfg.venue,
      cfg.targetSpeed,
      cfg.targetHeading,
    ].join('|');
    if (key === this.worldKey && this.texture) {
      return;
    }
    this.worldKey = key;
    this.terrain = generateTerrain(s.groundSeed, cfg);
    this.texture = buildGroundTexture(this.terrain, cfg, s.groundSeed, this.textureLevels);
  }

  /** Is the ground at (x, y) water (river, lake, pond, sea)? */
  isWater(x: number, y: number): boolean {
    return !!this.texture && WATER_COLORS.includes(sampleGround(this.texture, x, y, 0));
  }

  // ---------------------------------------------------------------- world ---

  private paintSkyAndGround(cam: Camera, elapsed: number, sky: SkyFrame): void {
    const { w, h } = this;
    const px = this.world.px;
    const tex = this.texture;
    const sinH = Math.sin(cam.heading);
    const cosH = Math.cos(cam.heading);
    const fr = FOG & 255;
    const fg = (FOG >>> 8) & 255;
    const fb = (FOG >>> 16) & 255;
    const [fogNear, fogFar] = fogRange(cam.z);
    const water0 = WATER_COLORS[0];
    const water1 = WATER_COLORS[1];
    const tick = Math.floor(elapsed * 3);

    for (let y = 0; y < h; y++) {
      const rowY = y + 0.5;
      const row = floorRow(cam, rowY);
      const off = y * w;
      if (!row || !tex) {
        paintSkyRow(px, off, w, y, rowElevation(cam, rowY), sky);
        continue;
      }
      // Footprint: the larger of the sideways and the depthwise metres per pixel.
      const next = floorRow(cam, rowY + 1);
      const depthStep = next ? Math.abs(row.forward - next.forward) : row.stepPerPixel * 4;
      const footprint = Math.max(row.stepPerPixel, depthStep);
      const level = levelForFootprint(tex, footprint);
      // Close to the ground, texels magnify into big flat blocks: add a fine
      // world-space grain (grass/earth) on top so the near field keeps detail.
      const grain = footprint < 0.35;
      // Glints on water, sized in world space, re-rolled a few times a second.
      const glintCell = footprint < 1.5 ? 1.6 : 0;

      const lat0 = (0.5 - cam.cx) * row.stepPerPixel;
      let gx = cam.x + sinH * row.forward + cosH * lat0;
      let gy = cam.y - cosH * row.forward + sinH * lat0;
      const sx = cosH * row.stepPerPixel;
      const sy = sinH * row.stepPerPixel;

      const fog = FOG_MAX * clamp((row.distance - fogNear) / (fogFar - fogNear), 0, 1);
      const fogSteps = fog * 6;
      const brow = (y & 3) * 4;
      // The row's level, sampled inline (the hottest loop in the game); points
      // outside it fall back to the coarser levels through sampleGround.
      const L = tex.levels[level];
      const inv = 1 / L.mpt;
      const org = L.origin;
      const size = L.size;
      const data = L.data;
      for (let x = 0; x < w; x++) {
        const tx = Math.floor((gx - org) * inv);
        const ty = Math.floor((gy - org) * inv);
        let c =
          tx >= 0 && ty >= 0 && tx < size && ty < size
            ? data[ty * size + tx]
            : sampleGround(tex, gx, gy, L.wrap ? level : level + 1);
        if (glintCell && (c === water0 || c === water1)) {
          const gh = Math.imul(
            (Math.floor(gx / glintCell) * 7919) ^ (Math.floor(gy / glintCell) * 104729) ^ tick,
            0x27d4eb2d,
          );
          if (gh >>> 24 > 252) {
            c = P.glint;
          }
        } else if (grain) {
          const hsh = Math.imul(
            Math.floor(gx * 5) ^ Math.imul(Math.floor(gy * 5), 0x9e3779b1),
            0x27d4eb2d,
          );
          // ×0.9 … ×1.06, in 1/256ths.
          const f = 230 + (((hsh >>> 24) * 41) >> 8);
          const r = ((c & 255) * f) >> 8;
          const g = (((c >>> 8) & 255) * f) >> 8;
          const b = (((c >>> 16) & 255) * f) >> 8;
          c =
            ((255 << 24) |
              ((b > 255 ? 255 : b) << 16) |
              ((g > 255 ? 255 : g) << 8) |
              (r > 255 ? 255 : r)) >>>
            0;
        }
        if (fogSteps > 0) {
          const qi = Math.floor(fogSteps + BAYER4[brow + (x & 3)] / 16);
          if (qi > 0) {
            const q = FOG_Q[qi];
            const r = c & 255;
            const g = (c >>> 8) & 255;
            const b = (c >>> 16) & 255;
            c =
              ((255 << 24) |
                ((b + (((fb - b) * q) >> 8)) << 16) |
                ((g + (((fg - g) * q) >> 8)) << 8) |
                (r + (((fr - r) * q) >> 8))) >>>
              0;
          }
        }
        px[off + x] = c;
        gx += sx;
        gy += sy;
      }
    }
  }

  /** The diver's (or canopy's) shadow on the ground — the flare cue near touchdown. */
  private paintShadow(s: GameState, cam: Camera): void {
    if (s.phase === Phase.Plane || s.altitude > 160) {
      return;
    }
    const p = project(cam, s.posX, s.posY, 0);
    if (!p) {
      return;
    }
    const canopy = s.phase === Phase.Canopy || s.phase === Phase.Deploying;
    const radius = (canopy ? CANOPY_M * 0.45 : 1.1) * p.scale;
    const squash = clamp(cam.z / Math.hypot(cam.z, p.depth), 0.3, 1);
    const strength = 0.55 + 0.35 * clamp(s.altitude / 160, 0, 1);
    this.world.shadeEllipse(
      p.sx,
      p.sy,
      Math.max(1, radius),
      Math.max(1, radius * squash),
      strength,
    );
  }

  // -------------------------------------------------------------- horizon ---

  // -------------------------------------------------------- world sprites ---

  /**
   * Project every prop, balloon and cloud: far-away props become single dots
   * in the world raster, the rest are queued (far → near) with the baked frame
   * that matches their bearing and the camera's elevation.
   */
  private collectSprites(s: GameState, cfg: GameConfig, cam: Camera): WorldSprite[] {
    const terrain = this.terrain;
    const baked = this.baked;
    if (!terrain) {
      return [];
    }
    const out: WorldSprite[] = [];
    const [fogNear, fogFar] = fogRange(cam.z);
    const fogAt = (d: number) => FOG_MAX * clamp((d - fogNear) / (fogFar - fogNear), 0, 1);
    const windHeading = Math.atan2(s.windX, -s.windY);
    const target = targetAt(cfg, s.elapsed);
    const cheering =
      (s.phase === Phase.Landed && (s.result?.landedDistance ?? 99) < 20) ||
      (s.phase === Phase.Canopy &&
        s.altitude < 40 &&
        Math.hypot(s.posX - target.x, s.posY - target.y) < 60);
    const margin = Math.round(60 * this.k);

    terrain.props.forEach((prop, i) => {
      const p = project(cam, prop.x, prop.y, 0);
      if (
        !p ||
        p.sx < -margin ||
        p.sx > this.w + margin ||
        p.sy < -margin ||
        p.sy > this.h + margin * 2
      ) {
        return;
      }
      const heightPx = PROP_SIZE[prop.kind].height * prop.scale * p.scale;
      if (heightPx < 3 || !baked) {
        if (heightPx >= 0.8) {
          this.world.plot(p.sx, p.sy, PROP_DOTS[prop.kind]);
        }
        return;
      }
      const horiz = Math.hypot(prop.x - cam.x, prop.y - cam.y);
      const elevation = Math.atan2(cam.z, horiz);
      const sheet = baked[prop.kind];
      let yaw = prop.yaw;
      let anim = 0;
      if (prop.kind === 'windsock') {
        yaw = windHeading - Math.PI / 2; // the sock streams downwind
      } else if (prop.kind === 'windmill') {
        anim = Math.floor(s.elapsed * 3) % 2;
      } else if (prop.kind === 'spectator') {
        anim = prop.variant * 2 + (cheering ? Math.floor(s.elapsed * 5 + i) % 2 : 0);
      }
      out.push({
        depth: p.depth,
        sheet: prop.kind,
        frame: bakedFrame(sheet, elevation, yaw - cam.heading, anim),
        x: p.sx,
        y: p.sy,
        scale: (p.scale / sheet.ppm) * prop.scale,
        alpha: 1 - fogAt(Math.hypot(horiz, cam.z)) * 0.85,
      });
    });

    if (baked) {
      for (const k of terrain.sky) {
        // Balloons and clouds ride the wind (a pure function of elapsed).
        const drift = k.kind === 'balloon' ? 0.7 : 0.35;
        const x = k.x + s.windBaseX * s.elapsed * drift;
        const y = k.y + s.windBaseY * s.elapsed * drift;
        const p = project(cam, x, y, k.z);
        if (!p) continue;
        const sheet = baked[k.kind];
        const size = sheet.fw * (p.scale / sheet.ppm);
        if (p.sx < -size || p.sx > this.w + size || p.sy < -size * 1.5 || p.sy > this.h + size) {
          continue;
        }
        const horiz = Math.hypot(x - cam.x, y - cam.y);
        const elevation = Math.atan2(cam.z - k.z, horiz);
        out.push({
          depth: p.depth,
          sheet: k.kind,
          frame: bakedFrame(sheet, elevation, 0, k.variant),
          x: p.sx,
          y: p.sy,
          scale: p.scale / sheet.ppm,
          alpha:
            (k.kind === 'cloud' ? 0.94 : 1) * (1 - fogAt(Math.hypot(horiz, cam.z - k.z)) * 0.85),
        });
      }
    }
    // The moving target: the float rolls down the road with the horse in front.
    if (baked && cfg.targetSpeed > 0) {
      const sheet = baked.wagon;
      const p = project(cam, target.x, target.y, 0);
      if (p) {
        const horiz = Math.hypot(target.x - cam.x, target.y - cam.y);
        out.push({
          depth: p.depth,
          sheet: 'wagon',
          frame: bakedFrame(sheet, Math.atan2(cam.z, horiz), cfg.targetHeading - cam.heading),
          x: p.sx,
          y: p.sy,
          scale: p.scale / sheet.ppm,
          alpha: 1,
        });
      }
    }
    out.sort((a, b) => b.depth - a.depth);
    return out;
  }

  private drawSprites(sprites: WorldSprite[]): void {
    const baked = this.baked;
    if (!baked) {
      return;
    }
    const ctx = this.ctx;
    for (const sp of sprites) {
      ctx.globalAlpha = sp.alpha;
      drawBaked(ctx, baked[sp.sheet], sp.frame, sp.x, sp.y, sp.scale);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ air ---

  /** The next hoops (gold = next, brass = the one after) and pass/miss bursts. */
  private paintRings(r: Raster, s: GameState, cam: Camera): void {
    const BURST = 22;
    const upcoming = s.rings.filter((ring) => ring.passed === null && ring.altitude < s.altitude);
    upcoming.sort((a, b) => b.altitude - a.altitude);
    // Draw far → near so the next hoop sits on top.
    if (upcoming[1]) {
      this.paintRing(r, cam, upcoming[1], 1, P.brassDark, P.shadow);
    }
    if (upcoming[0]) {
      const close = s.altitude - upcoming[0].altitude < 60;
      const lit = close && Math.floor(s.elapsed / 0.12) % 2 === 0;
      this.paintRing(r, cam, upcoming[0], 1, lit ? P.highlight : P.gold, P.shadow);
    }
    // Pass/miss bursts belong to the free-fall view: once the canopy camera
    // swings up toward the horizon, a hoop just above would span the sky.
    for (const ring of s.phase === Phase.Freefall ? s.rings : []) {
      if (ring.passed === null) continue;
      const p = (ring.altitude - s.altitude) / BURST;
      if (p < 0 || p > 1) continue;
      this.paintRing(
        r,
        cam,
        ring,
        1 + p * 0.5,
        ring.passed ? P.green : P.redHot,
        ring.passed ? P.greenDark : P.shadow,
      );
      if (ring.passed) {
        // A burst of sparks flying off the rim.
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2 + ring.altitude;
          const rr = ring.radius * (1.1 + p * 1.2);
          const q = project(
            cam,
            ring.x + Math.cos(a) * rr,
            ring.y + Math.sin(a) * rr,
            ring.altitude + p * 6,
          );
          if (q) {
            r.rect(q.sx, q.sy, 2, 2, k % 2 ? P.highlight : P.gold);
            r.plot(q.sx + 2, q.sy, k % 2 ? P.gold : P.highlight);
          }
        }
      }
    }
  }

  private paintRing(
    r: Raster,
    cam: Camera,
    ring: Ring,
    grow: number,
    color: number,
    outline: number,
  ): void {
    const N = 48;
    const pts: ({ sx: number; sy: number; scale: number } | null)[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(
        project(
          cam,
          ring.x + Math.cos(a) * ring.radius * grow,
          ring.y + Math.sin(a) * ring.radius * grow,
          ring.altitude,
        ),
      );
    }
    for (const pass of [0, 1]) {
      for (let i = 0; i < N; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b) continue;
        const thick = clamp(Math.round(0.9 * Math.min(a.scale, b.scale)), 1, 4);
        if (pass === 0) {
          r.line(a.sx, a.sy + 1, b.sx, b.sy + 1, outline, thick + 1);
        } else {
          r.line(a.sx, a.sy, b.sx, b.sy, color, thick);
        }
      }
    }
  }

  /** Streaks rushing out from the diver at free-fall speed. */
  private paintSpeedLines(r: Raster, s: GameState, cam: Camera): void {
    if (s.phase !== Phase.Freefall || this.reducedMotion) {
      return;
    }
    const intensity = clamp((s.descentSpeed - 30) / 35, 0, 1);
    if (intensity <= 0) {
      return;
    }
    const maxR = Math.hypot(this.w, this.h) / 2;
    for (let i = 0; i < 22; i++) {
      const ang = hash01(i * 3 + 1) * Math.PI * 2;
      const t = (s.elapsed * (0.8 + hash01(i * 3 + 2) * 0.6) + hash01(i * 3 + 3)) % 1;
      const r0 = 30 + t * t * maxR;
      const len = (3 + t * 16 * intensity) * this.k;
      const cx = cam.cx;
      const cy = cam.cy;
      r.line(
        cx + Math.cos(ang) * r0,
        cy + Math.sin(ang) * r0,
        cx + Math.cos(ang) * (r0 + len),
        cy + Math.sin(ang) * (r0 + len),
        P.highlight,
        1,
        0.55 * intensity * (1 - t * 0.6),
      );
    }
  }

  // ---------------------------------------------------------- plane/diver ---

  private drawPlane(s: GameState, cfg: GameConfig, cam: Camera): void {
    const t = s.phase === Phase.Plane ? s.planeTime : s.elapsed;
    if (s.phase !== Phase.Plane && s.elapsed - s.planeTime > 6) {
      return;
    }
    const pos = planePosition(s, cfg, t);
    const p = project(cam, pos.x, pos.y, cfg.exitAltitude);
    if (!p) {
      return;
    }
    const sheet = this.baked?.plane;
    if (!sheet) {
      this.ctx.fillStyle = INK.red;
      const size = Math.max(2, 9.5 * p.scale);
      this.ctx.fillRect(Math.round(p.sx - size / 2), Math.round(p.sy - 1), Math.round(size), 3);
      return;
    }
    const elevation = Math.atan2(
      cam.z - cfg.exitAltitude,
      Math.hypot(pos.x - cam.x, pos.y - cam.y),
    );
    const frame = bakedFrame(sheet, elevation, s.planeHeading - cam.heading);
    drawBaked(this.ctx, sheet, frame, p.sx, p.sy, p.scale / sheet.ppm);
  }

  private drawDiver(s: GameState, cfg: GameConfig, cam: Camera): void {
    if (s.phase === Phase.Plane) {
      return; // still aboard
    }
    const ctx = this.ctx;
    const baked = this.baked;
    const p = project(cam, s.posX, s.posY, s.altitude);
    if (!p) {
      return;
    }
    const horiz = Math.hypot(s.posX - cam.x, s.posY - cam.y);
    // Camera elevation to the canopy rig's middle (it hangs above the harness).
    const rigElevation = Math.atan2(cam.z - (s.altitude + RIG_MID_M), horiz);

    switch (s.phase) {
      case Phase.Freefall: {
        const sheet = baked?.['diver-fall'];
        if (!sheet) {
          ctx.fillStyle = INK.red;
          ctx.fillRect(Math.round(p.sx - 3), Math.round(p.sy - 3), 6, 6);
          return;
        }
        const pose = Math.round(((clamp(s.pitch, -1, 1) + 1) / 2) * (sheet.anim - 1));
        drawBaked(
          ctx,
          sheet,
          bakedFrame(sheet, cam.pitch, 0, pose),
          p.sx,
          p.sy,
          p.scale / sheet.ppm,
          -s.turnRate * 0.18,
        );
        return;
      }
      case Phase.Deploying: {
        const open = 1 - s.deployTimer / Math.max(cfg.deployDuration, 1e-9);
        const sheet = baked?.['canopy-open'];
        if (!sheet) {
          ctx.fillStyle = INK.brass;
          ctx.fillRect(Math.round(p.sx - 4), Math.round(p.sy - 8), 8, 4);
          return;
        }
        const stage = Math.min(sheet.anim - 1, Math.floor(open * sheet.anim));
        drawBaked(
          ctx,
          sheet,
          bakedFrame(sheet, rigElevation, 0, stage),
          p.sx,
          p.sy,
          p.scale / sheet.ppm,
        );
        return;
      }
      case Phase.Canopy: {
        const flaring = s.flareTime > 0 && s.flareTime < cfg.flareDuration;
        const stalled = s.flareTime >= cfg.flareDuration;
        const name: BakedName = stalled ? 'canopy-stall' : flaring ? 'canopy-flare' : 'canopy';
        const sheet = baked?.[name];
        if (!sheet) {
          ctx.fillStyle = INK.red;
          const span = CANOPY_M * p.scale;
          ctx.fillRect(
            Math.round(p.sx - span / 2),
            Math.round(p.sy - 6 * p.scale),
            Math.round(span),
            4,
          );
          return;
        }
        const bank = stalled
          ? Math.floor(s.elapsed * 3) % 2
          : Math.round(
              (clamp(s.turnRate / cfg.canopyTurnRate, -1, 1) + 1) * ((sheet.anim - 1) / 2),
            );
        drawBaked(
          ctx,
          sheet,
          bakedFrame(sheet, rigElevation, 0, bank),
          p.sx,
          p.sy,
          p.scale / sheet.ppm,
        );
        return;
      }
      case Phase.Landed:
      case Phase.Crashed: {
        const g = project(cam, s.posX, s.posY, 0);
        if (!g || !baked) {
          return;
        }
        const elevation = Math.atan2(cam.z, horiz);
        if (s.phase === Phase.Landed) {
          // The spent canopy settles ahead of him on the grass.
          // (Off to the side: straight ahead it would sit on his head on screen.)
          const f = forwardOf(s.heading);
          const c = project(cam, s.posX + f.x * 2.5 + -f.y * 4, s.posY + f.y * 2.5 + f.x * 4, 0);
          const down = baked['canopy-down'];
          if (c) {
            drawBaked(ctx, down, bakedFrame(down, elevation), c.sx, c.sy, c.scale / down.ppm);
          }
          const sheet = baked['diver-land'];
          drawBaked(
            ctx,
            sheet,
            bakedFrame(sheet, elevation, 0, landPose(s, cfg)),
            g.sx,
            g.sy,
            g.scale / sheet.ppm,
          );
        } else {
          const sheet = baked['diver-crash'];
          const twitch = Math.floor(s.elapsed * 2) % 2;
          drawBaked(
            ctx,
            sheet,
            bakedFrame(sheet, elevation, 0, twitch),
            g.sx,
            g.sy,
            g.scale / sheet.ppm,
          );
        }
        return;
      }
    }
  }

  /** Dust (or a splash) at touchdown; confetti over the crowd for a bullseye or a stand-up. */
  private drawTouchdownFx(s: GameState, cfg: GameConfig, cam: Camera): void {
    if ((s.phase !== Phase.Landed && s.phase !== Phase.Crashed) || cfg.outroDuration <= 0) {
      return;
    }
    const g = project(cam, s.posX, s.posY, 0);
    if (!g) {
      return;
    }
    const ctx = this.ctx;
    const t = (1 - s.outroTimer / cfg.outroDuration) * cfg.outroDuration; // seconds since touchdown
    const water = this.isWater(s.posX, s.posY);

    // Dust puff or splash, thrown out and settling.
    if (t < 0.9) {
      const n = water ? 18 : 12;
      for (let i = 0; i < n; i++) {
        const a = hash01(i + 7) * Math.PI * 2;
        const v = (1.5 + hash01(i + 31) * 2.5) * g.scale;
        const up = water ? (3 + hash01(i + 57) * 4) * g.scale : 0.6 * g.scale;
        const x = g.sx + Math.cos(a) * v * t * 2;
        const y =
          g.sy +
          Math.sin(a) * v * t * 0.6 -
          (up * t * 2 - 9.8 * g.scale * t * t * (water ? 1 : 0.2));
        if (y > g.sy + 4 * this.k) continue;
        ctx.fillStyle = water
          ? i % 3
            ? INK.water
            : INK.highlight
          : i % 2
            ? INK.parchment
            : INK.brass;
        ctx.fillRect(Math.round(x), Math.round(y), 3, 3);
      }
    }

    // Confetti rains over the drop zone for the good ones.
    const r = s.result;
    if (r && !r.crashed && (r.bullseye || r.landing === 'standup') && t < 3) {
      const colors = [INK.red, INK.highlight, INK.brass, INK.green, INK.water];
      const n = (r.bullseye ? 60 : 30) / (this.reducedMotion ? 3 : 1);
      for (let i = 0; i < n; i++) {
        const x0 = (hash01(i * 5 + 1) - 0.5) * this.w * 0.9 + this.w / 2;
        const y0 = (-10 - hash01(i * 5 + 2) * 60) * this.k;
        const fall = (40 + hash01(i * 5 + 3) * 50) * this.k;
        const sway = Math.sin(t * 6 + i) * 3 * this.k;
        const y = y0 + fall * t;
        if (y > this.h) continue;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(Math.round(x0 + sway), Math.round(y), (i + Math.floor(t * 8)) % 2 ? 3 : 2, 3);
      }
    }
  }

  /** Falling through a cumulus washes the view out to cream. */
  private drawCloudWhiteout(s: GameState, cam: Camera): void {
    const terrain = this.terrain;
    if (!terrain || s.phase === Phase.Landed || s.phase === Phase.Crashed) {
      return;
    }
    let white = 0;
    for (const k of terrain.sky) {
      if (k.kind !== 'cloud') continue;
      const x = k.x + s.windBaseX * s.elapsed * 0.35;
      const y = k.y + s.windBaseY * s.elapsed * 0.35;
      const d = Math.hypot(
        (cam.x - x) / CLOUD_RADII[0],
        (cam.y - y) / CLOUD_RADII[1],
        (cam.z - k.z - CLOUD_MID_Z) / CLOUD_RADII[2],
      );
      white = Math.max(white, clamp((1 - d) * 2.2, 0, this.reducedMotion ? 0.5 : 0.88));
    }
    if (white > 0) {
      this.ctx.globalAlpha = white;
      this.ctx.fillStyle = '#fff4e6';
      this.ctx.fillRect(0, 0, this.w, this.h);
      this.ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ HUD ---
  //
  // Laid out on the 640×360 grid (it stretches with wider/taller windows):
  // instruments top-left (altimeter, jump light), wind top centre, score top
  // right, banners at a third of the height, prompts and the controls hint at
  // the bottom. Text uses the pixel fonts at their native sizes only.

  private paintHud(r: Raster, s: GameState, cfg: GameConfig, cam: Camera): void {
    this.paintAltimeter(r, s, cfg);
    this.paintWind(r, s, cam);
    if (s.phase === Phase.Plane) {
      const light = spotLightAt(s, cfg);
      const c = light === 'green' ? P.green : light === 'amber' ? P.amber : P.redHot;
      // The jump light, by the door: under the altimeter, its label beside it.
      const { x, y, r: lr } = HUD.spot;
      r.disc(x, y, lr + 2.5, P.shadow);
      r.disc(x, y, lr + 1.5, P.brassDark);
      r.disc(x, y, lr + 0.5, P.brass);
      r.disc(x, y, lr - 0.5, c);
      r.disc(x - 2, y - 2, 2, mixPacked(c, P.highlight, 0.6));
      r.plot(x - 3, y - 3, P.highlight);
    }
    if (s.phase === Phase.Landed || s.phase === Phase.Crashed) {
      return;
    }
    // Arrows: to the next hoop in free fall, to the target otherwise.
    const next = s.phase === Phase.Freefall ? nextRing(s) : null;
    if (next) {
      this.paintPointer(r, cam, next.x, next.y, next.altitude, P.gold, false, s.elapsed);
    }
    const t = targetAt(cfg, s.elapsed);
    this.paintPointer(r, cam, t.x, t.y, 0, P.redHot, true, s.elapsed);
  }

  /** Brass altimeter: one turn per 2000 m, red below the hard deck, amber in the pull window. */
  private paintAltimeter(r: Raster, s: GameState, cfg: GameConfig): void {
    const { x: cx, y: cy, r: R } = HUD.gauge;
    const at = (metres: number) => (metres / ALTIMETER_DIAL) * Math.PI * 2 - Math.PI / 2;
    // Bezel: shadow, dark rim, brass, a lit arc up-left.
    r.disc(cx, cy, R + 3.5, P.shadow);
    r.disc(cx, cy, R + 2.5, P.brassDark);
    r.disc(cx, cy, R + 1.5, P.brass);
    for (let a = 3.3; a < 4.9; a += 0.02) {
      r.plot(cx + Math.cos(a) * (R + 1.5), cy + Math.sin(a) * (R + 1.5), P.brassLight);
    }
    r.disc(cx, cy, R - 0.5, P.face);
    // Pull window: red to the deck, amber up to the ceiling.
    const band = (from: number, to: number, c: number) => {
      for (let m = from; m <= to; m += 4) {
        const t = at(m);
        for (let rr = R - 5; rr <= R - 3; rr++) {
          r.plot(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, c);
        }
      }
    };
    band(0, cfg.hardDeck, P.redHot);
    band(cfg.hardDeck, cfg.pullCeiling, P.amber);
    // Graduations: every 50 m, long every 200 m.
    for (let i = 0; i < 40; i++) {
      const t = at(i * 50);
      const major = i % 4 === 0;
      r.line(
        cx + Math.cos(t) * (R - (major ? 8 : 4)),
        cy + Math.sin(t) * (R - (major ? 8 : 4)),
        cx + Math.cos(t) * (R - 2),
        cy + Math.sin(t) * (R - 2),
        i === 0 ? P.highlight : major ? P.parchment : P.faceTick,
      );
    }
    // Numerals every 400 m (×100 m), in a tiny pixel face.
    for (let n = 0; n < 20; n += 4) {
      const a = at(n * 100);
      const label = String(n);
      tinyText(
        r,
        label,
        cx + Math.cos(a) * (R - 14) - tinyWidth(label) / 2,
        cy + Math.sin(a) * (R - 14) - 2,
        P.parchmentDim,
      );
    }
    // Needle with a counterweight, red when the deck is near.
    const t = at(s.altitude % ALTIMETER_DIAL);
    const danger =
      s.phase === Phase.Freefall &&
      s.altitude < cfg.hardDeck + 40 &&
      (this.reducedMotion || Math.floor(s.elapsed / 0.15) % 2 === 0);
    const ink = danger ? P.redHot : P.highlight;
    r.line(cx - Math.cos(t) * 6, cy - Math.sin(t) * 6, cx, cy, P.brassDark, 2);
    r.line(cx, cy, cx + Math.cos(t) * (R - 7), cy + Math.sin(t) * (R - 7), ink, 2);
    r.disc(cx, cy, 3.5, P.brass);
    r.plot(cx - 1, cy - 1, P.brassLight);
    // Glass glint.
    for (let a = 3.6; a < 4.4; a += 0.03) {
      r.blend(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9), P.highlight, 0.35);
    }
  }

  /** Wind arrow relative to the view (top centre). */
  private paintWind(r: Raster, s: GameState, cam: Camera): void {
    const speed = Math.hypot(s.windX, s.windY);
    const { r: R } = HUD.wind;
    const x0 = Math.round(this.w / 2) + HUD.wind.dx;
    const y0 = HUD.wind.y;
    r.disc(x0, y0, R + 2.5, P.shadow);
    r.disc(x0, y0, R + 1.5, P.brassDark);
    r.disc(x0, y0, R + 0.5, P.brass);
    r.disc(x0, y0, R - 0.5, P.face);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      r.plot(x0 + Math.cos(a) * (R - 2), y0 + Math.sin(a) * (R - 2), P.faceTick);
    }
    if (speed < 0.2) {
      return;
    }
    const a = screenAngle(cam, s.windX, s.windY);
    const len = R - 3;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    r.line(x0 - dx * len, y0 - dy * len, x0 + dx * (len - 4), y0 + dy * (len - 4), P.parchment, 2);
    const tipX = x0 + dx * len;
    const tipY = y0 + dy * len;
    r.tri(
      tipX + dx,
      tipY + dy,
      tipX - dx * 6 - dy * 4,
      tipY - dy * 6 + dx * 4,
      tipX - dx * 6 + dy * 4,
      tipY - dy * 6 - dx * 4,
      P.parchment,
    );
  }

  /** Edge arrow toward an off-screen point, or a bobbing chevron above an on-screen one. */
  private paintPointer(
    r: Raster,
    cam: Camera,
    x: number,
    y: number,
    z: number,
    c: number,
    isTarget: boolean,
    elapsed: number,
  ): void {
    const p = project(cam, x, y, z);
    const m = 22;
    const top = HUD.pointerTop;
    const bottom = this.h - HUD.pointerBottom;
    const onScreen = p && p.sx >= m && p.sx <= this.w - m && p.sy >= top && p.sy <= bottom;
    if (onScreen && p) {
      if (!isTarget) {
        return; // the gold hoop itself is the marker
      }
      const bob = this.reducedMotion ? 0 : Math.floor(elapsed * 3) % 2;
      const tx = Math.round(p.sx);
      const ty = Math.round(p.sy) - 10 - bob;
      r.tri(tx - 8, ty - 9, tx + 8, ty - 9, tx, ty + 1, P.shadow);
      r.tri(tx - 6, ty - 8, tx + 6, ty - 8, tx, ty - 1, c);
      r.line(tx - 4, ty - 7, tx - 1, ty - 7, mixPacked(c, P.highlight, 0.5));
      return;
    }
    // Direction in screen space from the camera-relative bearing.
    const sinH = Math.sin(cam.heading);
    const cosH = Math.cos(cam.heading);
    const dx = x - cam.x;
    const dy = y - cam.y;
    const right = dx * cosH + dy * sinH;
    const fwd = dx * sinH - dy * cosH;
    const ang = Math.atan2(right, fwd); // 0 = straight ahead (screen up)
    const ux = Math.sin(ang);
    const uy = -Math.cos(ang);
    // Ride the edge of an inset frame that keeps clear of the HUD bands.
    const hw = this.w / 2 - m;
    const hh = (bottom - top) / 2;
    const k = Math.min(hw / Math.max(1e-6, Math.abs(ux)), hh / Math.max(1e-6, Math.abs(uy)));
    const ax = this.w / 2 + ux * k;
    const ay = (top + bottom) / 2 + uy * k;
    const px = -uy;
    const py = ux;
    r.tri(
      ax + ux * 11,
      ay + uy * 11,
      ax - ux * 6 + px * 9,
      ay - uy * 6 + py * 9,
      ax - ux * 6 - px * 9,
      ay - uy * 6 - py * 9,
      P.shadow,
    );
    r.tri(
      ax + ux * 8,
      ay + uy * 8,
      ax - ux * 4 + px * 6,
      ay - uy * 4 + py * 6,
      ax - ux * 4 - px * 6,
      ay - uy * 4 - py * 6,
      c,
    );
  }

  private drawHudText(s: GameState, cfg: GameConfig, cam: Camera): void {
    const fonts = this.fonts;
    if (!fonts) {
      return;
    }
    const L = this.labels;
    const { small: sm, body } = fonts;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const blink = this.reducedMotion || Math.floor(s.elapsed / 0.25) % 2 === 0;
    const centred = (font: PixelFont, text: string, x: number, y: number, color: string) =>
      shadowText(ctx, font, text, x - font.measure(text) / 2, y, color);

    // Altimeter readout under the dial.
    const g = HUD.gauge;
    centred(body, `${Math.round(s.altitude)} ${L.alt ?? ''}`, g.x, g.y + g.r + 6, INK.highlight);

    // Wind: label and speed beside the compass.
    const wx = Math.round(w / 2) + HUD.wind.dx + HUD.wind.r + 7;
    shadowText(ctx, sm, L.wind ?? '', wx, HUD.wind.y - 15, INK.brass);
    shadowText(
      ctx,
      body,
      `${Math.round(Math.hypot(s.windX, s.windY))} M/S`,
      wx,
      HUD.wind.y,
      INK.highlight,
    );

    // Score / event / hoops (top right).
    const right = (font: PixelFont, text: string, y: number, color: string) =>
      shadowText(ctx, font, text, w - 10 - font.measure(text), y, color);
    const scoreLabel = L.score ?? '';
    const scoreValue = String(this.run.score);
    right(body, scoreValue, 8, INK.highlight);
    shadowText(
      ctx,
      sm,
      scoreLabel,
      w - 10 - body.measure(scoreValue) - 6 - sm.measure(scoreLabel),
      10,
      INK.brass,
    );
    right(sm, this.run.jump, 25, INK.brass);
    if (s.rings.length > 0 && s.phase !== Phase.Plane) {
      right(body, `${L.rings ?? ''} ${s.ringsPassed}/${s.rings.length}`, 36, INK.amber);
    }

    // Target distance next to its marker.
    if (s.phase !== Phase.Landed && s.phase !== Phase.Crashed) {
      const t = targetAt(cfg, s.elapsed);
      const p = project(cam, t.x, t.y, 0);
      const dist = `${Math.round(Math.hypot(s.posX - t.x, s.posY - t.y))} M`;
      if (
        p &&
        p.sx > 22 &&
        p.sx < w - 22 &&
        p.sy > HUD.pointerTop &&
        p.sy < h - HUD.pointerBottom
      ) {
        centred(body, dist, Math.round(p.sx), Math.round(p.sy) - 36, INK.highlight);
      }
    }

    if (this.tutorial) {
      this.drawTip(s, cfg);
    }

    // Context prompt (bottom centre) and big alerts.
    let prompt = '';
    let alert = '';
    let alertColor = INK.highlight;
    const alertY = Math.round(h * 0.3);
    switch (s.phase) {
      case Phase.Plane: {
        const light = spotLightAt(s, cfg);
        prompt = L.jumpPrompt ?? '';
        const label = light === 'green' ? L.spotGreen : light === 'amber' ? L.spotAmber : L.spotRed;
        const color = light === 'green' ? INK.green : light === 'amber' ? INK.amber : INK.red;
        shadowText(ctx, body, label ?? '', HUD.spot.x + HUD.spot.r + 9, HUD.spot.y - 6, color);
        break;
      }
      case Phase.Freefall: {
        prompt = L.pullPrompt ?? '';
        if (s.altitude < cfg.hardDeck) {
          alert = L.belowDeck ?? '';
          alertColor = INK.red;
        } else if (s.altitude < cfg.hardDeck + 40) {
          alert = blink ? (L.pullNow ?? '') : '';
          alertColor = INK.red;
        } else if (s.altitude < cfg.pullCeiling) {
          centred(body, L.pullZone ?? '', w / 2, h - 62, INK.amber);
        }
        const flash = ringFlash(s);
        if (flash && !alert) {
          alert = flash.passed ? (L.ringHit ?? '') : (L.ringMiss ?? '');
          alertColor = flash.passed ? INK.green : INK.red;
          if (flash.passed) {
            // The points float up under the banner.
            const pts = `+${Math.round(150 * (0.5 + 0.5 * flash.centered))}`;
            const rise = Math.round((flash.altitude - s.altitude) / 2);
            centred(body, pts, w / 2, alertY + 30 - rise, INK.amber);
          }
        }
        break;
      }
      case Phase.Deploying:
        break;
      case Phase.Canopy:
        if (s.flareTime >= cfg.flareDuration) {
          alert = L.stall ?? '';
          alertColor = INK.red;
        } else if (s.altitude < 12 && s.flareTime === 0) {
          prompt = blink ? (L.flarePrompt ?? '') : '';
        }
        break;
      case Phase.Landed:
      case Phase.Crashed: {
        const r = s.result;
        if (r) {
          alert = L[r.landing as LandingQuality] ?? '';
          alertColor =
            r.landing === 'standup' ? INK.green : r.landing === 'crash' ? INK.red : INK.amber;
          const extra = r.bullseye
            ? (L.bullseye ?? '')
            : this.isWater(s.posX, s.posY)
              ? (L.splash ?? '')
              : '';
          if (extra) {
            bigText(
              ctx,
              fonts.big,
              extra,
              w / 2 - fonts.big.measure(extra) / 2,
              alertY + 28,
              r.bullseye ? INK.brass : INK.water,
            );
          }
        }
        break;
      }
    }
    if (alert) {
      bigText(ctx, fonts.big, alert, w / 2 - fonts.big.measure(alert) / 2, alertY, alertColor);
    }
    if (prompt) {
      centred(body, prompt, w / 2, h - 44, INK.highlight);
    }

    // Controls hint (bottom line).
    const hint =
      s.phase === Phase.Plane
        ? L.hintPlane
        : s.phase === Phase.Freefall
          ? L.hintFreefall
          : s.phase === Phase.Canopy || s.phase === Phase.Deploying
            ? L.hintCanopy
            : '';
    if (hint) {
      centred(sm, hint, w / 2, h - 18, INK.parchment);
    }
  }

  /** Coaching tip for the moment (tutorial event), in a dark box under the wind gauge. */
  private drawTip(s: GameState, cfg: GameConfig): void {
    const font = this.fonts?.body;
    const L = this.labels;
    if (!font) {
      return;
    }
    let tip: string | undefined;
    switch (s.phase) {
      case Phase.Plane:
        tip = L.tipPlane;
        break;
      case Phase.Freefall:
        tip = s.altitude < cfg.pullCeiling + 80 ? L.tipPull : L.tipFreefall;
        break;
      case Phase.Deploying:
      case Phase.Canopy:
        tip = s.altitude < 25 ? L.tipFlare : L.tipCanopy;
        break;
    }
    if (!tip) {
      return;
    }
    const maxW = Math.min(this.w - 240, 400);
    const lines = wrapText(font, tip, maxW);
    const lh = font.lineHeight + 2;
    const boxW = Math.max(...lines.map((l) => font.measure(l))) + 20;
    const boxH = lines.length * lh + 12;
    const x0 = Math.round(this.w / 2 - boxW / 2);
    const y0 = 50;
    const ctx = this.ctx;
    ctx.globalAlpha = 0.84;
    ctx.fillStyle = INK.shadow;
    ctx.fillRect(x0, y0, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK.brass;
    ctx.fillRect(x0, y0, boxW, 1);
    ctx.fillRect(x0, y0 + boxH - 1, boxW, 1);
    ctx.fillStyle = INK.brassDark;
    ctx.fillRect(x0, y0 + 1, boxW, 1);
    lines.forEach((line, k) => {
      font.draw(
        ctx,
        line,
        Math.round(this.w / 2 - font.measure(line) / 2),
        y0 + 7 + k * lh,
        INK.highlight,
      );
    });
  }
}

// --- helpers -----------------------------------------------------------------

/** Screen-space angle (canvas convention, 0 = right, +y down) of a ground-plane vector. */
function screenAngle(cam: Camera, vx: number, vy: number): number {
  const sinH = Math.sin(cam.heading);
  const cosH = Math.cos(cam.heading);
  const right = vx * cosH + vy * sinH;
  const fwd = vx * sinH - vy * cosH;
  return Math.atan2(-fwd, right);
}

function hash01(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function nextRing(s: GameState): Ring | null {
  let best: Ring | null = null;
  for (const r of s.rings) {
    if (r.passed === null && r.altitude < s.altitude && (!best || r.altitude > best.altitude)) {
      best = r;
    }
  }
  return best;
}

/** The hoop resolved within the last ~25 m of fall, for the HIT/MISS flash. */
function ringFlash(s: GameState): Ring | null {
  for (const r of s.rings) {
    if (r.passed !== null && r.altitude - s.altitude >= 0 && r.altitude - s.altitude < 25) {
      return r;
    }
  }
  return null;
}

/** Camera shake: canopy snap and touchdown thump, derived from the state timers. */
function shake(s: GameState, cfg: GameConfig): [number, number] {
  let amp = 0;
  if (s.phase === Phase.Canopy && s.canopyTime < 0.35) {
    amp = 2 * (1 - s.canopyTime / 0.35);
  }
  if ((s.phase === Phase.Landed || s.phase === Phase.Crashed) && cfg.outroDuration > 0) {
    const t = 1 - s.outroTimer / cfg.outroDuration;
    const peak = s.phase === Phase.Crashed ? 4 : s.result?.landing === 'tumble' ? 2 : 1;
    amp = t < 0.25 ? peak * (1 - t / 0.25) : 0;
  }
  if (amp <= 0) {
    return [0, 0];
  }
  return [Math.round(Math.sin(s.elapsed * 71) * amp), Math.round(Math.cos(s.elapsed * 53) * amp)];
}

/**
 * Landing outro pose (diver-land columns): crouch → rise → stand, then waving —
 * both arms up for a bullseye or a stand-up.
 */
function landPose(s: GameState, cfg: GameConfig): number {
  const t = cfg.outroDuration > 0 ? 1 - s.outroTimer / cfg.outroDuration : 1;
  if (s.outroTimer > 0 && t < 0.12) return 0;
  if (s.outroTimer > 0 && t < 0.25) return 1;
  if (s.outroTimer > 0 && t < 0.4) return 2;
  const happy = !!s.result && (s.result.bullseye || s.result.landing === 'standup');
  const beat = Math.floor(s.elapsed * 3) % 2;
  return happy ? (beat ? 5 : 3) : beat ? 3 : 4;
}

/** Ink around HUD text: the four neighbours and a drop to the lower right. */
const OUTLINE: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [1, 1],
];

function shadowText(
  ctx: CanvasRenderingContext2D,
  font: PixelFont,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  if (!text) {
    return;
  }
  // A full 1-px ink outline plus a drop below-right: brass and amber labels
  // stay legible over the golden sky (a lone drop shadow left only the ink
  // showing — "AMBER" read "AIIBER").
  const ix = Math.round(x);
  const iy = Math.round(y);
  for (const [dx, dy] of OUTLINE) {
    font.draw(ctx, text, ix + dx, iy + dy, INK.shadow);
  }
  font.draw(ctx, text, ix, iy, color);
}

/** Banner text: a full dark outline, then the colour. */
function bigText(
  ctx: CanvasRenderingContext2D,
  font: PixelFont,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  if (!text) {
    return;
  }
  const ix = Math.round(x);
  const iy = Math.round(y);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [2, 2],
    [1, 2],
  ]) {
    font.draw(ctx, text, ix + dx, iy + dy, INK.shadow);
  }
  font.draw(ctx, text, ix, iy, color);
}

/** Greedy word wrap to `maxW` pixels. */
function wrapText(font: PixelFont, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.measure(next) > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

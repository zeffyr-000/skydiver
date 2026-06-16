import { generateTerrain, TERRAIN_EXTENT, type Terrain } from './ground';
import { drawSprite, TerrainSprite, type SpriteAtlas } from './sprites';
import type { CloudRing, GameConfig, GameState } from './types';
import { Phase } from './types';

// Palette accents mirrored from src/styles/_tokens.scss (a canvas can't cheaply
// read CSS custom properties every frame). Keep these in sync with the tokens
// and with tools/generate-sprites.mjs.
const COLORS = {
  red: '#c1352b', // --biplane-red
  redDark: '#8f231c', // --biplane-red-dark
  brass: '#d9a441', // --brass
  parchment: '#e8d8b0', // --parchment
  highlight: '#fff7e0', // --highlight
  shadow: '#11161f', // --shadow
  skyHigh: '#34416b', // --sky-twilight (golden-hour atmospheric haze when high up)
  // Game-world ground (fields seen from above) — not part of the UI token set.
  ground: '#4f7a3a',
  road: '#a89570',
  water: '#3a6ea5', // sprite palette W
  waterLight: '#5b8cc0', // sprite palette w
  forestFloor: '#3a5c2b', // sprite palette g
};

// Muted farmland tints indexed by FieldPatch.tint.
const FIELD_TINTS = ['#557f3e', '#48702f', '#5d8146', '#75793c'];

// 1px stand-in tints when a decoration is too far away to read as a sprite.
const DECOR_DOTS: Record<TerrainSprite, string> = {
  [TerrainSprite.TreeA]: '#3a5c2b',
  [TerrainSprite.TreeB]: '#3a5c2b',
  [TerrainSprite.Bush]: '#3a5c2b',
  [TerrainSprite.Rock]: '#8a8a8a',
  [TerrainSprite.HayBale]: '#d9a441',
  [TerrainSprite.Pond]: '#3a6ea5',
  [TerrainSprite.Tent]: '#e8d8b0',
  [TerrainSprite.SpectatorA]: '#e8d8b0',
  [TerrainSprite.SpectatorB]: '#e8d8b0',
  [TerrainSprite.Windsock]: '#c1352b',
};

const GRID_METRES = 40;
/** Plane layer: fixed pixels-per-metre (it flies at the camera's altitude). */
const PLANE_PPM = 1.2;
const PLANE_SPEED = 60; // m/s along its flight line
/** Metres of fall over which the exit close-up settles to the regular size. */
const EXIT_ZOOM_METRES = 120;

// Virtual eye height (m) at touchdown for the perspective zoom: ppm(alt) =
// groundPpm · H / (alt + H). Smaller = harder ground rush at the end.
const CAMERA_HEIGHT_M = 90;

// Lead colour for the next cloud hoop — a vivid gold that pops on both the blue
// sky and the white clouds (paired with a dark halo by drawHoop).
const HOOP_NEXT = '#ffcc33';

/**
 * Top-down renderer. The diver is the camera (always screen-centre); the ground
 * — terrain, target, decorations — is drawn relative to it. Pixels-per-metre
 * grows as altitude shrinks, so the world visibly swells on the way down.
 *
 * Everything is a pure function of (state, config): animation frames derive
 * from `elapsed` and the state timers, never from wall-clock time, so pausing
 * the loop pauses every animation and replays render identically.
 */
export class SkyDiverRenderer {
  /** Optional sprite atlas; until it loads, procedural fallbacks are drawn. */
  atlas: SpriteAtlas | null = null;

  private terrain: Terrain | null = null;
  private terrainSeed = -1;
  private terrainTargetRadius = -1;
  private groundPattern: CanvasPattern | null = null;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly w: number,
    private readonly h: number,
  ) {}

  draw(s: GameState, cfg: GameConfig): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false; // nearest-neighbour, always
    const cx = this.w / 2;
    const cy = this.h / 2;

    // The cloud bonus dive is a different world (sky + hoops, no ground).
    if (s.phase === Phase.CloudDive || s.phase === Phase.CloudDone) {
      this.drawCloudScene(s, cfg, cx, cy);
      return;
    }

    if (s.groundSeed !== this.terrainSeed || cfg.targetRadius !== this.terrainTargetRadius) {
      this.terrain = generateTerrain(s.groundSeed, cfg);
      this.terrainSeed = s.groundSeed;
      this.terrainTargetRadius = cfg.targetRadius;
    }

    const altFraction = clamp(s.altitude / cfg.startAltitude, 0, 1);
    // Perspective zoom: ground features' angular size grows as 1/altitude, so
    // the world barely moves at exit height then rushes up over the last
    // hundred metres (real "ground rush") — a linear blend front-loads the
    // growth and makes the target huge moments after exit.
    const ppm =
      (this.groundPpm(cfg) * CAMERA_HEIGHT_M) / (Math.max(0, s.altitude) + CAMERA_HEIGHT_M);

    // --- Ground layers ---
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawTerrain(s, ppm, cx, cy);
    this.drawLandmark(s, ppm, cx, cy);
    this.drawGroundTexture();
    this.drawGrid(s, ppm, cx, cy);
    this.drawTarget(s, cfg, ppm, cx, cy);
    this.drawDecorations(s, ppm, cx, cy);
    this.drawShadow(s, cfg, ppm, cx, cy, altFraction);

    // Atmospheric haze: the ground fades toward the sky colour with altitude.
    ctx.fillStyle = withAlphaHex(COLORS.skyHigh, altFraction * 0.85);
    ctx.fillRect(0, 0, this.w, this.h);

    // --- Air layers (unaffected by haze) ---
    this.drawOutroEffects(s, cfg, cx, cy);
    // The diver falls away BELOW the plane, so the plane draws on top of him.
    this.drawDiver(s, cfg, cx, cy);
    this.drawPlane(s, cfg, cx, cy);

    if (s.phase === Phase.Freefall || s.phase === Phase.Deploying || s.phase === Phase.Canopy) {
      this.drawReticle(cx, cy);
    }
  }

  /** Pixels-per-metre at ground level: sized so the target nearly fills the view. */
  private groundPpm(cfg: GameConfig): number {
    return (this.w * 0.42) / cfg.targetRadius;
  }

  /**
   * Low-alpha grass-texture pattern over the base green and field tints —
   * screen-space on purpose (a subtle film grain, not world geometry).
   */
  private drawGroundTexture(): void {
    const ctx = this.ctx;
    const sheet = this.atlas?.ground;
    if (!sheet || typeof ctx.createPattern !== 'function') {
      return; // procedural fallback: flat ground, same as pre-atlas
    }
    this.groundPattern ??= ctx.createPattern(sheet.image, 'repeat');
    if (!this.groundPattern) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = this.groundPattern;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  private drawTerrain(s: GameState, ppm: number, cx: number, cy: number): void {
    const terrain = this.terrain;
    if (!terrain) {
      return;
    }
    const ctx = this.ctx;
    const minX = s.posX - cx / ppm;
    const maxX = s.posX + cx / ppm;
    const minY = s.posY - cy / ppm;
    const maxY = s.posY + cy / ppm;

    for (const f of terrain.fields) {
      if (f.x > maxX || f.x + f.w < minX || f.y > maxY || f.y + f.h < minY) {
        continue;
      }
      ctx.fillStyle = FIELD_TINTS[f.tint % FIELD_TINTS.length];
      ctx.fillRect(
        Math.round(cx + (f.x - s.posX) * ppm),
        Math.round(cy + (f.y - s.posY) * ppm),
        Math.max(1, Math.round(f.w * ppm)),
        Math.max(1, Math.round(f.h * ppm)),
      );
    }

    const road = terrain.road;
    ctx.fillStyle = COLORS.road;
    const widthPx = Math.max(1, Math.round(road.widthM * ppm));
    const lengthPx = Math.max(1, Math.round(2 * TERRAIN_EXTENT * ppm));
    if (road.orientation === 'h') {
      ctx.fillRect(
        Math.round(cx + (-TERRAIN_EXTENT - s.posX) * ppm),
        Math.round(cy + (road.offset - s.posY) * ppm),
        lengthPx,
        widthPx,
      );
    } else {
      ctx.fillRect(
        Math.round(cx + (road.offset - s.posX) * ppm),
        Math.round(cy + (-TERRAIN_EXTENT - s.posY) * ppm),
        widthPx,
        lengthPx,
      );
    }
  }

  /** The jump's big landmark: a lake, an airstrip (with a parked plane) or a
   *  forest floor (its trees ship as regular decorations). */
  private drawLandmark(s: GameState, ppm: number, cx: number, cy: number): void {
    const lm = this.terrain?.landmark;
    if (!lm) {
      return;
    }
    const ctx = this.ctx;
    const sx = (wx: number) => cx + (wx - s.posX) * ppm;
    const sy = (wy: number) => cy + (wy - s.posY) * ppm;

    switch (lm.kind) {
      case 'lake': {
        // Dark shore ring, water body, lit inner sheen.
        fillEllipse(ctx, sx(lm.x), sy(lm.y), lm.rx * ppm + 2, lm.ry * ppm + 2, COLORS.shadow);
        fillEllipse(ctx, sx(lm.x), sy(lm.y), lm.rx * ppm, lm.ry * ppm, COLORS.water);
        fillEllipse(
          ctx,
          sx(lm.x - lm.rx * 0.18),
          sy(lm.y - lm.ry * 0.18),
          lm.rx * 0.62 * ppm,
          lm.ry * 0.62 * ppm,
          COLORS.waterLight,
        );
        fillEllipse(
          ctx,
          sx(lm.x - lm.rx * 0.18),
          sy(lm.y - lm.ry * 0.18),
          lm.rx * 0.4 * ppm,
          lm.ry * 0.4 * ppm,
          COLORS.water,
        );
        return;
      }

      case 'airstrip': {
        const horizontal = lm.orientation === 'h';
        const len = lm.lengthM * ppm;
        const wid = lm.widthM * ppm;
        const x = sx(lm.x);
        const y = sy(lm.y);
        const rect = (cxp: number, cyp: number, w: number, h: number, color: string) => {
          ctx.fillStyle = color;
          ctx.fillRect(
            Math.round(cxp - w / 2),
            Math.round(cyp - h / 2),
            Math.max(1, Math.round(w)),
            Math.max(1, Math.round(h)),
          );
        };
        // Dirt strip with hard edges, threshold bars and centreline dashes.
        if (horizontal) {
          rect(x, y, len + 2, wid + 2, COLORS.shadow);
          rect(x, y, len, wid, COLORS.road);
          rect(x - len / 2 + 4 * ppm, y, 3 * ppm, wid * 0.7, COLORS.highlight);
          rect(x + len / 2 - 4 * ppm, y, 3 * ppm, wid * 0.7, COLORS.highlight);
          for (let m = -lm.lengthM / 2 + 24; m < lm.lengthM / 2 - 16; m += 24) {
            rect(sx(lm.x + m), y, 8 * ppm, 1.5 * ppm, COLORS.highlight);
          }
        } else {
          rect(x, y, wid + 2, len + 2, COLORS.shadow);
          rect(x, y, wid, len, COLORS.road);
          rect(x, y - len / 2 + 4 * ppm, wid * 0.7, 3 * ppm, COLORS.highlight);
          rect(x, y + len / 2 - 4 * ppm, wid * 0.7, 3 * ppm, COLORS.highlight);
          for (let m = -lm.lengthM / 2 + 24; m < lm.lengthM / 2 - 16; m += 24) {
            rect(x, sy(lm.y + m), 1.5 * ppm, 8 * ppm, COLORS.highlight);
          }
        }
        // A biplane parked beside the threshold — this is where the jump ship
        // takes off from.
        const sheet = this.atlas?.plane;
        if (sheet) {
          const planeScale = (14 * ppm) / (sheet.fw / sheet.res);
          const px = horizontal ? lm.x - lm.lengthM / 2 + 12 : lm.x + lm.widthM / 2 + 9;
          const py = horizontal ? lm.y + lm.widthM / 2 + 9 : lm.y - lm.lengthM / 2 + 12;
          drawSprite(ctx, sheet, 0, sx(px), sy(py), planeScale, horizontal ? 0 : Math.PI / 2);
        }
        return;
      }

      case 'forest': {
        fillEllipse(ctx, sx(lm.x), sy(lm.y), lm.r * ppm, lm.r * ppm, COLORS.forestFloor);
        return; // the trees themselves are regular decorations
      }
    }
  }

  private drawGrid(s: GameState, ppm: number, cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = withAlpha(255, 255, 255, 0.06);
    ctx.lineWidth = 1;

    const spanX = this.w / ppm;
    const firstX = Math.floor((s.posX - spanX / 2) / GRID_METRES) * GRID_METRES;
    for (let gx = firstX; gx < s.posX + spanX / 2; gx += GRID_METRES) {
      const x = Math.round(cx + (gx - s.posX) * ppm) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }

    const spanY = this.h / ppm;
    const firstY = Math.floor((s.posY - spanY / 2) / GRID_METRES) * GRID_METRES;
    for (let gy = firstY; gy < s.posY + spanY / 2; gy += GRID_METRES) {
      const y = Math.round(cy + (gy - s.posY) * ppm) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }
  }

  private drawTarget(s: GameState, cfg: GameConfig, ppm: number, cx: number, cy: number): void {
    const ctx = this.ctx;
    const tx = Math.round(cx - s.posX * ppm);
    const ty = Math.round(cy - s.posY * ppm);
    const r = cfg.targetRadius * ppm;

    fillCircle(ctx, tx, ty, r, withAlpha(232, 216, 176, 0.18)); // parchment wash
    strokeRing(ctx, tx, ty, r, COLORS.parchment, 2);
    strokeRing(ctx, tx, ty, r * 0.6, COLORS.brass, 2);
    strokeRing(ctx, tx, ty, r * 0.3, COLORS.red, 2);
    fillCircle(ctx, tx, ty, Math.max(2, cfg.bullseyeRadius * ppm), COLORS.red);
    fillCircle(ctx, tx, ty, Math.max(1, cfg.bullseyeRadius * ppm * 0.4), COLORS.highlight);
  }

  private drawDecorations(s: GameState, ppm: number, cx: number, cy: number): void {
    const terrain = this.terrain;
    if (!terrain) {
      return;
    }
    const ctx = this.ctx;
    const margin = 20; // metres, so big sprites don't pop at the edge
    const minX = s.posX - cx / ppm - margin;
    const maxX = s.posX + cx / ppm + margin;
    const minY = s.posY - cy / ppm - margin;
    const maxY = s.posY + cy / ppm + margin;
    const sheet = this.atlas?.terrain;

    for (const d of terrain.decorations) {
      if (d.x < minX || d.x > maxX || d.y < minY || d.y > maxY) {
        continue;
      }
      const x = cx + (d.x - s.posX) * ppm;
      const y = cy + (d.y - s.posY) * ppm;
      const sizePx = d.sizeM * ppm;
      if (!sheet || sizePx < 2) {
        // Too small to read (or no atlas yet): a tinted dot keeps the world alive.
        ctx.fillStyle = DECOR_DOTS[d.sprite];
        const dot = Math.max(1, Math.round(sizePx));
        ctx.fillRect(Math.round(x - dot / 2), Math.round(y - dot / 2), dot, dot);
        continue;
      }
      const rotation = d.sprite === TerrainSprite.Windsock ? Math.atan2(s.windY, s.windX) : 0;
      // Scale is in logical art pixels, so divide by the sheet's logical width.
      drawSprite(ctx, sheet, d.sprite, x, y, (sizePx * sheet.res) / sheet.fw, rotation);
    }
  }

  /** Drop shadow on the ground — offset by altitude, converging at touchdown. */
  private drawShadow(
    s: GameState,
    cfg: GameConfig,
    ppm: number,
    cx: number,
    cy: number,
    altFraction: number,
  ): void {
    const ctx = this.ctx;
    const offset = s.altitude * 0.15; // metres of sun slant
    const x = cx + offset * ppm;
    const y = cy + offset * ppm;
    const r = Math.max(1.5, 6 * (1 - altFraction * 0.75));
    ctx.fillStyle = withAlphaHex(COLORS.shadow, 0.25);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Intro biplane: crosses the drop zone and reaches the exit point at jump time. */
  private drawPlane(s: GameState, cfg: GameConfig, cx: number, cy: number): void {
    // Position along the flight line is a pure function of elapsed: at
    // `elapsed === introDuration` the plane is exactly over the exit point.
    const t = s.elapsed - cfg.introDuration;
    if (cfg.introDuration <= 0 || t > 2.5) {
      return; // long gone
    }
    const dist = PLANE_SPEED * t;
    const x = cx + s.planeDirX * dist * PLANE_PPM;
    const y = cy + s.planeDirY * dist * PLANE_PPM;
    // The plane stays at exit altitude: once the diver falls away it recedes.
    const depth = cfg.startAltitude - s.altitude;
    const scale = 2 / (1 + depth / 60);
    if (scale < 0.25) {
      return;
    }
    const angle = Math.atan2(s.planeDirY, s.planeDirX);
    const sheet = this.atlas?.plane;
    const ctx = this.ctx;
    if (sheet) {
      const prop = Math.floor(s.elapsed * 12) % 3;
      drawSprite(ctx, sheet, prop, x, y, scale, angle);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(-14 * scale, -3 * scale, 28 * scale, 6 * scale); // fuselage
      ctx.fillRect(-4 * scale, -10 * scale, 8 * scale, 20 * scale); // wing
      ctx.restore();
    }
  }

  /** Landing dust / crash debris during the first part of the outro. */
  private drawOutroEffects(s: GameState, cfg: GameConfig, cx: number, cy: number): void {
    if ((s.phase !== Phase.Landed && s.phase !== Phase.Crashed) || cfg.outroDuration <= 0) {
      return;
    }
    const progress = 1 - s.outroTimer / cfg.outroDuration;
    const burst = s.phase === Phase.Crashed ? 0.45 : 0.25;
    if (progress > burst) {
      return;
    }
    const ctx = this.ctx;
    const spread = 6 + progress * 40;
    ctx.fillStyle = withAlphaHex(COLORS.parchment, 0.7 * (1 - progress / burst));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      ctx.fillRect(
        Math.round(cx + Math.cos(a) * spread),
        Math.round(cy + Math.sin(a) * spread * 0.7),
        2,
        2,
      );
    }
  }

  private drawDiver(s: GameState, cfg: GameConfig, cx: number, cy: number): void {
    const ctx = this.ctx;
    const atlas = this.atlas;
    // Exit flourish only: the diver fills the view as he drops away from the
    // plane, then settles to a CONSTANT size for the rest of the fall — the
    // camera follows him, so a steadily shrinking sprite would read as the
    // view receding.
    const fallen = cfg.startAltitude - s.altitude;
    const fallScale = 1.5 + 1.2 * Math.max(0, 1 - fallen / EXIT_ZOOM_METRES);

    switch (s.phase) {
      case Phase.PlaneApproach:
        return; // still aboard the plane

      case Phase.Freefall:
      case Phase.CloudDive:
      case Phase.CloudDone: {
        this.drawSpeedTrail(s, cfg, cx, cy);
        const sheet = atlas?.['diver-freefall'];
        // Lean into the lateral motion (pure function of state: velocity).
        const lean = clamp(s.velX * 0.04, -0.4, 0.4);
        if (sheet) {
          // Pitch pose: 0 full arch … 2 neutral … 4 full track.
          const frame = Math.round(((clamp(s.pitch, -1, 1) + 1) / 2) * (sheet.frames - 1));
          drawSprite(ctx, sheet, frame, cx, cy, fallScale, lean);
        } else {
          fillCircle(ctx, cx, cy, 3 * fallScale, COLORS.red);
          fillCircle(ctx, cx, cy, 1.5 * fallScale, COLORS.highlight);
        }
        return;
      }

      case Phase.Deploying: {
        const p = 1 - s.deployTimer / Math.max(cfg.deployDuration, 1e-9);
        const sheet = atlas?.['diver-deploy'];
        if (sheet) {
          const frame = Math.min(sheet.frames - 1, Math.floor(p * sheet.frames));
          // The diver occupies the lower 16 rows of the 16x24 frame; lift the
          // sprite so the diver, not the canopy, sits at screen centre.
          drawSprite(ctx, sheet, frame, cx, cy - 4 * fallScale, fallScale);
        } else {
          fillCircle(ctx, cx, cy, 3 * fallScale, COLORS.red);
          strokeRing(ctx, cx, cy - 4 - p * 4, (3 + p * 7) * fallScale, COLORS.brass, 2);
        }
        return;
      }

      case Phase.Canopy: {
        const canopyScale = 0.9; // constant: the follow-camera never pulls away
        const sheet = atlas?.canopy;
        const flashing = s.stalled && blink(s.elapsed);
        if (sheet) {
          const frame = s.stalled ? 3 : s.flareAmount > 0.45 ? 2 : Math.floor(s.elapsed * 2) % 2;
          drawSprite(ctx, sheet, frame, cx, cy - 2, canopyScale);
          ctx.fillStyle = COLORS.shadow;
          ctx.fillRect(cx - 1, cy - 2 + Math.round(14 * canopyScale), 3, 4); // diver hanging below
          if (flashing) {
            strokeRing(ctx, cx, cy - 2, 16 * canopyScale, COLORS.red, 2);
          }
        } else {
          const color = flashing ? COLORS.red : COLORS.brass;
          fillCircle(ctx, cx, cy - 2, 10, withAlpha(217, 164, 65, flashing ? 0.7 : 0.45));
          strokeRing(ctx, cx, cy - 2, 10, color, 2);
          ctx.fillStyle = COLORS.shadow;
          ctx.fillRect(cx - 1, cy + 4, 3, 4);
        }
        return;
      }

      case Phase.Landed: {
        const sheet = atlas?.['diver-land'];
        if (sheet) {
          drawSprite(ctx, sheet, this.outroFrame(s, cfg, sheet.frames), cx, cy, 1.5);
        } else {
          fillCircle(ctx, cx, cy, 4, COLORS.brass);
        }
        return;
      }

      case Phase.Crashed: {
        const sheet = atlas?.['diver-crash'];
        if (sheet) {
          drawSprite(ctx, sheet, this.outroFrame(s, cfg, sheet.frames), cx, cy, 1.5);
        } else {
          fillCircle(ctx, cx, cy, 4, COLORS.redDark);
        }
        return;
      }
    }
  }

  /**
   * Speed trail behind the falling diver (the original game streams white dots
   * after him). Points opposite to the ground-plane velocity, so a track dive
   * leaves a wake; it fades in with speed and flickers with `elapsed`.
   */
  private drawSpeedTrail(s: GameState, cfg: GameConfig, cx: number, cy: number): void {
    const speed = Math.hypot(s.velX, s.velY);
    const rush = Math.max(speed / 6, (s.descentSpeed - cfg.freefallTerminal) / 20);
    if (rush < 0.3) {
      return;
    }
    const dirX = speed > 0.5 ? -s.velX / speed : 0;
    const dirY = speed > 0.5 ? -s.velY / speed : 1; // no ground motion: wake trails south
    const ctx = this.ctx;
    const wiggle = blink(s.elapsed) ? 1 : -1;
    for (let i = 1; i <= 3; i++) {
      const d = 10 + i * 5;
      ctx.fillStyle = withAlphaHex(COLORS.highlight, Math.min(0.6, rush * 0.6) / i);
      ctx.fillRect(
        Math.round(cx + dirX * d + wiggle * (i % 2)),
        Math.round(cy + dirY * d + wiggle * ((i + 1) % 2)),
        2,
        2,
      );
    }
  }

  /** Outro animation: advance through the strip, then loop the last two frames. */
  private outroFrame(s: GameState, cfg: GameConfig, frames: number): number {
    if (cfg.outroDuration <= 0 || s.outroTimer <= 0) {
      return frames - 1 - (Math.floor(s.elapsed * 3) % 2);
    }
    const progress = 1 - s.outroTimer / cfg.outroDuration;
    return Math.min(frames - 1, Math.floor(progress * frames));
  }

  private drawReticle(cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.highlight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 0.5);
    ctx.lineTo(cx - 3, cy + 0.5);
    ctx.moveTo(cx + 3, cy + 0.5);
    ctx.lineTo(cx + 9, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - 9);
    ctx.lineTo(cx + 0.5, cy - 3);
    ctx.moveTo(cx + 0.5, cy + 3);
    ctx.lineTo(cx + 0.5, cy + 9);
    ctx.stroke();
  }

  /** The cloud bonus dive: warm sky, a top-down cloud field, then the scoring hoops. */
  private drawCloudScene(s: GameState, cfg: GameConfig, cx: number, cy: number): void {
    const ctx = this.ctx;
    // A warm high-altitude sky that flatters the cream/amber-rimmed cloud sprites.
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, '#34508a');
    sky.addColorStop(0.55, '#7f9fc9');
    sky.addColorStop(1, '#c9c3a8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawClouds(s, cfg, cx, cy);
    this.drawCloudRings(s, cx, cy);
    this.drawDiver(s, cfg, cx, cy);
    this.drawReticle(cx, cy);
  }

  /**
   * Top-down cloud field: puffs live at world positions and altitudes and are
   * projected by their depth below the diver — exactly like the jump camera
   * grows the ground. As he falls they swell and stream outward from centre,
   * then fade as they sweep past his level, so the plummet feels alive without
   * leaving the straight-down view. Deterministic (a pure function of state).
   */
  private drawClouds(s: GameState, cfg: GameConfig, cx: number, cy: number): void {
    const ctx = this.ctx;
    const sheet = this.atlas?.clouds ?? null;
    const SPAN = 700; // depth band (m) the field endlessly recycles over
    const SPREAD = 170; // world offset of a puff from the dive line (m)
    const BASE = 2.2; // puff pixels-per-metre at the diver's own level
    const H = 160; // perspective falloff
    const COUNT = 16;
    const fallen = cfg.cloudStartAltitude - s.altitude;

    const puffs: {
      depth: number;
      a: number;
      x: number;
      y: number;
      scale: number;
      frame: number;
    }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const depth = mod(cloudHash(s.groundSeed, i * 4) * SPAN - fallen, SPAN);
      // Fade in as a puff spawns far below, out as it sweeps past the diver.
      const a = clamp(Math.min(depth / 90, (SPAN - depth) / 130), 0, 1) * 0.92;
      if (a < 0.03) {
        continue;
      }
      const dir = cloudHash(s.groundSeed, i * 4 + 1) * Math.PI * 2;
      const mag = (0.15 + 0.85 * cloudHash(s.groundSeed, i * 4 + 2)) * SPREAD;
      const ppm = (BASE * H) / (depth + H);
      puffs.push({
        depth,
        a,
        x: cx + (Math.cos(dir) * mag - s.posX) * ppm,
        y: cy + (Math.sin(dir) * mag - s.posY) * ppm,
        scale: ppm,
        frame: Math.floor(cloudHash(s.groundSeed, i * 4 + 3) * 3),
      });
    }
    puffs.sort((p, q) => q.depth - p.depth); // far → near, so nearer puffs overlap
    for (const p of puffs) {
      ctx.globalAlpha = p.a;
      if (sheet) {
        drawSprite(ctx, sheet, Math.min(sheet.frames - 1, p.frame), p.x, p.y, p.scale);
      } else {
        this.drawPuff(p.x, p.y, 22 * p.scale);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPuff(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    fillEllipse(ctx, x, y + r * 0.18, r * 1.05, r * 0.5, withAlphaHex(COLORS.parchment, 0.55)); // shaded base
    fillEllipse(ctx, x, y, r, r * 0.6, withAlphaHex(COLORS.parchment, 0.9));
    fillEllipse(ctx, x - r * 0.35, y - r * 0.12, r * 0.6, r * 0.42, withAlpha(255, 255, 255, 0.95)); // lit crown
  }

  /**
   * Scoring hoops as flat top-down rings (matching the bullseye target), grown
   * by their depth below the diver. Only the NEXT hoop (vivid, pulsing) and the
   * one after it (dim) are shown for readability; a just-passed hoop bursts into
   * a green ring + sparkles, a missed one fades red, and a chevron points to the
   * next hoop when it drifts off-centre. Pure function of (state): the flashes
   * derive from how far the diver has dropped past each hoop.
   */
  private drawCloudRings(s: GameState, cx: number, cy: number): void {
    const ctx = this.ctx;
    // Sized so a hoop frames the diver (fits the canvas with margin) at the
    // moment of crossing; the offset/radius ratio — "am I inside?" — is
    // independent of this scale, so readability of the catch is preserved.
    const BASE_PPM = 2.5;
    const RING_H = 120;
    const BURST = 16; // metres of fall (~0.5s) for a brief pass/miss flash

    const project = (ring: CloudRing): { depth: number; x: number; y: number; r: number } => {
      const depth = s.altitude - ring.altitude;
      const ppm = (BASE_PPM * RING_H) / (Math.max(0, depth) + RING_H);
      return {
        depth,
        x: cx + (ring.x - s.posX) * ppm,
        y: cy + (ring.y - s.posY) * ppm,
        r: ring.radius * ppm,
      };
    };

    // Pass / miss flash: a resolved hoop sits just above us (depth < 0) and
    // expands+fades as we drop away; a clean pass throws off sparkles.
    for (const ring of s.rings) {
      if (ring.passed === null) {
        continue;
      }
      const { depth, x, y, r } = project(ring);
      const p = -depth / BURST;
      if (p < 0 || p > 1) {
        continue;
      }
      const col = ring.passed ? '#7bbf5a' : COLORS.red;
      strokeRing(ctx, x, y, r * (1 + p * 0.35), withAlphaHex(col, 1 - p), 2);
      if (ring.passed) {
        ctx.fillStyle = withAlphaHex('#eafbe0', 1 - p);
        for (let k = 0; k < 6; k++) {
          const a2 = (k / 6) * Math.PI * 2 + s.elapsed * 2;
          const rr = r * (1.1 + p * 0.7);
          ctx.fillRect(
            Math.round(x + Math.cos(a2) * rr) - 1,
            Math.round(y + Math.sin(a2) * rr) - 1,
            2,
            2,
          );
        }
      }
    }

    // Upcoming hoops, nearest (highest altitude below us) first.
    const upcoming = s.rings
      .filter((ring) => ring.passed === null)
      .sort((a, b) => b.altitude - a.altitude);
    const soon = upcoming[1];
    if (soon) {
      const { x, y, r } = project(soon);
      this.drawHoop(x, y, r, COLORS.brass, 2, 0.4);
    }
    const next = upcoming[0];
    if (next) {
      const { x, y, r } = project(next);
      this.drawHoop(x, y, r, blink(s.elapsed) ? COLORS.highlight : HOOP_NEXT, 3, 1);
      this.drawHoopArrow(cx, cy, x, y, HOOP_NEXT);
    }
  }

  /** A flat hoop: dark halo for contrast, coloured rim, faint inner sheen. */
  private drawHoop(
    x: number,
    y: number,
    r: number,
    color: string,
    width: number,
    alpha: number,
  ): void {
    if (r <= 0) {
      return;
    }
    const ctx = this.ctx;
    strokeRing(ctx, x, y, r + 1, withAlphaHex(COLORS.shadow, 0.4 * alpha), width + 2);
    strokeRing(ctx, x, y, r, withAlphaHex(color, alpha), width);
    strokeRing(ctx, x, y, Math.max(1, r - width), withAlphaHex(COLORS.highlight, 0.5 * alpha), 1);
  }

  /** Chevron at a fixed radius pointing toward the next hoop when it's off-centre. */
  private drawHoopArrow(cx: number, cy: number, px: number, py: number, color: string): void {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 42) {
      return; // already lined up — no need to nag
    }
    const ang = Math.atan2(dy, dx);
    const rad = Math.min(dist, 96);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -6);
    ctx.lineTo(-5, 6);
    ctx.fill();
    ctx.restore();
  }
}

// --- small drawing/colour helpers (kept local; no external dependency) ---

/** Deterministic blink derived from simulation time, never the wall clock. */
function blink(elapsed: number): boolean {
  return Math.floor(elapsed / 0.18) % 2 === 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Screen-space wrap that stays positive (JS `%` can return negatives). */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Stateless 0..1 hash for deterministic cloud placement (GLSL-style). */
function cloudHash(seed: number, i: number): number {
  const x = Math.sin(seed * 0.013 + i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function withAlpha(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

function withAlphaHex(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return withAlpha(r, g, b, a);
}

function strokeRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  width: number,
): void {
  if (r <= 0) {
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function fillEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void {
  if (rx <= 0 || ry <= 0) {
    return;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function fillCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  if (r <= 0) {
    return;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

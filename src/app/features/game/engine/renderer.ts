import type { GameConfig, GameState } from './types';
import { Phase } from './types';

// Palette accents mirrored from src/styles/_tokens.scss (a canvas can't cheaply
// read CSS custom properties every frame). Keep these in sync with the tokens.
const COLORS = {
  red: '#c1352b', // --biplane-red
  redDark: '#8f231c', // --biplane-red-dark
  brass: '#d9a441', // --brass
  parchment: '#e8d8b0', // --parchment
  highlight: '#fff7e0', // --highlight
  shadow: '#11161f', // --shadow
  skyHigh: '#1a2b45', // --sky-bg (atmospheric haze when high up)
  // Game-world ground (fields seen from above) — not part of the UI token set.
  ground: '#4f7a3a',
};

const GRID_METRES = 40;

/**
 * Top-down renderer. The diver is the camera (always screen-centre); the ground
 * — target, grid — is drawn relative to the diver. Pixels-per-metre grows as
 * altitude shrinks, so the bullseye visibly grows on the way down.
 */
export class SkyDiverRenderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly w: number,
    private readonly h: number,
  ) {}

  draw(s: GameState, cfg: GameConfig): void {
    const ctx = this.ctx;
    const cx = this.w / 2;
    const cy = this.h / 2;

    // Ground darkens toward the sky colour with altitude (haze).
    const altFraction = clamp(s.altitude / cfg.startAltitude, 0, 1);
    ctx.fillStyle = mix(COLORS.ground, COLORS.skyHigh, altFraction * 0.85);
    ctx.fillRect(0, 0, this.w, this.h);

    const ppm = lerp(this.groundPpm(cfg), 0.22, altFraction);

    this.drawGrid(s, ppm, cx, cy);
    this.drawTarget(s, cfg, ppm, cx, cy);
    this.drawDiver(s, cx, cy);
  }

  /** Pixels-per-metre at ground level: sized so the target nearly fills the view. */
  private groundPpm(cfg: GameConfig): number {
    return (this.w * 0.42) / cfg.targetRadius;
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

  private drawDiver(s: GameState, cx: number, cy: number): void {
    const ctx = this.ctx;

    // Landing reticle — where you'll touch down.
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

    if (s.phase === Phase.Canopy) {
      const flashing = s.stalled && blink();
      const color = flashing ? COLORS.red : COLORS.brass;
      fillCircle(ctx, cx, cy - 2, 10, withAlpha(217, 164, 65, flashing ? 0.7 : 0.45));
      strokeRing(ctx, cx, cy - 2, 10, color, 2);
      ctx.fillStyle = COLORS.shadow;
      ctx.fillRect(cx - 1, cy + 4, 3, 4); // diver body below the canopy
    } else if (s.phase === Phase.Freefall) {
      fillCircle(ctx, cx, cy, 4, COLORS.red);
      fillCircle(ctx, cx, cy, 2, COLORS.highlight);
    } else {
      fillCircle(ctx, cx, cy, 4, s.phase === Phase.Crashed ? COLORS.redDark : COLORS.brass);
    }
  }
}

// --- small drawing/colour helpers (kept local; no external dependency) ---

function blink(): boolean {
  return Math.floor(performance.now() / 180) % 2 === 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `rgb(${Math.round(lerp(ar, br, t))},${Math.round(lerp(ag, bg, t))},${Math.round(lerp(ab, bb, t))})`;
}

function withAlpha(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
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

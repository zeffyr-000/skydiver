/**
 * Crisp pixel text for the canvas HUD. Presentation-side (DOM canvas), like
 * renderer.ts.
 *
 * Browsers anti-alias `fillText` even for pixel fonts, which turns into soft
 * grey fringes once the internal canvas is scaled up. So each glyph is
 * rasterised once at the font's native size, its alpha is thresholded to hard
 * on/off pixels, and the mask is cached (plus one tinted copy per colour).
 * Text is then laid out glyph by glyph on whole pixels.
 */
/** Supersampling factor for glyph rasterisation. */
const SS = 8;

export class PixelFont {
  /** Pixels from the top of a line to the baseline. */
  readonly ascent: number;
  /** Line box height (ascent + descent). */
  readonly lineHeight: number;

  private readonly masks = new Map<string, { canvas: HTMLCanvasElement; advance: number }>();
  private readonly tinted = new Map<string, HTMLCanvasElement>();
  private readonly probe: CanvasRenderingContext2D;

  /** `css` is a canvas font shorthand at the font's native size, e.g. `8px Silkscreen`. */
  constructor(private readonly css: string) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas unavailable');
    }
    ctx.font = css;
    const m = ctx.measureText('ÉHgy');
    this.ascent = Math.ceil(m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 8);
    this.lineHeight = this.ascent + Math.ceil(m.fontBoundingBoxDescent || 2);
    this.probe = ctx;
  }

  /** Width of `text` in pixels. */
  measure(text: string): number {
    let w = 0;
    for (const ch of text) {
      w += this.glyph(ch).advance;
    }
    return w;
  }

  /** Draw `text` with its line box's top-left at (x, y); returns the width drawn. */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): number {
    let cx = Math.round(x);
    const top = Math.round(y) - 2;
    for (const ch of text) {
      const g = this.glyph(ch);
      if (ch !== ' ') {
        ctx.drawImage(this.tint(ch, color), cx - 1, top);
      }
      cx += g.advance;
    }
    return cx - Math.round(x);
  }

  private glyph(ch: string): { canvas: HTMLCanvasElement; advance: number } {
    let g = this.masks.get(ch);
    if (g) {
      return g;
    }
    this.probe.font = this.css;
    const advance = Math.round(this.probe.measureText(ch).width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, advance + 2);
    canvas.height = this.lineHeight + 4;
    // Rasterise ×SS and read each pixel's centre: a pixel font's outlines sit on
    // its grid, so block centres are immune to the browser's sub-pixel
    // placement (thresholding at 1× dropped thin strokes: "WIND" → "WIIID").
    const big = document.createElement('canvas');
    big.width = canvas.width * SS;
    big.height = canvas.height * SS;
    const bctx = big.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (bctx && ctx) {
      bctx.font = this.cssAt(SS);
      bctx.textBaseline = 'alphabetic';
      bctx.fillStyle = '#fff';
      bctx.fillText(ch, SS, (this.ascent + 2) * SS);
      const src = bctx.getImageData(0, 0, big.width, big.height).data;
      const img = ctx.createImageData(canvas.width, canvas.height);
      const d = img.data;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const sx = x * SS + SS / 2;
          const sy = y * SS + SS / 2;
          const on = src[(sy * big.width + sx) * 4 + 3] >= 128;
          const i = (y * canvas.width + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = 255;
          d[i + 3] = on ? 255 : 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    g = { canvas, advance };
    this.masks.set(ch, g);
    return g;
  }

  /** The CSS font shorthand with its pixel size multiplied by `k`. */
  private cssAt(k: number): string {
    return this.css.replace(/(\d+(?:\.\d+)?)px/, (_, n: string) => `${Number(n) * k}px`);
  }

  private tint(ch: string, color: string): HTMLCanvasElement {
    const key = `${color}|${ch}`;
    let c = this.tinted.get(key);
    if (c) {
      return c;
    }
    const mask = this.glyph(ch).canvas;
    c = document.createElement('canvas');
    c.width = mask.width;
    c.height = mask.height;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this.tinted.set(key, c);
    return c;
  }
}

/**
 * The HUD's type set, created once the web fonts are loaded. All Departure
 * Mono: its glyphs sit exactly on an 11 px grid, so they threshold cleanly
 * (Silkscreen's sub-pixel diagonals turned M/N/W into "II" on the canvas).
 */
export interface HudFonts {
  /** 11 px — labels and small print. */
  small: PixelFont;
  /** 22 px (2× native) — banners and verdicts. */
  big: PixelFont;
  /** 11 px — values, prompts and mixed-case sentences (coaching tips). */
  body: PixelFont;
}

/** Load the HUD fonts (resolves to null if they can't be loaded or there's no canvas). */
export async function loadHudFonts(): Promise<HudFonts | null> {
  try {
    await Promise.all([
      document.fonts.load('11px "Departure Mono"'),
      document.fonts.load('22px "Departure Mono"'),
    ]);
    const body = new PixelFont('11px "Departure Mono"');
    return { small: body, big: new PixelFont('22px "Departure Mono"'), body };
  } catch {
    return null;
  }
}

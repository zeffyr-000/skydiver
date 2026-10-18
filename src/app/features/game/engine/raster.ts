/**
 * A tiny pixel raster over an `ImageData`, for crisp shapes in the Mode 7
 * renderer: canvas paths anti-alias, which turns into soft fringes once the
 * internal canvas is scaled up, so lines, rings and HUD shapes are plotted
 * here pixel by pixel instead. Colours are packed `0xAABBGGRR` (little-endian
 * RGBA), see ground-texture.ts.
 */
export class Raster {
  readonly image: ImageData;
  readonly px: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.image =
      typeof ImageData === 'function'
        ? new ImageData(w, h)
        : ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as unknown as ImageData);
    this.px = new Uint32Array(this.image.data.buffer);
  }

  clear(c = 0): void {
    this.px.fill(c);
  }

  plot(x: number, y: number, c: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix >= 0 && iy >= 0 && ix < this.w && iy < this.h) {
      this.px[iy * this.w + ix] = c;
    }
  }

  /** Alpha-blend `c` over the pixel (the result is opaque). */
  blend(x: number, y: number, c: number, a: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h || a <= 0) {
      return;
    }
    const i = iy * this.w + ix;
    const d = this.px[i];
    if (a >= 1 || d >>> 24 === 0) {
      this.px[i] = c;
      return;
    }
    this.px[i] = mixPacked(d, c, a);
  }

  /** Multiply the RGB of existing pixels in an ellipse by `f` (shadows). */
  shadeEllipse(cx: number, cy: number, rx: number, ry: number, f: number): void {
    if (rx <= 0 || ry <= 0) {
      return;
    }
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.max(0, Math.round(cx - half));
      const x1 = Math.min(this.w - 1, Math.round(cx + half) - 1);
      for (let x = x0; x <= x1; x++) {
        const i = y * this.w + x;
        this.px[i] = scalePacked(this.px[i], f);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      this.px.fill(c, yy * this.w + x0, yy * this.w + Math.max(x0, x1));
    }
  }

  /** A line with a square brush `thick` pixels wide; `a` < 1 blends (thin lines only). */
  line(x0: number, y0: number, x1: number, y1: number, c: number, thick = 1, a = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const lo = -Math.floor((thick - 1) / 2);
    const hi = lo + thick - 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (dx * i) / n);
      const y = Math.round(y0 + (dy * i) / n);
      if (thick === 1) {
        this.blend(x, y, c, a);
        continue;
      }
      for (let oy = lo; oy <= hi; oy++) {
        for (let ox = lo; ox <= hi; ox++) {
          this.plot(x + ox, y + oy, c);
        }
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: number): void {
    const y0 = Math.floor(cy - r);
    const y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      if (Math.abs(dy) > r) continue;
      const half = Math.sqrt(r * r - dy * dy);
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
        this.plot(x, y, c);
      }
    }
  }

  /** One-pixel circle outline (midpoint algorithm). */
  circle(cx: number, cy: number, r: number, c: number): void {
    let x = Math.round(r);
    let y = 0;
    let err = 1 - x;
    const ox = Math.round(cx);
    const oy = Math.round(cy);
    while (x >= y) {
      for (const [px, py] of [
        [x, y],
        [y, x],
        [-y, x],
        [-x, y],
        [-x, -y],
        [-y, -x],
        [y, -x],
        [x, -y],
      ]) {
        this.plot(ox + px, oy + py, c);
      }
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  /** Filled triangle (scanline), for arrows and chevrons. */
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number): void {
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1, y2)));
    const edges: [number, number, number, number][] = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      let lo = Infinity;
      let hi = -Infinity;
      for (const [ax, ay, bx, by] of edges) {
        if (sy < ay === sy < by) continue;
        const x = ax + ((sy - ay) / (by - ay)) * (bx - ax);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      for (let x = Math.round(lo); x < Math.round(hi); x++) {
        this.plot(x, y, c);
      }
    }
  }
}

export function mixPacked(d: number, c: number, a: number): number {
  const r = (d & 255) + ((c & 255) - (d & 255)) * a;
  const g = ((d >>> 8) & 255) + (((c >>> 8) & 255) - ((d >>> 8) & 255)) * a;
  const b = ((d >>> 16) & 255) + (((c >>> 16) & 255) - ((d >>> 16) & 255)) * a;
  return ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}

function scalePacked(c: number, f: number): number {
  const r = Math.round((c & 255) * f);
  const g = Math.round(((c >>> 8) & 255) * f);
  const b = Math.round(((c >>> 16) & 255) * f);
  return ((c & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
}

/** 3×5 digits for tiny dial numerals (rows top → bottom, bit 2 = left). */
const DIGITS: Record<string, readonly number[]> = {
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 3, 1, 7],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7],
  '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7],
};

/** Width in pixels of `text` in the 3×5 digits (1 px apart). */
export function tinyWidth(text: string): number {
  return text.length * 4 - 1;
}

/** Plot `text` (digits only) in the 3×5 font with its top-left at (x, y). */
export function tinyText(r: Raster, text: string, x: number, y: number, c: number): void {
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of text) {
    const rows = DIGITS[ch];
    if (rows) {
      rows.forEach((bits, row) => {
        for (let col = 0; col < 3; col++) {
          if (bits & (4 >> col)) {
            r.plot(cx + col, cy + row, c);
          }
        }
      });
    }
    cx += 4;
  }
}

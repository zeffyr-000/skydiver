/**
 * Turns a frame of the game canvas into a press photo for the result's front
 * page: cropped to 16:9, shrunk and ordered-dithered (Bayer 4×4) onto the same
 * sepia ramp as the Sky Gazette's plates, so the jump lands in the paper like
 * the 1920s photographs do. DOM-only (it needs a 2D canvas); returns null
 * where there is none, e.g. under jsdom.
 */

/** Photo size in photo pixels (shown at ×2). */
export const PHOTO_W = 180;
export const PHOTO_H = 101;

// Dark → light: ink, two browns, parchment-dark, canvas-cream (_tokens.scss).
const SEPIA: readonly (readonly [number, number, number])[] = [
  [0x2b, 0x1f, 0x12],
  [0x5b, 0x44, 0x26],
  [0x8e, 0x71, 0x48],
  [0xc9, 0xb2, 0x85],
  [0xf3, 0xe9, 0xcf],
];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function gazettePhoto(source: HTMLCanvasElement): string | null {
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = PHOTO_W;
  canvas.height = PHOTO_H;
  const ctx = canvas.getContext('2d');
  if (!ctx || !source.width || !source.height) {
    return null;
  }
  // Centre crop to the photo's aspect, then let the browser average it down.
  const aspect = PHOTO_W / PHOTO_H;
  const cw = Math.min(source.width, source.height * aspect);
  const ch = cw / aspect;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
    (source.width - cw) / 2,
    (source.height - ch) / 2,
    cw,
    ch,
    0,
    0,
    PHOTO_W,
    PHOTO_H,
  );

  const image = ctx.getImageData(0, 0, PHOTO_W, PHOTO_H);
  const px = image.data;
  const n = PHOTO_W * PHOTO_H;
  const lum = new Float32Array(n);
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const v = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    lum[i] = v;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const steps = SEPIA.length - 1;
  const range = Math.max(1e-3, hi - lo);
  for (let i = 0; i < n; i++) {
    const scaled = ((lum[i] - lo) / range) * steps;
    const base = Math.min(steps - 1, Math.floor(scaled));
    const x = i % PHOTO_W;
    const y = Math.floor(i / PHOTO_W);
    const threshold = (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
    const [r, g, b] = SEPIA[base + (scaled - base > threshold ? 1 : 0)];
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

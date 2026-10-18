/**
 * Reference internal resolution (16:9); the actual one adapts around it.
 * 640×360 divides the common screens by whole numbers (×2 at 720p, ×3 at
 * 1080p, ×4 at 1440p, ×6 at 4K): fine "HD pixel art" rather than chunky 8-bit.
 * The voxel sprites are baked for it (tools/bake-voxels.mjs DENSITY).
 */
export const BASE_W = 640;
export const BASE_H = 360;
/** How far the internal resolution may stretch to fill an odd window (×4/3). */
const MAX_W = 852;
const MAX_H = 480;

/**
 * Pixel-perfect viewport: the largest whole-number scale at which the 640×360
 * reference fits, then the internal resolution widened/heightened (within
 * bounds) to fill the window at that scale — no blurry fractional scaling.
 * Shared by the game screen and the menus' backdrop.
 */
export function viewportFor(vw: number, vh: number): { w: number; h: number; scale: number } {
  const scale = Math.max(1, Math.floor(Math.min(vw / BASE_W, vh / BASE_H)));
  const w = Math.min(MAX_W, Math.max(BASE_W, Math.floor(vw / scale / 2) * 2));
  const h = Math.min(MAX_H, Math.max(BASE_H, Math.floor(vh / scale / 2) * 2));
  return { w, h, scale };
}

import { describe, expect, it } from 'vitest';
import { Raster, tinyText, tinyWidth } from './raster';

describe('tiny digits', () => {
  it('plots 3×5 digits one pixel apart', () => {
    const r = new Raster(16, 8);
    tinyText(r, '10', 1, 1, 0xffffffff);
    const on = (x: number, y: number) => r.px[y * 16 + x] !== 0;
    // "1": the stem's middle column, all five rows.
    for (let y = 1; y <= 5; y++) expect(on(2, y)).toBe(true);
    // "0": a ring 3 wide, hollow in the middle, starting 4 px to the right.
    expect(on(5, 1) && on(7, 1) && on(5, 3) && on(7, 3)).toBe(true);
    expect(on(6, 3)).toBe(false);
    expect(tinyWidth('10')).toBe(7);
  });
});

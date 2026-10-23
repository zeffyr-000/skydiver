import { describe, expect, it, vi } from 'vitest';
import { configForDifficulty } from './config';
import { createJump } from './physics';
import { SkyDiverRenderer } from './renderer';
import { BAKED_SPECS, type BakedName } from './baked-sprites';
import type { BakedAtlas } from './sprites';
import { Phase, type GameState } from './types';

const W = 192;
const H = 108;

/** Minimal stub of the 2D context — just the calls the renderer makes. */
function fakeCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

/** Baked-sheet stub: real specs, fake images. */
function stubBaked(): BakedAtlas {
  return Object.fromEntries(
    (Object.keys(BAKED_SPECS) as BakedName[]).map((name) => [
      name,
      { image: { name } as unknown as CanvasImageSource, ...BAKED_SPECS[name] },
    ]),
  ) as BakedAtlas;
}

function renderer(ctx = fakeCtx()): SkyDiverRenderer {
  const r = new SkyDiverRenderer(ctx, W, H);
  r.textureLevels = [
    [1, 128],
    [8, 128],
  ];
  return r;
}

const cfg = configForDifficulty('ace');

function stateFor(phase: Phase, altitude = 400): GameState {
  const s: GameState = { ...createJump(cfg, () => 0.5), phase, altitude };
  if (phase !== Phase.Plane) {
    s.freefallTime = 5;
  }
  if (phase === Phase.Deploying || phase === Phase.Canopy) {
    s.pullAltitude = altitude + 50;
    s.deployTimer = phase === Phase.Deploying ? cfg.deployDuration / 2 : 0;
    s.canopyTime = phase === Phase.Canopy ? 5 : 0;
  }
  if (phase === Phase.Landed || phase === Phase.Crashed) {
    s.altitude = 0;
    s.pullAltitude = phase === Phase.Landed ? 200 : null;
    s.outroTimer = cfg.outroDuration / 2;
  }
  return s;
}

/** The world ImageData handed to putImageData by the last draw. */
function worldPixels(ctx: CanvasRenderingContext2D): Uint32Array {
  const calls = (ctx.putImageData as ReturnType<typeof vi.fn>).mock.calls;
  const img = calls.at(-1)![0] as ImageData;
  return new Uint32Array(img.data.buffer);
}

const ALL = [
  Phase.Plane,
  Phase.Freefall,
  Phase.Deploying,
  Phase.Canopy,
  Phase.Landed,
  Phase.Crashed,
];

describe('SkyDiverRenderer', () => {
  it('paints every phase without sprites or fonts', () => {
    for (const phase of ALL) {
      const ctx = fakeCtx();
      const r = renderer(ctx);
      expect(() => r.draw(stateFor(phase), cfg)).not.toThrow();
      expect(ctx.putImageData).toHaveBeenCalled();
      expect(worldPixels(ctx).every((p) => p !== 0)).toBe(true); // every pixel painted
      expect(ctx.drawImage).not.toHaveBeenCalled(); // no sheets, no layers under jsdom
    }
  });

  it('draws sprites for every phase once the sheets are set', () => {
    for (const phase of ALL) {
      const ctx = fakeCtx();
      const r = renderer(ctx);
      r.baked = stubBaked();
      expect(() => r.draw(stateFor(phase), cfg)).not.toThrow();
      expect(ctx.drawImage).toHaveBeenCalled();
    }
  });

  it('keeps the diver aboard during the jump run and shows the plane', () => {
    const ctx = fakeCtx();
    const r = renderer(ctx);
    r.baked = stubBaked();
    r.draw(stateFor(Phase.Plane, cfg.exitAltitude), cfg);
    const images = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(images).toContain(r.baked!.plane.image);
    expect(images).not.toContain(r.baked!['diver-fall'].image);
  });

  it('flies the Jenny on empty once the jumper has let go of the wing', () => {
    const ctx = fakeCtx();
    const r = renderer(ctx);
    r.baked = stubBaked();
    r.draw({ ...stateFor(Phase.Freefall, cfg.exitAltitude - 5), freefallTime: 0.3 }, cfg);
    const images = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(images).toContain(r.baked!['plane-empty'].image);
    expect(images).not.toContain(r.baked!.plane.image);
  });

  it('flies the canopy sheet under canopy', () => {
    const ctx = fakeCtx();
    const r = renderer(ctx);
    r.baked = stubBaked();
    r.draw(stateFor(Phase.Canopy, 60), cfg);
    const images = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(images).toContain(r.baked!.canopy.image);
  });

  it('shows sky at the top of the frame near the ground, none looking down the column', () => {
    const low = fakeCtx();
    renderer(low).draw(stateFor(Phase.Canopy, 6), cfg);
    const high = fakeCtx();
    renderer(high).draw(stateFor(Phase.Freefall, 800), cfg);
    // Same top-left pixel: sky (dark dusk blue) vs hazed ground.
    expect(worldPixels(low)[0]).not.toBe(worldPixels(high)[0]);
  });

  it('animates the landing outro forward as the timer runs down', () => {
    const ctx = fakeCtx();
    const r = renderer(ctx);
    r.baked = stubBaked();
    const drawImage = ctx.drawImage as ReturnType<typeof vi.fn>;
    const landSheet = r.baked!['diver-land'].image;
    const frameX = (outroTimer: number): number => {
      drawImage.mockClear();
      r.draw({ ...stateFor(Phase.Landed), outroTimer }, cfg);
      return drawImage.mock.calls.find((c) => c[0] === landSheet)![1]; // source x
    };
    expect(frameX(cfg.outroDuration * 0.1)).toBeGreaterThan(frameX(cfg.outroDuration * 0.9));
  });

  it('is deterministic: the same state paints the same pixels', () => {
    const a = fakeCtx();
    const b = fakeCtx();
    renderer(a).draw(stateFor(Phase.Canopy, 30), cfg);
    renderer(b).draw(stateFor(Phase.Canopy, 30), cfg);
    expect(worldPixels(a)).toEqual(worldPixels(b));
  });

  it('skips a frame identical to the last one (paused, briefed, held scenes)', () => {
    const ctx = fakeCtx();
    const r = renderer(ctx);
    const put = ctx.putImageData as ReturnType<typeof vi.fn>;
    const s = stateFor(Phase.Canopy, 30);
    r.draw(s, cfg);
    const once = put.mock.calls.length;
    r.draw(s, cfg);
    expect(put.mock.calls.length).toBe(once);
    r.reducedMotion = true; // any input change repaints
    r.draw(s, cfg);
    expect(put.mock.calls.length).toBe(once * 2);
    r.draw({ ...s }, cfg);
    expect(put.mock.calls.length).toBe(once * 3);
  });
});

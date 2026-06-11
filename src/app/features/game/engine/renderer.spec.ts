import { describe, expect, it, vi } from 'vitest';
import { configForDifficulty } from './config';
import { createInitialState } from './physics';
import { SkyDiverRenderer } from './renderer';
import { SHEET_SPECS, type SheetName, type SpriteAtlas } from './sprites';
import { Phase, type GameState } from './types';

/** Minimal stub of the 2D context — just the calls the renderer makes. */
function fakeCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    imageSmoothingEnabled: true,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

/** Atlas stub: real specs, fake images (drawImage is mocked anyway). */
function stubAtlas(): SpriteAtlas {
  return Object.fromEntries(
    (Object.keys(SHEET_SPECS) as SheetName[]).map((name) => [
      name,
      { image: {} as CanvasImageSource, ...SHEET_SPECS[name] },
    ]),
  ) as SpriteAtlas;
}

const ALL_PHASES = [
  Phase.PlaneApproach,
  Phase.Freefall,
  Phase.Deploying,
  Phase.Canopy,
  Phase.Landed,
  Phase.Crashed,
];

describe('SkyDiverRenderer', () => {
  const cfg = configForDifficulty('ace');

  function stateFor(phase: Phase): GameState {
    const s: GameState = { ...createInitialState(cfg, () => 0.5), phase };
    if (phase === Phase.Deploying) {
      s.deployTimer = cfg.deployDuration / 2;
    }
    if (phase === Phase.Landed || phase === Phase.Crashed) {
      s.altitude = 0;
      s.outroTimer = cfg.outroDuration / 2;
    }
    return s;
  }

  it('paints every phase without an atlas (procedural fallback) without throwing', () => {
    for (const phase of ALL_PHASES) {
      const ctx = fakeCtx();
      const renderer = new SkyDiverRenderer(ctx, 320, 240);

      expect(() => renderer.draw(stateFor(phase), cfg)).not.toThrow();
      expect(ctx.fillRect).toHaveBeenCalled(); // background + terrain
      expect(ctx.stroke).toHaveBeenCalled(); // grid / rings
      expect(ctx.drawImage).not.toHaveBeenCalled(); // no atlas → no sprites
    }
  });

  it('draws sprites for every phase once the atlas is set', () => {
    for (const phase of ALL_PHASES) {
      const ctx = fakeCtx();
      const renderer = new SkyDiverRenderer(ctx, 320, 240);
      renderer.atlas = stubAtlas();

      expect(() => renderer.draw(stateFor(phase), cfg)).not.toThrow();
      // Terrain decorations always render through the atlas; phase sprites too.
      expect(ctx.drawImage).toHaveBeenCalled();
    }
  });

  it('animates the outro: the landed frame advances as the timer runs down', () => {
    const ctx = fakeCtx();
    const renderer = new SkyDiverRenderer(ctx, 320, 240);
    renderer.atlas = stubAtlas();
    const drawImage = ctx.drawImage as ReturnType<typeof vi.fn>;

    const early = stateFor(Phase.Landed);
    early.outroTimer = cfg.outroDuration * 0.9; // just touched down
    renderer.draw(early, cfg);
    const lastCallEarly = drawImage.mock.calls.at(-1)!;

    drawImage.mockClear();
    const late = stateFor(Phase.Landed);
    late.outroTimer = cfg.outroDuration * 0.1; // nearly done
    renderer.draw(late, cfg);
    const lastCallLate = drawImage.mock.calls.at(-1)!;

    // Frame index = source-x / frame-width: it must move forward over the outro.
    expect(lastCallLate[1]).toBeGreaterThan(lastCallEarly[1]);
  });

  it('shows the exit close-up, then keeps the diver a constant size for the fall', () => {
    const ctx = fakeCtx();
    const renderer = new SkyDiverRenderer(ctx, 320, 240);
    renderer.atlas = stubAtlas();
    const drawImage = ctx.drawImage as ReturnType<typeof vi.fn>;
    const diverImage = renderer.atlas['diver-freefall'].image;
    const widthAtAltitude = (altitude: number): number => {
      drawImage.mockClear();
      const s = stateFor(Phase.Freefall);
      s.altitude = altitude;
      renderer.draw(s, cfg);
      return drawImage.mock.calls.find((c) => c[0] === diverImage)![7]; // destination width
    };

    const atExit = widthAtAltitude(cfg.startAltitude);
    const midFall = widthAtAltitude(cfg.startAltitude * 0.5);
    const lowFall = widthAtAltitude(cfg.startAltitude * 0.1);

    expect(atExit).toBeGreaterThan(midFall); // close to the camera right after the jump
    expect(midFall).toBe(lowFall); // then the follow-camera never pulls away
  });

  it('keeps the diver hidden and shows the plane during the intro', () => {
    const ctx = fakeCtx();
    const renderer = new SkyDiverRenderer(ctx, 320, 240);
    renderer.atlas = stubAtlas();
    const drawImage = ctx.drawImage as ReturnType<typeof vi.fn>;

    renderer.draw(stateFor(Phase.PlaneApproach), cfg);
    const planeSheet = renderer.atlas.plane;
    const drewPlane = drawImage.mock.calls.some((c) => c[0] === planeSheet.image);
    const diverSheet = renderer.atlas['diver-freefall'];
    const drewDiver = drawImage.mock.calls.some((c) => c[0] === diverSheet.image);
    expect(drewPlane).toBe(true);
    expect(drewDiver).toBe(false);
  });
});

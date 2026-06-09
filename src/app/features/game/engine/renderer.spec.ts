import { describe, expect, it, vi } from 'vitest';
import { configForDifficulty } from './config';
import { createInitialState } from './physics';
import { SkyDiverRenderer } from './renderer';
import { Phase, type GameState } from './types';

/** Minimal stub of the 2D context — just the calls the renderer makes. */
function fakeCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('SkyDiverRenderer', () => {
  const cfg = configForDifficulty('ace');

  it('paints background, target and diver for every phase without throwing', () => {
    for (const phase of [Phase.Freefall, Phase.Canopy, Phase.Landed, Phase.Crashed]) {
      const ctx = fakeCtx();
      const renderer = new SkyDiverRenderer(ctx, 320, 240);
      const state: GameState = { ...createInitialState(cfg, () => 0.5), phase };

      expect(() => renderer.draw(state, cfg)).not.toThrow();
      expect(ctx.fillRect).toHaveBeenCalled(); // background wash
      expect(ctx.fill).toHaveBeenCalled(); // target / diver discs
      expect(ctx.stroke).toHaveBeenCalled(); // grid / rings / reticle
    }
  });
});

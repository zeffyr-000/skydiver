import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from './loop';

describe('GameLoop', () => {
  let now: number;
  let rafCallback: ((t: number) => void) | null;

  beforeEach(() => {
    now = 0;
    rafCallback = null;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Advance the clock and fire the pending rAF callback. */
  function frameTo(t: number): void {
    now = t;
    rafCallback?.(t);
  }

  it('runs one fixed step per 1/60s of elapsed time and renders once', () => {
    const step = vi.fn();
    const render = vi.fn();
    const loop = new GameLoop(step, render);

    loop.start(); // captures the first rAF callback at now=0
    frameTo(100); // 0.1s elapsed → 6 fixed steps of 1/60s

    expect(step).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('clamps a huge frame gap so it never floods with catch-up steps', () => {
    const step = vi.fn();
    const loop = new GameLoop(step, vi.fn());

    loop.start();
    frameTo(10_000); // 10s gap, clamped to maxFrame=0.25s → 15 steps

    expect(step).toHaveBeenCalledTimes(15);
  });

  it('start is idempotent and stop halts the loop', () => {
    const step = vi.fn();
    const loop = new GameLoop(step, vi.fn());

    loop.start();
    loop.start(); // guarded — does not reschedule
    loop.stop();
    frameTo(1000); // the captured callback must now no-op

    expect(step).not.toHaveBeenCalled();
  });
});

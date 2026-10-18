import { describe, expect, it } from 'vitest';
import { DEADZONE, readPad, readPads, shapeAxis, type PadSnapshot } from './gamepad';

function pad(axes: number[] = [0, 0], pressed: number[] = []): PadSnapshot {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
  };
}

describe('gamepad', () => {
  it('ignores stick drift inside the deadzone and rescales the rest', () => {
    expect(shapeAxis(DEADZONE * 0.9)).toBe(0);
    expect(shapeAxis(1)).toBe(1);
    expect(shapeAxis(-1)).toBe(-1);
    expect(shapeAxis((1 + DEADZONE) / 2)).toBeCloseTo(0.5);
    expect(shapeAxis(Number.NaN)).toBe(0);
  });

  it('turns with the stick (analog) and pushes up to track', () => {
    const p = readPad(pad([0.61, -1]));
    expect(p.turn).toBeCloseTo(0.5, 1);
    expect(p.drive).toBe(1);
    expect(p.active).toBe(true);
  });

  it('the d-pad is digital and wins over the stick', () => {
    const p = readPad(pad([-1, 0], [15, 13]));
    expect(p.turn).toBe(1);
    expect(p.drive).toBe(-1);
  });

  it('maps A to the action, B to back, Start to pause', () => {
    expect(readPad(pad([0, 0], [0]))).toMatchObject({ action: true, back: false, start: false });
    expect(readPad(pad([0, 0], [1])).back).toBe(true);
    expect(readPad(pad([0, 0], [9])).start).toBe(true);
  });

  it('an idle pad (or none) is inactive', () => {
    expect(readPad(pad([0.05, -0.1])).active).toBe(false);
    expect(readPad(null).active).toBe(false);
  });

  it('merges several pads: the strongest push wins', () => {
    const p = readPads([null, pad([0.5, 0]), pad([-1, 0], [0])]);
    expect(p.turn).toBe(-1);
    expect(p.action).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  actionFor,
  bindKey,
  DEFAULT_BINDINGS,
  isBindable,
  keyName,
  sanitizeBindings,
} from './bindings';

describe('key bindings', () => {
  it('defaults to arrows + the WASD cluster (by position) and Space / Enter', () => {
    expect(actionFor(DEFAULT_BINDINGS, 'ArrowLeft')).toBe('left');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyW')).toBe('up'); // Z on AZERTY: same key
    expect(actionFor(DEFAULT_BINDINGS, 'Enter')).toBe('action');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyQ')).toBeNull();
  });

  it('keeps Escape, Tab and OS keys out of reach', () => {
    expect(isBindable('Escape')).toBe(false);
    expect(isBindable('Tab')).toBe(false);
    expect(isBindable('MetaLeft')).toBe(false);
    expect(isBindable('')).toBe(false);
    expect(isBindable('KeyJ')).toBe(true);
    expect(isBindable('ShiftLeft')).toBe(true);
  });

  it('binds a fresh key into a slot', () => {
    const b = bindKey(DEFAULT_BINDINGS, 'action', 0, 'KeyJ');
    expect(b.action).toEqual(['KeyJ', 'Enter']);
    expect(DEFAULT_BINDINGS.action).toEqual(['Space', 'Enter']); // not mutated
  });

  it('swaps a key taken from another control, so no control goes keyless', () => {
    const b = bindKey(DEFAULT_BINDINGS, 'left', 1, 'KeyD');
    expect(b.left).toEqual(['ArrowLeft', 'KeyD']);
    expect(b.right).toEqual(['ArrowRight', 'KeyA']);
  });

  it('swaps the two slots of one control', () => {
    expect(bindKey(DEFAULT_BINDINGS, 'up', 0, 'KeyW').up).toEqual(['KeyW', 'ArrowUp']);
  });

  it('ignores unbindable keys and bad slots', () => {
    expect(bindKey(DEFAULT_BINDINGS, 'up', 0, 'Escape')).toBe(DEFAULT_BINDINGS);
    expect(bindKey(DEFAULT_BINDINGS, 'up', 2, 'KeyJ')).toBe(DEFAULT_BINDINGS);
  });

  it('sanitizes stored bindings: junk dropped, duplicates removed, empty controls restored', () => {
    expect(sanitizeBindings(null)).toEqual(DEFAULT_BINDINGS);
    const b = sanitizeBindings({
      left: ['KeyJ', 'KeyJ', 'Escape', 3],
      right: ['KeyJ'],
      up: 'nope',
      down: ['KeyK', 'KeyL', 'KeyM'],
      action: [],
    });
    expect(b.left).toEqual(['KeyJ']);
    expect(b.right).toEqual(DEFAULT_BINDINGS.right);
    expect(b.up).toEqual(DEFAULT_BINDINGS.up);
    expect(b.down).toEqual(['KeyK', 'KeyL']);
    expect(b.action).toEqual(DEFAULT_BINDINGS.action);
  });

  it('names keys: glyphs, words to translate, the typed character, else the code', () => {
    expect(keyName('ArrowUp')).toEqual({ text: '↑' });
    expect(keyName('Space')).toEqual({ named: 'Space' });
    expect(keyName('KeyW')).toEqual({ text: 'W' });
    expect(keyName('KeyW', { KeyW: 'z' })).toEqual({ text: 'Z' }); // AZERTY
    expect(keyName('Digit1')).toEqual({ text: '1' });
    expect(keyName('Numpad4')).toEqual({ text: 'Num 4' });
    expect(keyName('F3')).toEqual({ text: 'F3' });
  });
});

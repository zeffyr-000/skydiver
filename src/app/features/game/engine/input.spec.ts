import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindKey, DEFAULT_BINDINGS } from './bindings';
import type { PadSnapshot } from './gamepad';
import { InputController } from './input';

describe('InputController', () => {
  let target: HTMLElement;
  let input: InputController;
  let pads: (PadSnapshot | null)[];

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    pads = [];
    input = new InputController(target, DEFAULT_BINDINGS, () => pads);
  });

  afterEach(() => {
    input.dispose();
    target.remove();
  });

  const CODES: Record<string, string> = { ' ': 'Space', Enter: 'Enter', Escape: 'Escape' };

  /** Dispatch a key event on the target and return it (to inspect defaultPrevented). */
  function key(type: 'keydown' | 'keyup', k: string, code?: string): KeyboardEvent {
    const c = code ?? CODES[k] ?? (k.length === 1 ? `Key${k.toUpperCase()}` : k);
    const evt = new KeyboardEvent(type, { key: k, code: c, cancelable: true });
    target.dispatchEvent(evt);
    return evt;
  }

  function stick(x: number, y: number, pressed: number[] = []): void {
    pads = [
      {
        axes: [x, y],
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
      },
    ];
  }

  it('maps ←/→ to turning and cancels opposing directions', () => {
    key('keydown', 'ArrowRight');
    expect(input.read().turn).toBe(1);

    key('keydown', 'ArrowLeft'); // both held → cancel out
    expect(input.read().turn).toBe(0);

    key('keyup', 'ArrowRight');
    expect(input.read().turn).toBe(-1);
  });

  it('maps ↑ to drive and ↓ to brake, the WASD cluster identically', () => {
    key('keydown', 'w');
    expect(input.read().drive).toBe(1);
    key('keyup', 'w');
    key('keydown', 's');
    key('keydown', 'd');
    const state = input.read();
    expect(state.drive).toBe(-1);
    expect(state.turn).toBe(1);
  });

  it('edge-triggers the action exactly once per press, from Space or Enter', () => {
    key('keydown', ' ');
    expect(input.read().action).toBe(true);
    expect(input.read().action).toBe(false); // consumed

    key('keydown', ' '); // still held → no new edge
    expect(input.read().action).toBe(false);

    key('keyup', ' ');
    key('keydown', 'Enter');
    expect(input.read().action).toBe(true);
  });

  it('reset() drops a pending action', () => {
    key('keydown', ' ');
    input.reset();
    expect(input.read().action).toBe(false);
  });

  it('prevents default on owned keys but leaves Escape to the component', () => {
    expect(key('keydown', ' ').defaultPrevented).toBe(true);
    expect(key('keydown', 'ArrowUp').defaultPrevented).toBe(true);
    expect(key('keydown', 'Escape').defaultPrevented).toBe(false);
  });

  it('releases held keys when the window loses focus', () => {
    key('keydown', 'ArrowLeft');
    target.dispatchEvent(new Event('blur'));
    expect(input.read().turn).toBe(0);
  });

  it('stops responding once disposed', () => {
    input.dispose();
    key('keydown', 'ArrowRight');
    expect(input.read().turn).toBe(0);
  });

  it('ignores Space/Enter from focused interactive elements', () => {
    const btn = document.createElement('button');
    target.appendChild(btn);
    const evt = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true });
    btn.dispatchEvent(evt);
    expect(input.read().action).toBe(false);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('ignores game keys from an anchor element so links still work', () => {
    const a = document.createElement('a');
    target.appendChild(a);
    const evt = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    a.dispatchEvent(evt);
    expect(input.read().action).toBe(false);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('reads physical keys: the AZERTY Z (code KeyW) drives', () => {
    key('keydown', 'z', 'KeyW');
    expect(input.read().drive).toBe(1);
  });

  it('falls back on the key when an event carries no code', () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    expect(input.read().turn).toBe(-1);
  });

  it('follows rebinding, live', () => {
    input.setBindings(bindKey(DEFAULT_BINDINGS, 'action', 0, 'KeyJ'));
    key('keydown', 'j');
    expect(input.read().action).toBe(true);
    key('keydown', ' ');
    expect(input.read().action).toBe(false); // Space was replaced
    expect(key('keydown', 'q').defaultPrevented).toBe(false); // unbound keys pass through
  });

  it('turns proportionally with a stick and tracks when pushed up', () => {
    stick(0.61, -1);
    const s = input.read();
    expect(s.turn).toBeCloseTo(0.5, 1);
    expect(s.drive).toBe(1);
    expect(input.device).toBe('gamepad');
  });

  it('a held key wins over the stick, and switches the device back', () => {
    stick(1, 0);
    expect(input.read().turn).toBe(1);
    key('keydown', 'ArrowLeft');
    expect(input.read().turn).toBe(-1);
    expect(input.device).toBe('keyboard');
  });

  it('edge-triggers the A button once per press', () => {
    stick(0, 0, [0]);
    expect(input.read().action).toBe(true);
    expect(input.read().action).toBe(false); // still held
    stick(0, 0);
    input.read();
    stick(0, 0, [0]);
    expect(input.read().action).toBe(true);
  });

  it('reset() swallows an A press still held from a dialog', () => {
    stick(0, 0, [0]);
    input.reset();
    expect(input.read().action).toBe(false);
  });
});

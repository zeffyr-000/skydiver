import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputController } from './input';

describe('InputController', () => {
  let target: HTMLElement;
  let input: InputController;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    input = new InputController(target);
  });

  afterEach(() => {
    input.dispose();
    target.remove();
  });

  /** Dispatch a key event on the target and return it (to inspect defaultPrevented). */
  function key(type: 'keydown' | 'keyup', k: string): KeyboardEvent {
    const evt = new KeyboardEvent(type, { key: k, cancelable: true });
    target.dispatchEvent(evt);
    return evt;
  }

  it('maps arrow keys to steering and cancels opposing directions', () => {
    key('keydown', 'ArrowRight');
    expect(input.read().steerX).toBe(1);

    key('keydown', 'ArrowLeft'); // both held → cancel out
    expect(input.read().steerX).toBe(0);

    key('keyup', 'ArrowRight');
    expect(input.read().steerX).toBe(-1);
  });

  it('maps WASD identically to the arrows', () => {
    key('keydown', 'd');
    key('keydown', 'w');
    const state = input.read();
    expect(state.steerX).toBe(1);
    expect(state.steerY).toBe(-1); // up is negative
  });

  it('edge-triggers deploy exactly once per press', () => {
    key('keydown', ' ');
    expect(input.read().deployPressed).toBe(true);
    expect(input.read().deployPressed).toBe(false); // already consumed

    key('keydown', ' '); // key still held → no new edge
    expect(input.read().deployPressed).toBe(false);

    key('keyup', ' ');
    key('keydown', ' '); // fresh press
    expect(input.read().deployPressed).toBe(true);
  });

  it('reports flare only while shift is held', () => {
    expect(input.read().flare).toBe(0);
    key('keydown', 'shift');
    expect(input.read().flare).toBe(1);
    key('keyup', 'shift');
    expect(input.read().flare).toBe(0);
  });

  it('prevents default on owned keys but leaves Escape to the component', () => {
    expect(key('keydown', ' ').defaultPrevented).toBe(true);
    expect(key('keydown', 'ArrowUp').defaultPrevented).toBe(true);
    expect(key('keydown', 'Escape').defaultPrevented).toBe(false);
  });

  it('stops responding once disposed', () => {
    input.dispose();
    key('keydown', 'ArrowRight');
    expect(input.read().steerX).toBe(0);
  });
});

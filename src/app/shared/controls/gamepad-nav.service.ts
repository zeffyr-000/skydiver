import { inject, Injectable } from '@angular/core';
import { readPads } from '../../features/game/engine/gamepad';
import { browserPads, type PadSource } from '../../features/game/engine/input';
import { AudioService } from '../audio/audio.service';
import { ControlsService } from './controls.service';

type Direction = 'up' | 'down' | 'left' | 'right';

const ARROW: Record<Direction, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

/** Held direction: first repeat after this long, then every REPEAT_MS (like a key). */
const REPEAT_DELAY_MS = 380;
const REPEAT_MS = 130;
/** Stick push that counts as a menu direction. */
const NAV_THRESHOLD = 0.5;

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Drives the menus with a gamepad by doing what the keyboard would: the d-pad
 * or stick sends arrow keys to the focused element (the listbox, the initials
 * reel and the sliders handle them), and moves focus spatially when nothing
 * does; A presses (Enter / click), B backs out (Escape — and closes the open
 * dialog), Start selects, or pauses on the game screen.
 *
 * While a jump is being flown the pad belongs to the InputController, which
 * reads it directly: only Start (pause) is translated then.
 *
 * Polls on animation frames only while a pad is connected.
 */
@Injectable({ providedIn: 'root' })
export class GamepadNavService {
  private readonly controls = inject(ControlsService);
  private readonly audio = inject(AudioService);

  /** A jump is being flown: the pad is the game's (set by the Game screen). */
  flying = false;
  /** Start means pause (on the game screen) rather than select. */
  startPauses = false;
  /** Overridable for specs. */
  pads: PadSource = browserPads;

  private raf = 0;
  private prev = { dir: null as Direction | null, action: false, back: false, start: false };
  private nextRepeat = 0;

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('gamepadconnected', () => this.wake());
    this.wake();
  }

  /** Start polling (if any pad is there). */
  wake(): void {
    if (this.raf || typeof requestAnimationFrame !== 'function') {
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    if (!this.pads().some(Boolean)) {
      this.prev = { dir: null, action: false, back: false, start: false };
      return; // asleep until the next gamepadconnected
    }
    this.poll(now);
    this.raf = requestAnimationFrame(this.tick);
  };

  /** One poll: act on what changed since the last one. */
  poll(now: number): void {
    const p = readPads(this.pads());
    const dir = toDirection(p.turn, p.drive);
    const rose = (k: 'action' | 'back' | 'start') => p[k] && !this.prev[k];
    if (p.active) {
      this.controls.device.set('gamepad');
    }

    if (this.flying) {
      if (rose('start')) {
        this.back();
      }
    } else {
      if (dir && (dir !== this.prev.dir || now >= this.nextRepeat)) {
        this.nextRepeat = now + (dir !== this.prev.dir ? REPEAT_DELAY_MS : REPEAT_MS);
        this.navigate(dir);
      }
      if (rose('action')) {
        this.activate();
      }
      if (rose('back')) {
        this.back();
      }
      if (rose('start')) {
        if (this.startPauses) {
          this.back();
        } else {
          this.activate();
        }
      }
    }
    this.prev = { dir, action: p.action, back: p.back, start: p.start };
  }

  /** An arrow key for the focused element; if nobody takes it, move focus that way. */
  private navigate(dir: Direction): void {
    const el = focused();
    if (el instanceof HTMLInputElement && el.type === 'range') {
      if (dir === 'left' || dir === 'right') {
        if (dir === 'right') {
          el.stepUp();
        } else {
          el.stepDown();
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
    if (this.press(el ?? document.body, ARROW[dir])) {
      return;
    }
    if (moveFocus(dir, el)) {
      this.audio.move();
    }
  }

  /** A: Enter for whoever handles it (listbox, initials), else a click; focus something first. */
  private activate(): void {
    const el = focused();
    // Nothing to press yet (or just the app shell, focused after a navigation).
    if (!el || !el.matches(`${FOCUSABLE}, [role="option"]`)) {
      firstFocusable(scope())?.focus();
      return;
    }
    if (this.press(el, 'Enter')) {
      return;
    }
    if (el.matches('button, a[href], [role="button"], [role="option"], summary')) {
      el.click();
    }
  }

  /** B (and Start in a jump): Escape; a dialog nobody closed is closed like the native Esc. */
  private back(): void {
    if (this.press(focused() ?? document.body, 'Escape')) {
      return;
    }
    const dialog = topDialog();
    if (dialog?.open) {
      dialog.close();
    }
  }

  /** Dispatch keydown + keyup; true when a handler took it (preventDefault). */
  private press(target: Element, key: string): boolean {
    const init = { key, code: key, bubbles: true, cancelable: true };
    const down = new KeyboardEvent('keydown', init);
    target.dispatchEvent(down);
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    return down.defaultPrevented;
  }
}

function toDirection(x: number, y: number): Direction | null {
  if (Math.max(Math.abs(x), Math.abs(y)) < NAV_THRESHOLD) {
    return null;
  }
  if (Math.abs(x) > Math.abs(y)) {
    return x > 0 ? 'right' : 'left';
  }
  return y > 0 ? 'up' : 'down';
}

function focused(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

/** The open modal dialog (focus is trapped there), else the page. */
function topDialog(): HTMLDialogElement | null {
  const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return open.length ? open[open.length - 1] : null;
}

function scope(): ParentNode {
  return topDialog() ?? document;
}

function candidates(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[inert], [aria-hidden="true"]')) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function firstFocusable(root: ParentNode): HTMLElement | null {
  return candidates(root)[0] ?? null;
}

/**
 * Focus the nearest focusable in `dir` from `from` (the classic TV-remote
 * rule: distance along the direction, with sideways drift costing double).
 */
export function moveFocus(dir: Direction, from: HTMLElement | null): boolean {
  const all = candidates(scope());
  if (!from || !all.includes(from)) {
    all[0]?.focus();
    return !!all[0];
  }
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === from || from.contains(el) || el.contains(from)) {
      continue;
    }
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 1) {
      continue;
    }
    const score = along + 2 * side;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  best?.focus();
  return !!best;
}

import { actionFor, DEFAULT_BINDINGS, type KeyBindings } from './bindings';
import { NO_PAD, readPads, type PadIntent, type PadSnapshot } from './gamepad';
import type { InputState } from './types';

/** Which device the player last touched — the HUD shows that device's prompts. */
export type InputDevice = 'keyboard' | 'gamepad';

/** Where pads come from (the browser's Gamepad API; specs pass stubs). */
export type PadSource = () => readonly (PadSnapshot | null)[];

/** The browser's pads, or none (jsdom, old browsers, a blocking permissions policy). */
export const browserPads: PadSource = () => {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return [];
  }
  try {
    return navigator.getGamepads();
  } catch {
    return [];
  }
};

/** `code` is empty for some synthetic events and virtual keyboards: fall back on `key`. */
const CODE_FROM_KEY: Record<string, string> = {
  ' ': 'Space',
  Enter: 'Enter',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
};

export function codeOf(e: KeyboardEvent): string {
  if (e.code) {
    return e.code;
  }
  if (CODE_FROM_KEY[e.key]) {
    return CODE_FROM_KEY[e.key];
  }
  return /^[a-z]$/i.test(e.key) ? `Key${e.key.toUpperCase()}` : '';
}

/**
 * Keyboard + gamepads → InputState. Framework-agnostic: attaches
 * keydown/keyup to a target (default `window`), polls the pads on `read()`.
 *
 * Keys go through the player's bindings (physical `code`s): left/right turn,
 * up/down drive or brake, and the action key is the one context action (jump →
 * pull → flare, and skip the outro). A pad's stick turns proportionally. The
 * action is edge-triggered so a held key or button fires exactly once. Escape
 * is left alone so the Game component's pause binding keeps working.
 */
export class InputController {
  private readonly pressed = new Set<string>();
  private actionEdge = false;
  private padAction = false;
  private padActive = false;
  private bindings: KeyBindings;
  /** The device behind the latest input. */
  device: InputDevice = 'keyboard';

  constructor(
    private readonly target: Window | HTMLElement = window,
    bindings: KeyBindings = DEFAULT_BINDINGS,
    private readonly pads: PadSource = browserPads,
  ) {
    this.bindings = bindings;
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
    target.addEventListener('blur', this.onBlur);
  }

  /** Rebind live (the keys held right now are released). */
  setBindings(bindings: KeyBindings): void {
    this.bindings = bindings;
    this.pressed.clear();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      return; // pause is handled by the component
    }
    // Don't steal keys from focused UI controls (buttons in dialogs, inputs, etc.)
    // — would break their default activation and leave stale edges on the next jump.
    if (isInteractiveTarget(e.target)) {
      return;
    }
    const code = codeOf(e);
    const action = actionFor(this.bindings, code);
    if (!action) {
      return;
    }
    e.preventDefault();
    this.device = 'keyboard';
    if (action === 'action' && !this.pressed.has(code)) {
      this.actionEdge = true;
    }
    this.pressed.add(code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(codeOf(e));
  };

  /** Losing focus would strand held keys (their keyup never arrives). */
  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

  private held(action: 'left' | 'right' | 'up' | 'down'): number {
    return this.bindings[action].some((c) => this.pressed.has(c)) ? 1 : 0;
  }

  /** Snapshot intent for one frame; consumes the edge-triggered action. */
  read(): InputState {
    const pad = this.readPad();
    const keyTurn = this.held('right') - this.held('left');
    const keyDrive = this.held('up') - this.held('down');
    // A key held wins over the stick; otherwise the stick's analog value.
    const turn = keyTurn !== 0 ? keyTurn : pad.turn;
    const drive = keyDrive !== 0 ? keyDrive : pad.drive;
    const padEdge = pad.action && !this.padAction;
    this.padAction = pad.action;
    const action = this.actionEdge || padEdge;
    this.actionEdge = false;
    return { turn, drive, action };
  }

  private readPad(): PadIntent {
    const pad = readPads(this.pads());
    // The device that moved last — a stick left leaning doesn't outvote a key press.
    if ((pad.active && !this.padActive) || (pad.action && !this.padAction)) {
      this.device = 'gamepad';
    }
    this.padActive = pad.active;
    return pad.active ? pad : NO_PAD;
  }

  /** Drop any pending edge (e.g. a key pressed while a dialog was open). */
  reset(): void {
    this.actionEdge = false;
    // A button still held from the dialog must not fire on the next read.
    this.padAction = readPads(this.pads()).action;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.target.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
  }
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && INTERACTIVE_TAGS.has(target.tagName);
}

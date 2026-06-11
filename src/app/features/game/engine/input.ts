import type { InputState } from './types';

// Keys we own and want to stop from scrolling/activating the page.
const GAME_KEYS = new Set<string>([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'w',
  'a',
  's',
  'd',
  ' ',
  'enter',
  'shift',
]);

/**
 * Keyboard → InputState. Framework-agnostic: attaches keydown/keyup to a target
 * (default `window`) and exposes a pressed-keys snapshot via `read()`. Deploy
 * (Space) and skip (Space or Enter) are edge-triggered so a held key fires
 * exactly once. Escape is deliberately left alone so the Game component's pause
 * binding keeps working.
 */
export class InputController {
  private readonly pressed = new Set<string>();
  private deployEdge = false;
  private skipEdge = false;

  constructor(private readonly target: Window | HTMLElement = window) {
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      return; // pause is handled by the component
    }
    // Don't steal keys from focused UI controls (buttons in dialogs, inputs, etc.)
    // — would break their default activation and leave stale edges on the next jump.
    if (isInteractiveTarget(e.target)) {
      return;
    }
    if (GAME_KEYS.has(key)) {
      e.preventDefault();
    }
    if ((key === ' ' || key === 'enter') && !this.pressed.has(key)) {
      this.skipEdge = true;
      if (key === ' ') {
        this.deployEdge = true;
      }
    }
    this.pressed.add(key);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.key.toLowerCase());
  };

  /** Snapshot intent for one frame; consumes the edge-triggered deploy & skip. */
  read(): InputState {
    const down = (k: string): boolean => this.pressed.has(k);
    const steerX =
      (down('arrowright') || down('d') ? 1 : 0) - (down('arrowleft') || down('a') ? 1 : 0);
    const steerY =
      (down('arrowdown') || down('s') ? 1 : 0) - (down('arrowup') || down('w') ? 1 : 0);
    const deployPressed = this.deployEdge;
    this.deployEdge = false;
    const skipPressed = this.skipEdge;
    this.skipEdge = false;
    const flare = down('shift') ? 1 : 0;
    return { steerX, steerY, deployPressed, skipPressed, flare };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.pressed.clear();
  }
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && INTERACTIVE_TAGS.has(target.tagName);
}

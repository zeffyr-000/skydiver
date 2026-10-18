/**
 * Which keys drive which control — pure data, persisted by the settings.
 *
 * Keys are `KeyboardEvent.code` values: physical positions, not characters. So
 * the default W/A/S/D cluster sits under Z/Q/S/D on an AZERTY keyboard without
 * any per-layout table; only the *labels* shown to the player depend on the
 * layout (see `keyName`).
 */

/** The five things a key can do in a jump (Escape always pauses / backs out). */
export type ControlAction = 'left' | 'right' | 'up' | 'down' | 'action';

export const CONTROL_ACTIONS: readonly ControlAction[] = ['left', 'right', 'up', 'down', 'action'];

/** Up to two keys per control: a primary and an alternate. */
export const SLOTS_PER_ACTION = 2;

export type KeyBindings = Record<ControlAction, string[]>;

export const DEFAULT_BINDINGS: KeyBindings = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  action: ['Space', 'Enter'],
};

/** Keys that keep their job: Escape pauses / backs out, Tab moves focus, OS keys stay the OS's. */
const RESERVED = new Set([
  'Escape',
  'Tab',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
  'F5',
  'F11',
  'F12',
]);

/** Can `code` be bound to a control? */
export function isBindable(code: string): boolean {
  return /^[A-Z][A-Za-z0-9]+$/.test(code) && !RESERVED.has(code);
}

/**
 * Bind `code` to `action` in `slot`. A key does one thing only: if another
 * control (or the other slot) had it, the two swap — that control takes the
 * key this slot held, so nothing is left unflyable by accident. Returns new
 * bindings; unbindable codes leave them unchanged.
 */
export function bindKey(
  bindings: KeyBindings,
  action: ControlAction,
  slot: number,
  code: string,
): KeyBindings {
  if (!isBindable(code) || slot < 0 || slot >= SLOTS_PER_ACTION) {
    return bindings;
  }
  const next = {} as KeyBindings;
  for (const a of CONTROL_ACTIONS) {
    next[a] = [...bindings[a]];
  }
  const target = next[action];
  const old = target[slot] as string | undefined;
  for (const a of CONTROL_ACTIONS) {
    const j = next[a].indexOf(code);
    if (j < 0) {
      continue;
    }
    if (old === undefined) {
      next[a].splice(j, 1);
    } else {
      next[a][j] = old;
    }
  }
  if (slot < target.length) {
    target[slot] = code;
  } else {
    target.push(code);
  }
  return next;
}

/** The control a key drives, if any. */
export function actionFor(bindings: KeyBindings, code: string): ControlAction | null {
  for (const a of CONTROL_ACTIONS) {
    if (bindings[a].includes(code)) {
      return a;
    }
  }
  return null;
}

/**
 * Bindings read back from storage: anything malformed falls back to the
 * defaults for that control, duplicates are dropped, and a control left with
 * no key gets its defaults back (so a jump can always be flown).
 */
export function sanitizeBindings(raw: unknown): KeyBindings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const used = new Set<string>();
  const out = {} as KeyBindings;
  for (const a of CONTROL_ACTIONS) {
    const list: unknown[] = Array.isArray(src[a]) ? src[a] : [];
    out[a] = [];
    for (const c of list) {
      if (typeof c === 'string' && isBindable(c) && !used.has(c)) {
        if (out[a].length < SLOTS_PER_ACTION) {
          out[a].push(c);
          used.add(c);
        }
      }
    }
  }
  for (const a of CONTROL_ACTIONS) {
    if (out[a].length === 0) {
      out[a] = DEFAULT_BINDINGS[a].filter((c) => !used.has(c));
      out[a].forEach((c) => used.add(c));
    }
  }
  return out;
}

/** Glyph labels that read the same in every language. */
const SYMBOLS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

/** Keys whose name is a word (translated under `keys.*`). */
export const NAMED_KEYS = new Set([
  'Space',
  'Enter',
  'NumpadEnter',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'Backspace',
  'CapsLock',
  'Insert',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * How to show `code`: an arrow glyph, a named key (`{ named }` → translate
 * `keys.<named>`), or the character it types on this keyboard (`layout`, from
 * the Keyboard Map API or learned from key presses), else a best guess from
 * the code (`KeyQ` → `Q`, `Digit1` → `1`, `Numpad4` → `Num 4`).
 */
export function keyName(
  code: string,
  layout: Readonly<Record<string, string>> = {},
): { text: string } | { named: string } {
  const symbol = SYMBOLS[code];
  if (symbol) {
    return { text: symbol };
  }
  if (NAMED_KEYS.has(code)) {
    return { named: code };
  }
  const typed = layout[code];
  if (typed && typed.trim()) {
    return { text: typed.toUpperCase() };
  }
  let m = /^Key([A-Z])$/.exec(code);
  if (m) {
    return { text: m[1] };
  }
  m = /^Digit(\d)$/.exec(code);
  if (m) {
    return { text: m[1] };
  }
  m = /^Numpad(\d)$/.exec(code);
  if (m) {
    return { text: `Num ${m[1]}` };
  }
  return { text: code };
}

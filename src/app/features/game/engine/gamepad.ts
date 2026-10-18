/**
 * Gamepad → intent, for pads in the browser's "standard" layout (Xbox /
 * PlayStation / Switch Pro style). Pure: it reads a snapshot shaped like the
 * Gamepad API's, so specs (and e2e stubs) can hand it plain objects.
 *
 *   left stick / d-pad   turn (x) and track–dive / arch–brake (y, up = +1)
 *   A (bottom face)      the action: jump → pull → flare
 *   B (right face)       back
 *   Start / Menu         pause
 */

export interface PadSnapshot {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean }[];
}

/** One pad, read. */
export interface PadIntent {
  /** -1 .. 1, analog from the stick, ±1 from the d-pad. */
  turn: number;
  /** -1 .. 1, up is +1 (track / dive). */
  drive: number;
  action: boolean;
  back: boolean;
  start: boolean;
  /** Anything at all pushed or held (to tell which device the player is using). */
  active: boolean;
}

export const NO_PAD: PadIntent = {
  turn: 0,
  drive: 0,
  action: false,
  back: false,
  start: false,
  active: false,
};

/** Stick travel ignored around the centre (worn sticks drift). */
export const DEADZONE = 0.22;

const BTN_A = 0;
const BTN_B = 1;
const BTN_START = 9;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

/** Rescale a stick axis so the deadzone edge reads 0 and full travel reads ±1. */
export function shapeAxis(v: number | undefined, deadzone = DEADZONE): number {
  if (v === undefined || !Number.isFinite(v)) {
    return 0;
  }
  const a = Math.abs(v);
  if (a <= deadzone) {
    return 0;
  }
  return Math.sign(v) * Math.min(1, (a - deadzone) / (1 - deadzone));
}

export function readPad(pad: PadSnapshot | null | undefined): PadIntent {
  if (!pad) {
    return NO_PAD;
  }
  const btn = (i: number): boolean => !!pad.buttons[i]?.pressed;
  const dx = (btn(DPAD_RIGHT) ? 1 : 0) - (btn(DPAD_LEFT) ? 1 : 0);
  const dy = (btn(DPAD_UP) ? 1 : 0) - (btn(DPAD_DOWN) ? 1 : 0);
  const turn = dx !== 0 ? dx : shapeAxis(pad.axes[0]);
  // Screen-down is +y on the stick; pushing up tracks / dives.
  const drive = dy !== 0 ? dy : -shapeAxis(pad.axes[1]);
  const action = btn(BTN_A);
  const back = btn(BTN_B);
  const start = btn(BTN_START);
  const active =
    turn !== 0 || drive !== 0 || action || back || start || pad.buttons.some((b) => b?.pressed);
  return { turn, drive, action, back, start, active };
}

/** All connected pads merged: the strongest push wins each axis, any press counts. */
export function readPads(pads: readonly (PadSnapshot | null)[]): PadIntent {
  let out = NO_PAD;
  for (const snapshot of pads) {
    const p = readPad(snapshot);
    if (!p.active) {
      continue;
    }
    out = {
      turn: Math.abs(p.turn) > Math.abs(out.turn) ? p.turn : out.turn,
      drive: Math.abs(p.drive) > Math.abs(out.drive) ? p.drive : out.drive,
      action: out.action || p.action,
      back: out.back || p.back,
      start: out.start || p.start,
      active: true,
    };
  }
  return out;
}

import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { keyName, type ControlAction } from '../../features/game/engine/bindings';
import type { InputDevice } from '../../features/game/engine/input';
import { SettingsStore } from '../settings.store';

/** What a `[token]` in a translated string stands for. */
export type KeyToken = ControlAction | 'pause' | 'back';

export type KeyLabels = Record<KeyToken, string>;

/** The pad's prompts (standard layout): directions read the same on stick and d-pad. */
const PAD_LABELS: KeyLabels = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  action: 'A',
  pause: 'START',
  back: 'B',
};

/** Before the layout is known: the letters an AZERTY keyboard types (fr-FR / fr-BE). */
const AZERTY_GUESS: Record<string, string> = {
  KeyQ: 'a',
  KeyA: 'q',
  KeyW: 'z',
  KeyZ: 'w',
  KeyM: ',',
  Semicolon: 'm',
};

interface KeyboardMapApi {
  getLayoutMap?: () => Promise<Map<string, string>>;
}

/**
 * How the controls are *shown*: key names for the player's bindings on their
 * keyboard layout, or pad buttons when a gamepad was used last, substituted
 * into translated strings (`"[action]: JUMP"` → `"SPACE: JUMP"` / `"A: JUMP"`).
 *
 * Layout: the Keyboard Map API where it exists (Chromium), refined by every key
 * the player presses (the browser tells us which character a physical key
 * types), with an AZERTY first guess for French locales elsewhere.
 */
@Injectable({ providedIn: 'root' })
export class ControlsService {
  private readonly settings = inject(SettingsStore);
  private readonly transloco = inject(TranslocoService);

  /** The device behind the latest input. */
  readonly device = signal<InputDevice>('keyboard');
  /** `code` → the character that key types here. */
  private readonly layout = signal<Record<string, string>>({});
  /** Translated names of the worded keys (Space, Enter, Shift…), per language. */
  private readonly named = toSignal(this.transloco.selectTranslateObject('keys'), {
    initialValue: {} as Record<string, string>,
  });

  /** The label for each token, for the current device. */
  readonly labels = computed((): KeyLabels => {
    if (this.device() === 'gamepad') {
      return PAD_LABELS;
    }
    const keys = this.settings.keys();
    const first = (a: ControlAction) => (keys[a][0] ? this.label(keys[a][0]) : '—');
    const esc = this.named()?.['Escape'] || 'Esc';
    return {
      left: first('left'),
      right: first('right'),
      up: first('up'),
      down: first('down'),
      action: first('action'),
      pause: esc,
      back: esc,
    };
  });

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }
    const kb = (navigator as Navigator & { keyboard?: KeyboardMapApi }).keyboard;
    if (typeof kb?.getLayoutMap === 'function') {
      kb.getLayoutMap()
        .then((map) => this.layout.update((cur) => ({ ...Object.fromEntries(map), ...cur })))
        .catch(() => undefined);
    } else if (/^fr(-FR|-BE)?$/i.test(navigator.language ?? '')) {
      this.layout.set({ ...AZERTY_GUESS });
    }
    window.addEventListener('keydown', this.learn, { capture: true });
  }

  /** The name of a key (by code) as the player sees it on their keyboard. */
  label(code: string): string {
    const name = keyName(code, this.layout());
    if ('text' in name) {
      return name.text;
    }
    return this.named()?.[name.named] || name.named;
  }

  /** Replace `[left]`, `[action]`, `[pause]`… in `text` with the current labels. */
  fill(text: string, upper = false): string {
    if (!text.includes('[')) {
      return text;
    }
    const labels = this.labels();
    return text.replace(/\[(left|right|up|down|action|pause|back)\]/g, (_, t: KeyToken) =>
      upper ? labels[t].toUpperCase() : labels[t],
    );
  }

  /** A real key press: the keyboard is in use, and it tells us what that key types. */
  private readonly learn = (e: KeyboardEvent): void => {
    if (!e.isTrusted) {
      return;
    }
    this.device.set('keyboard');
    if (!e.code || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
      return;
    }
    if (this.layout()[e.code] !== e.key) {
      this.layout.update((cur) => ({ ...cur, [e.code]: e.key }));
    }
  };
}

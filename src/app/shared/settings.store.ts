import { effect, Injectable, signal } from '@angular/core';
import {
  DEFAULT_BINDINGS,
  sanitizeBindings,
  type KeyBindings,
} from '../features/game/engine/bindings';

export type Difficulty = 'rookie' | 'ace' | 'barnstormer';
export type Language = 'en' | 'fr';
/** `system` follows the OS "reduce motion" switch; the others override it. */
export type MotionPreference = 'system' | 'reduced' | 'full';

interface SettingsState {
  musicVolume: number;
  sfxVolume: number;
  language: Language;
  difficulty: Difficulty;
  motion: MotionPreference;
  keys: KeyBindings;
}

const STORAGE_KEY = 'skydiver.settings';

const DEFAULTS: SettingsState = {
  musicVolume: 60,
  sfxVolume: 80,
  language: 'en',
  difficulty: 'rookie',
  motion: 'system',
  keys: DEFAULT_BINDINGS,
};

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  /** Music and sound-effect levels, 0–100. */
  readonly musicVolume = signal(DEFAULTS.musicVolume);
  readonly sfxVolume = signal(DEFAULTS.sfxVolume);
  readonly language = signal<Language>(DEFAULTS.language);
  readonly difficulty = signal<Difficulty>(DEFAULTS.difficulty);
  readonly motion = signal<MotionPreference>(DEFAULTS.motion);
  /** Keyboard bindings for the jump controls (physical key codes). */
  readonly keys = signal<KeyBindings>(DEFAULTS.keys);

  constructor() {
    this.hydrate();
    // Persist any change back to localStorage.
    effect(() => {
      const state: SettingsState = {
        musicVolume: this.musicVolume(),
        sfxVolume: this.sfxVolume(),
        language: this.language(),
        difficulty: this.difficulty(),
        motion: this.motion(),
        keys: this.keys(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }

  private hydrate(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const state = JSON.parse(raw) as Partial<SettingsState> & { volume?: unknown };
      // v1 had a single (never-wired) `volume`: it seeds both levels.
      if (typeof state.volume === 'number') {
        this.musicVolume.set(clampVolume(state.volume));
        this.sfxVolume.set(clampVolume(state.volume));
      }
      if (typeof state.musicVolume === 'number') {
        this.musicVolume.set(clampVolume(state.musicVolume));
      }
      if (typeof state.sfxVolume === 'number') {
        this.sfxVolume.set(clampVolume(state.sfxVolume));
      }
      if (state.language === 'en' || state.language === 'fr') {
        this.language.set(state.language);
      }
      if (
        state.difficulty === 'rookie' ||
        state.difficulty === 'ace' ||
        state.difficulty === 'barnstormer'
      ) {
        this.difficulty.set(state.difficulty);
      }
      if (state.motion === 'system' || state.motion === 'reduced' || state.motion === 'full') {
        this.motion.set(state.motion);
      }
      if (state.keys !== undefined) {
        this.keys.set(sanitizeBindings(state.keys));
      }
    } catch {
      // Corrupt payload — fall back to defaults.
    }
  }
}

function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 80;
}

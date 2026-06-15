import { effect, Injectable, signal } from '@angular/core';

export type Difficulty = 'rookie' | 'ace' | 'barnstormer';
export type Language = 'en' | 'fr';

interface SettingsState {
  volume: number;
  language: Language;
  difficulty: Difficulty;
}

const STORAGE_KEY = 'skydiver.settings';

const DEFAULTS: SettingsState = {
  volume: 80,
  language: 'en',
  difficulty: 'rookie',
};

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  readonly volume = signal(DEFAULTS.volume);
  readonly language = signal<Language>(DEFAULTS.language);
  readonly difficulty = signal<Difficulty>(DEFAULTS.difficulty);

  constructor() {
    this.hydrate();
    // Persist any change back to localStorage.
    effect(() => {
      const state: SettingsState = {
        volume: this.volume(),
        language: this.language(),
        difficulty: this.difficulty(),
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
      const state = JSON.parse(raw) as Partial<SettingsState>;
      if (typeof state.volume === 'number') {
        this.volume.set(state.volume);
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
    } catch {
      // Corrupt payload — fall back to defaults.
    }
  }
}

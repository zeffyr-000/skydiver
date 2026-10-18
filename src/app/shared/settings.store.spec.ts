import { TestBed } from '@angular/core/testing';
import { DEFAULT_BINDINGS } from '../features/game/engine/bindings';
import { SettingsStore } from './settings.store';

const STORAGE_KEY = 'skydiver.settings';

describe('SettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeStore(): SettingsStore {
    return TestBed.inject(SettingsStore);
  }

  it('starts from the defaults when storage is empty', () => {
    const store = makeStore();
    expect(store.musicVolume()).toBe(60);
    expect(store.sfxVolume()).toBe(80);
    expect(store.language()).toBe('en');
    expect(store.difficulty()).toBe('rookie');
    expect(store.motion()).toBe('system');
    expect(store.keys()).toEqual(DEFAULT_BINDINGS);
  });

  it('hydrates from a previously persisted state', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ musicVolume: 30, sfxVolume: 55, language: 'fr', difficulty: 'barnstormer' }),
    );
    const store = makeStore();
    expect(store.musicVolume()).toBe(30);
    expect(store.sfxVolume()).toBe(55);
    expect(store.language()).toBe('fr');
    expect(store.difficulty()).toBe('barnstormer');
  });

  it('ignores an unsupported language and keeps the default', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: 'de' }));
    const store = makeStore();
    expect(store.language()).toBe('en');
  });

  it('ignores a corrupt payload and keeps the defaults', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const store = makeStore();
    expect(store.sfxVolume()).toBe(80);
    expect(store.difficulty()).toBe('rookie');
  });

  it('accepts a partial payload, filling the rest from defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ difficulty: 'ace' }));
    const store = makeStore();
    expect(store.difficulty()).toBe('ace');
    expect(store.sfxVolume()).toBe(80); // untouched → default
  });

  it('persists changes back to localStorage', () => {
    const store = makeStore();
    store.musicVolume.set(42);
    store.difficulty.set('ace');
    TestBed.tick(); // flush the persistence effect

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored).toMatchObject({ musicVolume: 42, difficulty: 'ace', language: 'en' });
  });

  it('seeds both levels from the single v1 volume, clamped', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: 130 }));
    const store = makeStore();
    expect(store.musicVolume()).toBe(100);
    expect(store.sfxVolume()).toBe(100);
  });

  it('hydrates the motion preference and sanitizes stored key bindings', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ motion: 'reduced', keys: { action: ['KeyJ', 'Escape'], left: 42 } }),
    );
    const store = makeStore();
    expect(store.motion()).toBe('reduced');
    expect(store.keys().action).toEqual(['KeyJ']);
    expect(store.keys().left).toEqual(DEFAULT_BINDINGS.left);
  });

  it('ignores an unknown motion preference', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ motion: 'wobbly' }));
    expect(makeStore().motion()).toBe('system');
  });
});

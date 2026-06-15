import { TestBed } from '@angular/core/testing';
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
    expect(store.volume()).toBe(80);
    expect(store.language()).toBe('en');
    expect(store.difficulty()).toBe('rookie');
  });

  it('hydrates from a previously persisted state', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ volume: 30, language: 'fr', difficulty: 'barnstormer' }),
    );
    const store = makeStore();
    expect(store.volume()).toBe(30);
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
    expect(store.volume()).toBe(80);
    expect(store.difficulty()).toBe('rookie');
  });

  it('accepts a partial payload, filling the rest from defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ difficulty: 'ace' }));
    const store = makeStore();
    expect(store.difficulty()).toBe('ace');
    expect(store.volume()).toBe(80); // untouched → default
  });

  it('persists changes back to localStorage', () => {
    const store = makeStore();
    store.volume.set(42);
    store.difficulty.set('ace');
    TestBed.tick(); // flush the persistence effect

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored).toMatchObject({ volume: 42, difficulty: 'ace', language: 'en' });
  });
});

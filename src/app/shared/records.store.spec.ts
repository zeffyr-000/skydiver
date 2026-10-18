import { TestBed } from '@angular/core/testing';
import { RecordsStore, type ScoreRecord } from './records.store';
import type { Difficulty } from './settings.store';

const STORAGE_KEY = 'skydiver.records.v2';

function rec(score: number, difficulty: Difficulty = 'ace', name = 'Ace'): ScoreRecord {
  return { name, score, date: '2026-01-01T00:00:00.000Z', difficulty };
}

describe('RecordsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeStore(): RecordsStore {
    return TestBed.inject(RecordsStore);
  }

  it('is empty by default', () => {
    expect(makeStore().board('ace')).toEqual([]);
  });

  it('keeps one board per difficulty, sorted highest first', () => {
    const store = makeStore();
    store.add(rec(100));
    store.add(rec(300));
    store.add(rec(200));
    store.add(rec(999, 'rookie'));
    expect(store.board('ace').map((r) => r.score)).toEqual([300, 200, 100]);
    expect(store.board('rookie').map((r) => r.score)).toEqual([999]);
    expect(store.board('barnstormer')).toEqual([]);
  });

  it('keeps only the top 10 of each board', () => {
    const store = makeStore();
    for (let i = 1; i <= 15; i++) {
      store.add(rec(i * 10));
    }
    const scores = store.board('ace').map((r) => r.score);
    expect(scores).toHaveLength(10);
    expect(scores[0]).toBe(150);
    expect(scores.at(-1)).toBe(60);
  });

  it('clears all boards', () => {
    const store = makeStore();
    store.add(rec(100));
    store.add(rec(100, 'rookie'));
    store.clear();
    expect(store.board('ace')).toEqual([]);
    expect(store.board('rookie')).toEqual([]);
  });

  it('hydrates from a persisted list, dropping malformed entries and v1 records', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([rec(500), rec(250), { name: 'Old', score: 9999, date: 'x' }]),
    );
    expect(
      makeStore()
        .board('ace')
        .map((r) => r.score),
    ).toEqual([500, 250]);
  });

  it('ignores a corrupt payload and starts empty', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(makeStore().board('ace')).toEqual([]);
  });

  it('exposes the best score per difficulty', () => {
    const store = makeStore();
    expect(store.best('ace')).toBe(0);
    store.add(rec(200));
    store.add(rec(500));
    store.add(rec(800, 'barnstormer'));
    expect(store.best('ace')).toBe(500);
    expect(store.best('barnstormer')).toBe(800);
  });

  it('qualifies any positive score while the board has free slots', () => {
    const store = makeStore();
    expect(store.qualifies(10, 'ace')).toBe(true);
    expect(store.qualifies(0, 'ace')).toBe(false);
  });

  it('once full, only qualifies a score that beats the lowest entry of that board', () => {
    const store = makeStore();
    for (let i = 1; i <= 10; i++) {
      store.add(rec(i * 100));
    }
    expect(store.qualifies(100, 'ace')).toBe(false); // ties don't bump
    expect(store.qualifies(101, 'ace')).toBe(true);
    expect(store.qualifies(50, 'rookie')).toBe(true); // another board
  });

  it('persists additions back to localStorage', () => {
    const store = makeStore();
    store.add(rec(420));
    TestBed.tick();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ScoreRecord[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ score: 420, difficulty: 'ace' });
  });
});

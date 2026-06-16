import { TestBed } from '@angular/core/testing';
import { RecordsStore, type ScoreRecord } from './records.store';

const STORAGE_KEY = 'skydiver.records';

function rec(score: number, name = 'Ace'): ScoreRecord {
  return { name, score, date: '2026-01-01T00:00:00.000Z' };
}

describe('RecordsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeStore(): RecordsStore {
    return TestBed.inject(RecordsStore);
  }

  it('is empty by default', () => {
    expect(makeStore().records()).toEqual([]);
  });

  it('sorts records by score, highest first', () => {
    const store = makeStore();
    store.add(rec(100));
    store.add(rec(300));
    store.add(rec(200));
    expect(store.records().map((r) => r.score)).toEqual([300, 200, 100]);
  });

  it('keeps only the top 10 records', () => {
    const store = makeStore();
    for (let i = 1; i <= 15; i++) {
      store.add(rec(i * 10));
    }
    const scores = store.records().map((r) => r.score);
    expect(scores).toHaveLength(10);
    expect(scores[0]).toBe(150); // highest
    expect(scores.at(-1)).toBe(60); // 10th highest
  });

  it('clears all records', () => {
    const store = makeStore();
    store.add(rec(100));
    store.clear();
    expect(store.records()).toEqual([]);
  });

  it('hydrates from a previously persisted list', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([rec(500), rec(250)]));
    expect(
      makeStore()
        .records()
        .map((r) => r.score),
    ).toEqual([500, 250]);
  });

  it('ignores a corrupt payload and starts empty', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(makeStore().records()).toEqual([]);
  });

  it('exposes the current best score', () => {
    const store = makeStore();
    expect(store.best()).toBe(0);
    store.add(rec(200));
    store.add(rec(500));
    expect(store.best()).toBe(500);
  });

  it('qualifies any positive score while the table has free slots', () => {
    const store = makeStore();
    expect(store.qualifies(10)).toBe(true);
    expect(store.qualifies(0)).toBe(false);
    expect(store.qualifies(-5)).toBe(false);
  });

  it('once full, only qualifies a score that beats the lowest entry', () => {
    const store = makeStore();
    for (let i = 1; i <= 10; i++) {
      store.add(rec(i * 100)); // lowest is 100
    }
    expect(store.qualifies(50)).toBe(false);
    expect(store.qualifies(100)).toBe(false); // ties don't bump
    expect(store.qualifies(101)).toBe(true);
  });

  it('persists additions back to localStorage', () => {
    const store = makeStore();
    store.add(rec(420));
    TestBed.tick(); // flush the persistence effect

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ScoreRecord[];
    expect(stored).toHaveLength(1);
    expect(stored[0].score).toBe(420);
  });
});

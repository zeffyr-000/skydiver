import { TestBed } from '@angular/core/testing';
import { EVENTS } from '../features/game/engine/events';
import { ProgressStore } from './progress.store';

const STORAGE_KEY = 'skydiver.progress';

describe('ProgressStore', () => {
  beforeEach(() => localStorage.clear());

  const makeStore = (): ProgressStore => TestBed.inject(ProgressStore);
  const [first, second, third] = EVENTS;

  it('opens only the first event at the start', () => {
    const store = makeStore();
    expect(store.isUnlocked(first.id)).toBe(true);
    expect(store.isUnlocked(second.id)).toBe(false);
    expect(store.isUnlocked('nope')).toBe(false);
  });

  it('banks a medal, which unlocks the next event', () => {
    const store = makeStore();
    const out = store.submitEvent(first.id, first.medals[1]);
    expect(out.medal).toBe('silver');
    expect(out.newBest).toBe(true);
    expect(out.medalUp).toBe(true);
    expect(out.unlockedNext).toBe(true);
    expect(store.isUnlocked(second.id)).toBe(true);
    expect(store.isUnlocked(third.id)).toBe(false);
    expect(store.medalCounts()).toEqual({ gold: 0, silver: 1, bronze: 0 });
  });

  it('keeps the best score and the best medal across attempts', () => {
    const store = makeStore();
    store.submitEvent(first.id, first.medals[2]);
    const worse = store.submitEvent(first.id, 10);
    expect(worse.medal).toBeNull();
    expect(worse.newBest).toBe(false);
    expect(worse.unlockedNext).toBe(false);
    expect(store.record(first.id)).toEqual({ best: first.medals[2], medal: 'gold' });
  });

  it('a score below bronze does not unlock anything', () => {
    const store = makeStore();
    const out = store.submitEvent(first.id, first.medals[0] - 1);
    expect(out.medal).toBeNull();
    expect(store.isUnlocked(second.id)).toBe(false);
  });

  it('tracks the best score per day, newest first', () => {
    const store = makeStore();
    expect(store.submitDaily('2026-10-18', 1200)).toEqual({ best: 1200, newBest: true });
    expect(store.submitDaily('2026-10-18', 900)).toEqual({ best: 1200, newBest: false });
    store.submitDaily('2026-10-19', 500);
    expect(store.dailyBest('2026-10-18')).toBe(1200);
    expect(store.daily().map((d) => d.day)).toEqual(['2026-10-19', '2026-10-18']);
  });

  it('persists and hydrates, dropping unknown events and corrupt entries', () => {
    const store = makeStore();
    store.submitEvent(first.id, first.medals[0]);
    store.submitDaily('2026-10-18', 700);
    TestBed.tick();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    saved.events.ghost = { best: 1, medal: 'gold' };
    saved.events[second.id] = { best: 'lots', medal: 'gold' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    TestBed.resetTestingModule();
    const again = makeStore();
    expect(again.record(first.id)?.medal).toBe('bronze');
    expect(again.record('ghost')).toBeNull();
    expect(again.record(second.id)).toBeNull();
    expect(again.dailyBest('2026-10-18')).toBe(700);
  });

  it('survives a corrupt payload', () => {
    localStorage.setItem(STORAGE_KEY, '{nope');
    expect(makeStore().medalCounts()).toEqual({ gold: 0, silver: 0, bronze: 0 });
  });
});

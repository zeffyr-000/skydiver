import { TestBed } from '@angular/core/testing';
import { GazetteStore } from './gazette.store';

describe('GazetteStore', () => {
  beforeEach(() => localStorage.clear());

  function saved() {
    return JSON.parse(localStorage.getItem('skydiver.gazette') ?? 'null');
  }

  it('remembers the last issue, the issues read and the best quiz scores', () => {
    const store = TestBed.inject(GazetteStore);
    store.open('trade');
    store.markRead('professors');
    store.markRead('professors');
    store.saveQuiz('professors', 2);
    store.saveQuiz('professors', 1);
    TestBed.tick();

    expect(saved()).toEqual({ last: 'trade', read: ['professors'], quiz: { professors: 2 } });
  });

  it('hydrates from storage and shrugs off junk', () => {
    localStorage.setItem(
      'skydiver.gazette',
      JSON.stringify({ last: 'meets', read: ['queens', 7], quiz: { queens: 3, meets: 'x' } }),
    );
    const store = TestBed.inject(GazetteStore);

    expect(store.last()).toBe('meets');
    expect(store.read()).toEqual(['queens']);
    expect(store.quiz()).toEqual({ queens: 3 });
  });

  it('starts fresh on corrupt storage', () => {
    localStorage.setItem('skydiver.gazette', '{oops');
    const store = TestBed.inject(GazetteStore);

    expect(store.last()).toBeNull();
    expect(store.read()).toEqual([]);
  });
});

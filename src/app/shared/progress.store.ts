import { computed, effect, Injectable, signal } from '@angular/core';
import { EVENTS, medalFor, medalRank, type Medal } from '../features/game/engine/events';

/** Best result on one circuit event. */
export interface EventRecord {
  best: number;
  medal: Medal | null;
}

/** Best score on one day's jump. */
export interface DailyRecord {
  day: string;
  best: number;
}

/** What changed when a circuit score was banked. */
export interface EventOutcome {
  /** Medal earned by this jump (not necessarily the best ever). */
  medal: Medal | null;
  /** Best score on the event after this jump. */
  best: number;
  newBest: boolean;
  /** This jump earned a better medal than the event had. */
  medalUp: boolean;
  /** It also opened the next event. */
  unlockedNext: boolean;
}

interface ProgressState {
  events: Record<string, EventRecord>;
  daily: DailyRecord[];
}

const STORAGE_KEY = 'skydiver.progress';
/** How many days of daily-jump bests are kept. */
const DAILY_HISTORY = 14;

/**
 * Circuit medals and daily-jump bests, persisted to localStorage. An event is
 * unlocked once the previous one has any medal (the first is always open).
 */
@Injectable({ providedIn: 'root' })
export class ProgressStore {
  private readonly _events = signal<Record<string, EventRecord>>({});
  private readonly _daily = signal<DailyRecord[]>([]);

  readonly events = this._events.asReadonly();
  readonly daily = this._daily.asReadonly();

  /** Medals won across the circuit. */
  readonly medalCounts = computed(() => {
    const counts = { gold: 0, silver: 0, bronze: 0 };
    for (const r of Object.values(this._events())) {
      if (r.medal) {
        counts[r.medal]++;
      }
    }
    return counts;
  });

  constructor() {
    this.hydrate();
    effect(() => {
      const state: ProgressState = { events: this._events(), daily: this._daily() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }

  record(id: string): EventRecord | null {
    return this._events()[id] ?? null;
  }

  isUnlocked(id: string): boolean {
    const i = EVENTS.findIndex((e) => e.id === id);
    if (i <= 0) {
      return i === 0;
    }
    return !!this._events()[EVENTS[i - 1].id]?.medal;
  }

  /** Bank a circuit jump score. */
  submitEvent(id: string, score: number): EventOutcome {
    const event = EVENTS.find((e) => e.id === id);
    const prev = this._events()[id] ?? null;
    const medal = event ? medalFor(score, event.medals) : null;
    const best = Math.max(prev?.best ?? 0, score);
    const bestMedal =
      medalRank(medal) > medalRank(prev?.medal ?? null) ? medal : (prev?.medal ?? null);
    const next = event ? EVENTS[EVENTS.indexOf(event) + 1] : undefined;
    const wasNextOpen = next ? this.isUnlocked(next.id) : true;
    this._events.update((all) => ({ ...all, [id]: { best, medal: bestMedal } }));
    return {
      medal,
      best,
      newBest: score > (prev?.best ?? 0),
      medalUp: medalRank(medal) > medalRank(prev?.medal ?? null),
      unlockedNext: !!next && !wasNextOpen && this.isUnlocked(next.id),
    };
  }

  dailyBest(day: string): number {
    return this._daily().find((d) => d.day === day)?.best ?? 0;
  }

  /** Bank a daily-jump score; returns whether it beat the day's best. */
  submitDaily(day: string, score: number): { best: number; newBest: boolean } {
    const prev = this.dailyBest(day);
    const best = Math.max(prev, score);
    this._daily.update((list) =>
      [{ day, best }, ...list.filter((d) => d.day !== day)]
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, DAILY_HISTORY),
    );
    return { best, newBest: score > prev };
  }

  clear(): void {
    this._events.set({});
    this._daily.set([]);
  }

  private hydrate(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const state = JSON.parse(raw) as Partial<ProgressState>;
      const events: Record<string, EventRecord> = {};
      for (const [id, r] of Object.entries(state.events ?? {})) {
        if (
          EVENTS.some((e) => e.id === id) &&
          typeof r?.best === 'number' &&
          Number.isFinite(r.best) &&
          (r.medal === null || r.medal === 'bronze' || r.medal === 'silver' || r.medal === 'gold')
        ) {
          events[id] = { best: r.best, medal: r.medal };
        }
      }
      this._events.set(events);
      if (Array.isArray(state.daily)) {
        this._daily.set(
          state.daily
            .filter(
              (d): d is DailyRecord =>
                typeof d?.day === 'string' &&
                typeof d?.best === 'number' &&
                Number.isFinite(d.best),
            )
            .slice(0, DAILY_HISTORY),
        );
      }
    } catch {
      // Corrupt payload — start fresh.
    }
  }
}

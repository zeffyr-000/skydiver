import { computed, effect, Injectable, signal } from '@angular/core';

export interface ScoreRecord {
  name: string;
  score: number;
  date: string; // ISO date
}

const STORAGE_KEY = 'skydiver.records';
const MAX_RECORDS = 10;

function isScoreRecord(value: unknown): value is ScoreRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['name'] === 'string' &&
    typeof record['score'] === 'number' &&
    Number.isFinite(record['score']) &&
    typeof record['date'] === 'string'
  );
}

@Injectable({ providedIn: 'root' })
export class RecordsStore {
  private readonly _records = signal<ScoreRecord[]>([]);

  /** High scores, sorted descending, capped to the top entries. */
  readonly records = computed(() =>
    [...this._records()].sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS),
  );

  constructor() {
    this.hydrate();
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this._records())));
  }

  add(record: ScoreRecord): void {
    this._records.update((list) =>
      [...list, record].sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS),
    );
  }

  clear(): void {
    this._records.set([]);
  }

  private hydrate(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Drop anything that doesn't match the shape — a tampered/corrupt entry
        // with a non-numeric score would otherwise yield NaN in the sort.
        this._records.set(parsed.filter(isScoreRecord));
      }
    } catch {
      // Corrupt payload — start empty.
    }
  }
}

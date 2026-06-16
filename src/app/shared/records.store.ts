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

  /** The current top score, or 0 when the table is empty. */
  readonly best = computed(() => this.records()[0]?.score ?? 0);

  constructor() {
    this.hydrate();
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this._records())));
  }

  /**
   * Whether `score` would earn a place in the table (so the player should be
   * prompted for a name). A positive score always qualifies while there's a
   * free slot; once the table is full it must beat the lowest entry.
   */
  qualifies(score: number): boolean {
    if (score <= 0) {
      return false;
    }
    const list = this.records();
    if (list.length < MAX_RECORDS) {
      return true;
    }
    return score > list[list.length - 1].score;
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
        // with a non-numeric score would otherwise yield NaN in the sort — then
        // clamp to the top entries so a bloated payload can't grow unbounded.
        const cleaned = parsed.filter(isScoreRecord).sort((a, b) => b.score - a.score);
        this._records.set(cleaned.slice(0, MAX_RECORDS));
      }
    } catch {
      // Corrupt payload — start empty.
    }
  }
}

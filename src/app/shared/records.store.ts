import { computed, effect, Injectable, signal } from '@angular/core';
import type { Difficulty } from './settings.store';

/** One arcade run on the board. */
export interface ScoreRecord {
  name: string;
  score: number;
  date: string; // ISO date
  difficulty: Difficulty;
}

/** v2: one board per difficulty (v1 boards mixed them and used the old scoring — dropped). */
const STORAGE_KEY = 'skydiver.records.v2';
const MAX_RECORDS = 10;
const DIFFICULTIES: readonly Difficulty[] = ['rookie', 'ace', 'barnstormer'];

function isScoreRecord(value: unknown): value is ScoreRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['name'] === 'string' &&
    typeof record['score'] === 'number' &&
    Number.isFinite(record['score']) &&
    typeof record['date'] === 'string' &&
    DIFFICULTIES.includes(record['difficulty'] as Difficulty)
  );
}

/** Top-10 arcade boards, one per difficulty, persisted to localStorage. */
@Injectable({ providedIn: 'root' })
export class RecordsStore {
  private readonly _records = signal<ScoreRecord[]>([]);

  /** Each difficulty's board, sorted by score (highest first), capped to the top entries. */
  readonly boards = computed(() => {
    const out = { rookie: [], ace: [], barnstormer: [] } as Record<Difficulty, ScoreRecord[]>;
    for (const d of DIFFICULTIES) {
      out[d] = this._records()
        .filter((r) => r.difficulty === d)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS);
    }
    return out;
  });

  constructor() {
    this.hydrate();
    effect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this._records())));
  }

  board(difficulty: Difficulty): ScoreRecord[] {
    return this.boards()[difficulty];
  }

  /** The top score at a difficulty, or 0 when its board is empty. */
  best(difficulty: Difficulty): number {
    return this.board(difficulty)[0]?.score ?? 0;
  }

  /**
   * Whether `score` earns a place on the board (so the player should be asked
   * for initials): any positive score while there's a free slot, otherwise it
   * must beat the lowest entry.
   */
  qualifies(score: number, difficulty: Difficulty): boolean {
    if (score <= 0) {
      return false;
    }
    const list = this.board(difficulty);
    return list.length < MAX_RECORDS || score > list[list.length - 1].score;
  }

  add(record: ScoreRecord): void {
    this._records.update((list) => trim([...list, record]));
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
        // Drop anything that doesn't match the shape (a NaN score would break
        // the sort), then cap each board so a bloated payload can't grow.
        this._records.set(trim(parsed.filter(isScoreRecord)));
      }
    } catch {
      // Corrupt payload — start empty.
    }
  }
}

/** Keep only each difficulty's top entries. */
function trim(list: ScoreRecord[]): ScoreRecord[] {
  return DIFFICULTIES.flatMap((d) =>
    list
      .filter((r) => r.difficulty === d)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS),
  );
}

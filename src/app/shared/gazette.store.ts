import { effect, Injectable, signal } from '@angular/core';

interface GazetteState {
  last: string | null;
  read: string[];
  quiz: Record<string, number>;
}

const STORAGE_KEY = 'skydiver.gazette';

/**
 * Where the reader is in the Sky Gazette: the issue last opened (reading
 * resumes there), the issues read to the end, and the best quiz score per
 * issue — persisted to localStorage. Ids are kept as given; the Gazette
 * ignores any it no longer publishes.
 */
@Injectable({ providedIn: 'root' })
export class GazetteStore {
  private readonly _last = signal<string | null>(null);
  private readonly _read = signal<readonly string[]>([]);
  private readonly _quiz = signal<Record<string, number>>({});

  readonly last = this._last.asReadonly();
  readonly read = this._read.asReadonly();
  readonly quiz = this._quiz.asReadonly();

  constructor() {
    this.hydrate();
    effect(() => {
      const state: GazetteState = {
        last: this._last(),
        read: [...this._read()],
        quiz: this._quiz(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }

  open(issue: string): void {
    this._last.set(issue);
  }

  markRead(issue: string): void {
    if (!this._read().includes(issue)) {
      this._read.update((read) => [...read, issue]);
    }
  }

  /** Keep the best score an issue's quiz has seen. */
  saveQuiz(issue: string, score: number): void {
    if (score > (this._quiz()[issue] ?? -1)) {
      this._quiz.update((quiz) => ({ ...quiz, [issue]: score }));
    }
  }

  private hydrate(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const state = JSON.parse(raw) as Partial<GazetteState>;
      if (typeof state.last === 'string') {
        this._last.set(state.last);
      }
      if (Array.isArray(state.read)) {
        this._read.set(state.read.filter((id): id is string => typeof id === 'string'));
      }
      const quiz: Record<string, number> = {};
      for (const [id, score] of Object.entries(state.quiz ?? {})) {
        if (typeof score === 'number' && Number.isFinite(score)) {
          quiz[id] = score;
        }
      }
      this._quiz.set(quiz);
    } catch {
      // Corrupt storage: start a fresh reader.
    }
  }
}

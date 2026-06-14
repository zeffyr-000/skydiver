import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
} from '@angular/router';

// Wipe geometry/timing shared with the ScreenWipe stylesheet: the CSS reads
// these via custom properties bound in the template, so service timeouts and
// cell animations can never drift apart.
export const WIPE_COLS = 16;
export const WIPE_ROWS = 9;
export const WIPE_CELL_MS = 240; // one cell grows 0 → 1 in 3 hard jumps (steps(3))
export const WIPE_STAGGER_MS = 12; // delay between successive diagonals
export const WIPE_TOTAL_MS = (WIPE_COLS - 1 + (WIPE_ROWS - 1)) * WIPE_STAGGER_MS + WIPE_CELL_MS;

export type WipePhase = 'idle' | 'covering' | 'revealing';

/**
 * SNES-style checkerboard transition between routes. `navigate()` covers the
 * screen with the wipe before routing; the reveal half always runs off router
 * events, so navigations that bypass the service (the game's quit button,
 * browser back/forward) still get a clean wipe-in.
 */
@Injectable({ providedIn: 'root' })
export class TransitionService {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly _phase = signal<WipePhase>('idle');
  readonly phase: Signal<WipePhase> = this._phase.asReadonly();

  private firstNavigationDone = false;
  private coverTimer: ReturnType<typeof setTimeout> | undefined;
  private revealTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.onNavigationEnd();
      } else if (
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        // Never strand the screen behind the cover.
        clearTimeout(this.coverTimer);
        this.coverTimer = undefined;
        clearTimeout(this.revealTimer);
        this.revealTimer = undefined;
        this._phase.set('idle');
      }
    });
  }

  /** Cover the screen with the wipe, then navigate; the reveal follows NavigationEnd. */
  navigate(url: string): void {
    if (this._phase() !== 'idle') return; // ignore double-clicks / ESC mashing mid-wipe
    clearTimeout(this.coverTimer);
    if (this.prefersReducedMotion()) {
      void this.router.navigateByUrl(url);
      return;
    }
    this._phase.set('covering');
    this.coverTimer = setTimeout(() => {
      this.coverTimer = undefined;
      void this.router.navigateByUrl(url);
    }, WIPE_TOTAL_MS);
  }

  private onNavigationEnd(): void {
    if (!this.firstNavigationDone) {
      // The initial load gets no wipe (nothing to transition from).
      this.firstNavigationDone = true;
      return;
    }
    clearTimeout(this.coverTimer);
    this.coverTimer = undefined;
    // Move focus to the shell so keyboard/screen-reader users land on the new view.
    this.document.getElementById('app-shell')?.focus({ preventScroll: true });
    if (this.prefersReducedMotion()) {
      this._phase.set('idle');
      return;
    }
    this._phase.set('revealing');
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => this._phase.set('idle'), WIPE_TOTAL_MS);
  }

  private prefersReducedMotion(): boolean {
    // matchMedia is absent in some test environments — treat that as "no preference".
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}

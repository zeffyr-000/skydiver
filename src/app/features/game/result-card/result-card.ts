import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CountUp, InitialsEntry, PixelButton } from '../../../ui';
import type { Medal, RunPlan } from '../engine/events';
import type { JumpResult } from '../engine/types';

/** A button on the result card; the parent decides which apply. */
export interface ResultAction {
  id: string;
  labelKey: string;
  primary?: boolean;
}

/** Delay between tally lines (ms) — the medal stamps down after the total. */
const ROW_MS = 260;

/**
 * Post-jump card: the jump's score tallied line by line (arcade-style count
 * up), then — depending on the mode — the medal stamp and thresholds
 * (circuit), the day's best (daily) or the run total and the initials board
 * (arcade). Purely presentational: the Game component owns the flow.
 */
@Component({
  selector: 'app-result-card',
  templateUrl: './result-card.html',
  styleUrl: './result-card.scss',
  imports: [TranslocoPipe, CountUp, PixelButton, InitialsEntry],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultCard {
  readonly plan = input.required<RunPlan>();
  readonly jumpIndex = input(0);
  readonly result = input.required<JumpResult>();
  /** Verdict heading (i18n key). */
  readonly heading = input('game.jumpComplete');

  // Circuit.
  readonly medal = input<Medal | null>(null);
  readonly newBest = input(false);
  readonly unlockedNext = input(false);
  readonly best = input(0);
  // Daily.
  readonly dailyBest = input(0);
  // Arcade.
  readonly runScore = input(0);
  readonly final = input(false);
  readonly needsInitials = input(false);
  readonly recordSaved = input(false);

  readonly actions = input<ResultAction[]>([]);
  readonly action = output<string>();
  readonly initials = output<string>();

  protected readonly rowMs = ROW_MS;
  private readonly actionsRef = viewChild<ElementRef<HTMLElement>>('actionsRow');

  constructor() {
    // Land keyboard focus on the primary action once the card is up.
    afterNextRender(() => {
      setTimeout(() => this.actionsRef()?.nativeElement.querySelector('button')?.focus(), 0);
    });
  }

  /** When the total row lands (ms), for the medal stamp to follow it. */
  protected totalDelay(): number {
    return ROW_MS * 6;
  }
}

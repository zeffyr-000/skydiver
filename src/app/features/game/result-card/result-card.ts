import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CountUp, InitialsEntry, PixelButton } from '../../../ui';
import type { Medal, RunPlan } from '../engine/events';
import type { JumpResult } from '../engine/types';
import { PHOTO_H, PHOTO_W } from './gazette-photo';

/** A button on the result card; the parent decides which apply. */
export interface ResultAction {
  id: string;
  labelKey: string;
  primary?: boolean;
}

/** What the front page leads with (`result.front.headline.<kind>`). */
export type Headline =
  | 'crashed'
  | 'water'
  | 'bullseye'
  | 'double'
  | 'missed'
  | 'great'
  | 'poor'
  | 'good';

/** The front page's headline for a jump: the most newsworthy thing about it. */
export function headlineFor(r: JumpResult, splashed: boolean): Headline {
  if (r.crashed) return 'crashed';
  if (splashed) return 'water';
  if (r.bullseye) return 'bullseye';
  const base = r.breakdown?.base ?? 0;
  if (r.refallTime !== null && base >= 1500) return 'double';
  if (r.breakdown?.accuracy === 0) return 'missed';
  if (base >= 2000) return 'great';
  return base < 1000 ? 'poor' : 'good';
}

/** Delay between tally lines (ms) — the medal stamps down after the total. */
const ROW_MS = 260;

/**
 * Post-jump front page of the Sky Gazette: masthead, a headline that judges
 * the jump, a dithered press photo of the touchdown and a short report, with
 * the figures tallied line by line (arcade-style count-up) in the side column
 * — then, depending on the mode, the medal stamp and thresholds (circuit), the
 * day's best (daily) or the run total and the initials board (arcade).
 * Purely presentational: the Game component owns the flow.
 */
@Component({
  selector: 'app-result-card',
  templateUrl: './result-card.html',
  styleUrl: './result-card.scss',
  imports: [TranslocoPipe, CountUp, PixelButton, InitialsEntry],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultCard {
  private readonly transloco = inject(TranslocoService);

  readonly plan = input.required<RunPlan>();
  readonly jumpIndex = input(0);
  readonly result = input.required<JumpResult>();
  /** The touchdown as a press photo (data URL), when the canvas could take one. */
  readonly photo = input<string | null>(null);
  /** The jump ended in the water. */
  readonly splashed = input(false);

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
  protected readonly photoW = PHOTO_W * 2;
  protected readonly photoH = PHOTO_H * 2;
  protected readonly headline = computed(() => headlineFor(this.result(), this.splashed()));
  protected readonly jump = computed(() => this.plan().jumps[this.jumpIndex()]?.config);
  /** The report's figures, rounded and in the reader's decimal style. */
  protected readonly figures = computed(() => {
    const r = this.result();
    const comma = this.transloco.getActiveLang() === 'fr';
    const fmt = (v: number) => (comma ? v.toFixed(1).replace('.', ',') : v.toFixed(1));
    return {
      alt: Math.round(r.exitAltitude),
      pull: Math.round(r.pullAltitude ?? 0),
      refall: fmt(r.refallTime ?? 0),
      dist: fmt(r.landedDistance),
    };
  });
  private readonly actionsRef = viewChild<ElementRef<HTMLElement>>('actionsRow');

  constructor() {
    // Land keyboard focus on the primary action once the card is up.
    afterNextRender(() => {
      setTimeout(() => this.actionsRef()?.nativeElement.querySelector('button')?.focus(), 0);
    });
  }

  /** When the total row lands (ms), for the medal stamp to follow it. */
  protected totalDelay(): number {
    return ROW_MS * 7;
  }
}

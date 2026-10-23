import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton } from '../../../ui';
import type { MythAnswer } from '../gazette.data';
import { ReadingBlock } from '../reading-block.directive';

/**
 * Legend or fact? A claim from the period; the reader guesses, then the card
 * tells — and hands focus to the verdict, since the choice buttons go away.
 */
@Component({
  selector: 'app-myth-card',
  templateUrl: './myth-card.html',
  styleUrl: './myth-card.scss',
  imports: [TranslocoPipe, PixelButton, ReadingBlock],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MythCard {
  private readonly injector = inject(Injector);

  /** i18n key of the myth (`…myths.<id>`), holding `claim` and `verdict`. */
  readonly base = input.required<string>();
  readonly answer = input.required<MythAnswer>();

  protected readonly guess = signal<MythAnswer | null>(null);
  private readonly verdict = viewChild<ElementRef<HTMLElement>>('verdict');

  protected choose(guess: MythAnswer): void {
    this.guess.set(guess);
    afterNextRender(() => this.verdict()?.nativeElement.focus(), { injector: this.injector });
  }
}

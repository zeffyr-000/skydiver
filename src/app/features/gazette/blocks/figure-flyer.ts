import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MotionService } from '../../../shared/motion.service';
import { PixelButton } from '../../../ui';
import { FIGURES } from '../gazette.data';

/**
 * Figures in flight: pick a figure and a little biplane flies it, side-on,
 * leaving its path behind it. Under reduced motion the path is drawn and the
 * plane waits at the start.
 */
@Component({
  selector: 'app-figure-flyer',
  templateUrl: './figure-flyer.html',
  styleUrl: './figure-flyer.scss',
  imports: [TranslocoPipe, PixelButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FigureFlyer {
  protected readonly reduced = inject(MotionService).reduced;
  protected readonly figures = FIGURES;
  protected readonly figure = signal(FIGURES[0]);
  /** Where the path starts (its leading "M x y"), for the plane at rest. */
  protected readonly start = computed(() => {
    const [, x, y] = /^M(\S+) (\S+)/.exec(this.figure().path) ?? ['', '0', '0'];
    return `translate(${x} ${y})`;
  });
}

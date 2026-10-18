import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { reducedMotion } from '../motion';

/**
 * A number that ticks up from 0 to `value` (arcade score tally), after
 * `delay` ms, over `duration` ms. Instant under reduced motion or
 * without requestAnimationFrame (tests).
 */
@Component({
  selector: 'app-count-up',
  template: '{{ shown() }}',
  host: { class: 'count-up' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountUp {
  readonly value = input.required<number>();
  readonly delay = input(0);
  readonly duration = input(600);

  protected readonly shown = signal(0);
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ready = false;

  constructor() {
    afterNextRender(() => {
      this.ready = true;
      this.run(this.value());
    });
    effect(() => {
      const target = this.value();
      if (this.ready) {
        this.run(target);
      }
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private run(target: number): void {
    this.stop();
    if (reducedMotion() || typeof requestAnimationFrame !== 'function' || this.duration() <= 0) {
      this.shown.set(target);
      return;
    }
    this.shown.set(0);
    this.timer = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / this.duration());
        this.shown.set(Math.round(target * (1 - (1 - t) * (1 - t))));
        if (t < 1) {
          this.raf = requestAnimationFrame(tick);
        }
      };
      this.raf = requestAnimationFrame(tick);
    }, this.delay());
  }

  private stop(): void {
    clearTimeout(this.timer);
    if (this.raf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.raf);
    }
    this.raf = 0;
  }
}

import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton } from '../../../ui';
import { KeysPipe } from '../../../shared/controls/keys.pipe';
import type { EventRecord } from '../../../shared/progress.store';
import type { RunPlan } from '../engine/events';
import { minimapWorld, paintMinimap } from '../engine/minimap';
import { Raster } from '../engine/raster';
import type { GameConfig, GameState } from '../engine/types';

const MAP_PX = 176;

/**
 * Pre-jump briefing: what the event asks, the conditions, and a map of the
 * drop zone with the plan (run line and green-light window, hoops, target,
 * wind) — the place to think before the light turns green.
 */
@Component({
  selector: 'app-briefing-card',
  templateUrl: './briefing-card.html',
  styleUrl: './briefing-card.scss',
  imports: [TranslocoPipe, PixelButton, KeysPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BriefingCard {
  readonly plan = input.required<RunPlan>();
  readonly jumpIndex = input(0);
  readonly state = input.required<GameState>();
  readonly config = input.required<GameConfig>();
  /** Best result so far on this circuit event. */
  readonly record = input<EventRecord | null>(null);
  /** Today's best (daily jump). */
  readonly dailyBest = input(0);

  readonly fly = output<void>();
  readonly back = output<void>();

  private readonly mapRef = viewChild<ElementRef<HTMLCanvasElement>>('map');
  private readonly startRef = viewChild(PixelButton, { read: ElementRef });

  protected readonly wind = computed(() =>
    Math.round(Math.hypot(this.state().windBaseX, this.state().windBaseY)),
  );
  protected readonly moving = computed(() => this.config().targetSpeed > 0);

  constructor() {
    afterNextRender(() => {
      this.startRef()?.nativeElement.querySelector('button')?.focus();
    });
    // Paint after render: the canvas exists and has its final size by then.
    afterRenderEffect(() => this.drawMap(this.state(), this.config()));
  }

  private drawMap(s: GameState, cfg: GameConfig): void {
    const canvas = this.mapRef()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }
    const r = new Raster(MAP_PX, MAP_PX);
    paintMinimap(r, s, cfg, minimapWorld(s, cfg));
    ctx.putImageData(r.image, 0, 0);
  }
}

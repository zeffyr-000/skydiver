import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MotionService } from '../../../shared/motion.service';
import { DemoFlight, type DemoMode } from '../engine/demo';
import { GameLoop } from '../engine/loop';
import { SkyDiverRenderer } from '../engine/renderer';
import { loadBaked } from '../engine/sprites';
import type { Venue } from '../engine/types';
import { viewportFor } from '../viewport';

/**
 * The living world behind the menus: the game's own Mode 7 renderer and
 * engine, flown by the autopilot — the title's attract-mode demo, or a calm
 * canopy circling a drop zone behind the other screens. Decorative
 * (`aria-hidden`); with reduced motion it holds a single still frame (and
 * follows the setting live).
 */
@Component({
  selector: 'app-world-backdrop',
  template: `
    <canvas
      #canvas
      class="backdrop__canvas"
      width="640"
      height="360"
      [style.width.px]="size().w"
      [style.height.px]="size().h"
    ></canvas>
    <div class="backdrop__fade" [class.backdrop__fade--on]="fading()"></div>
    <div class="backdrop__shade" [class.backdrop__shade--calm]="mode() === 'calm'"></div>
  `,
  styleUrl: './world-backdrop.scss',
  host: { 'aria-hidden': 'true', '(window:resize)': 'fit()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorldBackdrop {
  readonly mode = input<DemoMode>('attract');
  /** The venue on screen (changes with each attract jump). */
  readonly venue = output<Venue>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly motion = inject(MotionService);
  protected readonly size = signal({ w: 1280, h: 720 });
  protected readonly fading = signal(false);

  private demo?: DemoFlight;
  private renderer?: SkyDiverRenderer;
  private loop?: GameLoop;
  private seenJump = 0;
  /** Reduced motion: the demo was advanced to a settled moment to hold. */
  private settled = false;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => this.boot());
    inject(DestroyRef).onDestroy(() => {
      this.loop?.stop();
      clearTimeout(this.fadeTimer);
    });
  }

  private boot(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    this.demo = new DemoFlight(this.mode());
    this.seenJump = this.demo.jumpCount;
    this.venue.emit(this.demo.venue);
    const { w, h } = this.fit();
    const renderer = new SkyDiverRenderer(ctx, w, h);
    renderer.hud = false;
    this.renderer = renderer;

    void loadBaked()
      .then((baked) => (renderer.baked = baked))
      .catch(() => undefined);
    // Held frames cost nothing: the renderer skips redrawing an unchanged scene.
    this.loop = new GameLoop(
      (dt) => this.step(dt),
      () => this.demo && renderer.draw(this.demo.state, this.demo.cfg),
    );
    this.loop.start();
  }

  private step(dt: number): void {
    const demo = this.demo;
    if (!demo) {
      return;
    }
    if (this.motion.reduced()) {
      if (!this.settled) {
        // Hold a settled moment of the jump rather than the plane's first frame.
        this.settled = true;
        for (let i = 0; i < 60 * 12; i++) demo.step(1 / 60);
      }
      return;
    }
    demo.step(dt);
    if (demo.jumpCount !== this.seenJump) {
      // New drop zone: dip to black over the cut (and the texture rebuild).
      this.seenJump = demo.jumpCount;
      this.venue.emit(demo.venue);
      this.fading.set(true);
      clearTimeout(this.fadeTimer);
      this.fadeTimer = setTimeout(() => this.fading.set(false), 450);
    }
  }

  protected fit(): { w: number; h: number } {
    const { w, h, scale } = viewportFor(window.innerWidth, window.innerHeight);
    const canvas = this.canvasRef().nativeElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.renderer?.resize(w, h);
    }
    this.size.set({ w: w * scale, h: h * scale });
    return { w, h };
  }
}

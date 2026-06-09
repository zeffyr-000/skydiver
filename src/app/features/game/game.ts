import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PixelButton, PixelDialog, PixelPanel } from '../../ui';
import { RecordsStore } from '../../shared/records.store';
import { SettingsStore } from '../../shared/settings.store';
import { configForDifficulty } from './engine/config';
import { GameLoop } from './engine/loop';
import { InputController } from './engine/input';
import { createInitialState, integrate } from './engine/physics';
import { SkyDiverRenderer } from './engine/renderer';
import type { GameConfig, GameState, JumpResult } from './engine/types';
import { Phase } from './engine/types';

const STARTING_LIVES = 3;
const HUD_INTERVAL_MS = 100; // throttle HUD signal writes to ~10Hz (keeps CD off the hot loop)

// Eight-way arrow glyphs indexed by octant of atan2(dy, dx) with +y pointing down.
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

@Component({
  selector: 'app-game',
  templateUrl: './game.html',
  styleUrl: './game.scss',
  imports: [RouterLink, TranslocoPipe, PixelButton, PixelPanel, PixelDialog],
  host: { '(document:keydown.escape)': 'togglePause()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game {
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsStore);
  private readonly records = inject(RecordsStore);
  private readonly transloco = inject(TranslocoService);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  // --- HUD state surfaced to the template (throttled to ~10Hz from the loop) ---
  protected readonly score = signal(0);
  protected readonly lives = signal(STARTING_LIVES);
  protected readonly paused = signal(false);
  protected readonly altitude = signal(0);
  protected readonly windLabel = signal('');
  protected readonly distance = signal(0);
  protected readonly bearing = signal('·');
  protected readonly phaseKey = signal<string>(Phase.Freefall);

  // --- Per-jump / game-over flow ---
  protected readonly resultOpen = signal(false);
  protected readonly gameOver = signal(false);
  protected readonly lastResult = signal<JumpResult | null>(null);
  protected readonly resultHeading = computed(() =>
    this.lastResult()?.crashed ? 'game.crashed' : 'game.jumpComplete',
  );

  // --- Engine (plain fields; never read in the template, so no CD churn) ---
  private config: GameConfig = configForDifficulty('ace');
  private state: GameState = createInitialState(this.config);
  private input?: InputController;
  private renderer?: SkyDiverRenderer;
  private loop?: GameLoop;
  private runningScore = 0;
  private lastHudPush = 0;

  constructor() {
    afterNextRender(() => this.boot());
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  private boot(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    this.config = this.buildConfig();
    this.state = createInitialState(this.config);
    this.input = new InputController(window);
    this.renderer = new SkyDiverRenderer(ctx, canvas.width, canvas.height);
    this.loop = new GameLoop(
      (dt) => this.step(dt),
      () => this.render(),
    );
    this.loop.start();
  }

  private teardown(): void {
    this.loop?.stop();
    this.input?.dispose();
  }

  /** Difficulty drives the config; `?fast=1` shrinks a jump for e2e smoke tests. */
  private buildConfig(): GameConfig {
    const cfg = configForDifficulty(this.settings.difficulty());
    if (new URLSearchParams(window.location.search).has('fast')) {
      return {
        ...cfg,
        startAltitude: 60,
        canopyTerminal: 10,
        safeLandingSpeed: 30,
        startSpread: 30,
      };
    }
    return cfg;
  }

  private step(dt: number): void {
    if (this.paused()) {
      return;
    }

    // While a jump is resolved we freeze until the player continues. If the
    // dialog was dismissed (e.g. Escape), advance — but never past a game over.
    if (this.state.phase === Phase.Landed || this.state.phase === Phase.Crashed) {
      if (this.gameOver() || this.resultOpen()) {
        return;
      }
      if (this.lives() <= 0) {
        this.gameOver.set(true);
        return;
      }
      this.nextJump();
      return;
    }

    const input = this.input;
    if (!input) {
      return;
    }
    const prevPhase = this.state.phase;
    this.state = integrate(this.state, input.read(), dt, this.config);

    const resolved = this.state.phase === Phase.Landed || this.state.phase === Phase.Crashed;
    const result = this.state.result;
    if (resolved && this.state.phase !== prevPhase && result) {
      this.onJumpResolved(result);
    }
    this.pushHud();
  }

  private render(): void {
    this.renderer?.draw(this.state, this.config);
  }

  private pushHud(): void {
    const now = performance.now();
    if (now - this.lastHudPush < HUD_INTERVAL_MS) {
      return;
    }
    this.lastHudPush = now;
    const s = this.state;
    this.altitude.set(Math.round(s.altitude));
    this.distance.set(Math.round(Math.hypot(s.posX, s.posY)));
    this.bearing.set(arrowFor(-s.posX, -s.posY));
    this.windLabel.set(`${arrowFor(s.windX, s.windY)} ${Math.round(Math.hypot(s.windX, s.windY))}`);
    this.phaseKey.set(s.phase);
  }

  private onJumpResolved(result: JumpResult): void {
    this.lastResult.set(result);
    if (result.crashed) {
      this.lives.update((l) => Math.max(0, l - 1));
    } else {
      this.runningScore += result.score;
      this.score.set(this.runningScore);
    }
    if (this.lives() <= 0) {
      this.records.add({
        name: this.transloco.translate('records.defaultPilot'),
        score: this.runningScore,
        date: new Date().toISOString(),
      });
      this.gameOver.set(true);
    } else {
      this.resultOpen.set(true);
    }
  }

  private nextJump(): void {
    this.lastResult.set(null);
    this.state = createInitialState(this.config);
    this.phaseKey.set(this.state.phase);
  }

  /** Pause is suppressed while a result/game-over dialog is showing. */
  protected togglePause(): void {
    if (this.resultOpen() || this.gameOver()) {
      return;
    }
    this.paused.update((p) => !p);
  }

  /** Closing the result dialog lets the loop spawn the next jump. */
  protected continueJump(): void {
    this.resultOpen.set(false);
  }

  protected playAgain(): void {
    this.gameOver.set(false);
    this.resultOpen.set(false);
    this.lives.set(STARTING_LIVES);
    this.runningScore = 0;
    this.score.set(0);
    this.lastResult.set(null);
    this.config = this.buildConfig();
    this.state = createInitialState(this.config);
    this.phaseKey.set(this.state.phase);
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  quit(): void {
    this.router.navigateByUrl('/');
  }
}

function arrowFor(dx: number, dy: number): string {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return '·';
  }
  const octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return ARROWS[octant];
}

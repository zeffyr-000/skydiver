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
import { InitialsEntry, PixelButton, PixelDialog, PixelPanel } from '../../ui';
import { RecordsStore } from '../../shared/records.store';
import { SettingsStore } from '../../shared/settings.store';
import { configForDifficulty } from './engine/config';
import { GameLoop } from './engine/loop';
import { InputController } from './engine/input';
import { createCloudDive, createInitialState, integrate } from './engine/physics';
import { SkyDiverRenderer } from './engine/renderer';
import { loadAtlas } from './engine/sprites';
import type { CloudResult, GameConfig, GameState, JumpResult } from './engine/types';
import { Phase } from './engine/types';

/** A game is a fixed run: this many jumps, then one cloud bonus dive. */
const TOTAL_JUMPS = 3;
const HUD_INTERVAL_MS = 100; // throttle HUD signal writes to ~10Hz (keeps CD off the hot loop)

/** The segment of the run currently in play. */
type Segment = 'jump' | 'clouds';

// Eight-way arrow glyphs indexed by octant of atan2(dy, dx) with +y pointing down.
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

@Component({
  selector: 'app-game',
  templateUrl: './game.html',
  styleUrl: './game.scss',
  imports: [RouterLink, TranslocoPipe, PixelButton, PixelPanel, PixelDialog, InitialsEntry],
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
  /** Which segment is in play, and which jump (1..TOTAL_JUMPS) within the run. */
  protected readonly segment = signal<Segment>('jump');
  protected readonly jumpNumber = signal(1);
  protected readonly totalJumps = TOTAL_JUMPS;
  protected readonly paused = signal(false);
  protected readonly altitude = signal(0);
  protected readonly windLabel = signal('');
  protected readonly distance = signal(0);
  protected readonly bearing = signal('·');
  /** Cloud-dive HUD: "passed/total" hoops. */
  protected readonly ringsLabel = signal('0/0');
  protected readonly phaseKey = signal<string>(Phase.Freefall);

  // --- Per-segment / end-of-run flow ---
  protected readonly resultOpen = signal(false);
  protected readonly cloudResultOpen = signal(false);
  protected readonly gameOver = signal(false);
  protected readonly lastResult = signal<JumpResult | null>(null);
  protected readonly cloudResult = signal<CloudResult | null>(null);
  /** Game over qualified for the table → prompt the player for their initials. */
  protected readonly needsInitials = signal(false);
  /** Set once a qualifying run has been written to the records table. */
  protected readonly recordSaved = signal(false);
  /** Current high score, surfaced on the game-over scoreboard. */
  protected readonly bestScore = this.records.best;
  // Original-game flavour: the result card judges the jump, not just reports it.
  protected readonly resultHeading = computed(() => {
    const r = this.lastResult();
    if (!r) {
      return 'game.jumpComplete';
    }
    if (r.crashed) {
      return 'game.crashed';
    }
    if (r.score === 0) {
      return 'game.missed'; // landed safely but off the target
    }
    if (r.bullseye || r.score >= 1500) {
      return 'game.greatJump';
    }
    return r.score < 600 ? 'game.poorJump' : 'game.jumpComplete';
  });

  // --- Engine (plain fields; never read in the template, so no CD churn) ---
  private config: GameConfig = configForDifficulty('ace');
  private state: GameState = createInitialState(this.config);
  private input?: InputController;
  private renderer?: SkyDiverRenderer;
  private loop?: GameLoop;
  private runningScore = 0;
  private lastHudPush = 0;
  /** Set at touchdown; the result dialog waits for the outro to finish. */
  private resultPending = false;

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
    this.phaseKey.set(this.state.phase);
    this.input = new InputController(window);
    this.renderer = new SkyDiverRenderer(ctx, canvas.width, canvas.height);
    // Fire-and-forget: the renderer draws procedural fallbacks until the
    // sprite atlas arrives (and forever, should loading fail).
    // Capture a local reference so the promise doesn't retain the component
    // instance past navigation (the renderer itself is lightweight).
    const renderer = this.renderer;
    void loadAtlas()
      .then((atlas) => {
        renderer.atlas = atlas;
      })
      .catch(() => undefined);
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
        introDuration: 0, // no plane cinematic
        deployDuration: 0.3,
        outroDuration: 0.2,
        cloudStartAltitude: 80, // a brief cloud round, too
        cloudRingCount: 3,
      };
    }
    return cfg;
  }

  private step(dt: number): void {
    if (this.paused()) {
      return;
    }
    const input = this.input;
    if (!input) {
      return;
    }

    if (isResolved(this.state.phase)) {
      // The outro cinematic plays first (skippable — integrate consumes skip).
      if (this.state.outroTimer > 0) {
        this.state = integrate(this.state, input.read(), dt, this.config);
        this.pushHud();
        return;
      }
      // Outro done: surface this segment's result exactly once.
      if (this.resultPending) {
        this.resultPending = false;
        this.surfaceResult();
        return;
      }
      // Then freeze until the player continues. If the dialog was dismissed
      // (e.g. Escape), advance — but never past the end of the run.
      if (this.gameOver() || this.resultOpen() || this.cloudResultOpen()) {
        return;
      }
      this.advance();
      return;
    }

    const prevPhase = this.state.phase;
    this.state = integrate(this.state, input.read(), dt, this.config);

    if (isResolved(this.state.phase) && this.state.phase !== prevPhase) {
      this.onResolved();
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
    this.windLabel.set(`${arrowFor(s.windX, s.windY)} ${Math.round(Math.hypot(s.windX, s.windY))}`);
    this.phaseKey.set(s.phase);
    if (this.segment() === 'clouds') {
      this.ringsLabel.set(`${s.ringsPassed}/${s.rings.length}`);
    } else {
      this.distance.set(Math.round(Math.hypot(s.posX, s.posY)));
      this.bearing.set(arrowFor(-s.posX, -s.posY));
    }
  }

  /**
   * Segment resolved: tally its points into the running total (a crashed jump
   * just scores 0 — no more lives), then defer the dialog until the outro ends.
   */
  private onResolved(): void {
    if (this.segment() === 'clouds') {
      const cr = this.state.cloudResult;
      this.cloudResult.set(cr);
      if (cr) {
        this.runningScore += cr.score;
        this.score.set(this.runningScore);
      }
    } else {
      const r = this.state.result;
      this.lastResult.set(r);
      if (r && !r.crashed) {
        this.runningScore += r.score;
        this.score.set(this.runningScore);
      }
    }
    this.resultPending = true;
  }

  /** Show the segment's recap dialog (the run only ends after the cloud round). */
  private surfaceResult(): void {
    if (this.segment() === 'clouds') {
      this.cloudResultOpen.set(true);
    } else {
      this.resultOpen.set(true);
    }
  }

  /** Recap dialog closed: move to the next jump, the cloud round, or the finish. */
  private advance(): void {
    if (this.segment() === 'clouds') {
      this.finishGame();
    } else if (this.jumpNumber() < TOTAL_JUMPS) {
      this.jumpNumber.update((n) => n + 1);
      this.nextJump();
    } else {
      this.startCloudRound();
    }
  }

  /** After the three jumps: drop into the cloud bonus dive. */
  private startCloudRound(): void {
    this.segment.set('clouds');
    this.lastResult.set(null);
    this.resultPending = false;
    this.state = createCloudDive(this.config);
    this.phaseKey.set(this.state.phase);
    this.ringsLabel.set(`0/${this.state.rings.length}`);
  }

  /** End of the run: tally the final score and offer to sign the board. */
  private finishGame(): void {
    // Only a top-10 run gets to sign the board (arcade-style); everything else
    // just sees its final tally.
    this.needsInitials.set(this.records.qualifies(this.runningScore));
    this.recordSaved.set(false);
    this.gameOver.set(true);
  }

  /** Sign the high score: add the run to the records table under the initials. */
  protected submitInitials(initials: string): void {
    const name = initials.trim() || this.transloco.translate('records.defaultPilot');
    this.records.add({ name, score: this.runningScore, date: new Date().toISOString() });
    this.needsInitials.set(false);
    this.recordSaved.set(true);
  }

  private nextJump(): void {
    this.lastResult.set(null);
    this.resultPending = false;
    this.state = createInitialState(this.config);
    this.phaseKey.set(this.state.phase);
  }

  /** Pause is suppressed while any recap / end-of-run dialog is showing. */
  protected togglePause(): void {
    if (this.resultOpen() || this.cloudResultOpen() || this.gameOver()) {
      return;
    }
    this.paused.update((p) => !p);
  }

  /** Closing a recap dialog lets the loop advance to the next segment. */
  protected continueJump(): void {
    this.resultOpen.set(false);
  }

  protected continueClouds(): void {
    this.cloudResultOpen.set(false);
  }

  protected playAgain(): void {
    this.gameOver.set(false);
    this.resultOpen.set(false);
    this.cloudResultOpen.set(false);
    this.resultPending = false;
    this.needsInitials.set(false);
    this.recordSaved.set(false);
    this.segment.set('jump');
    this.jumpNumber.set(1);
    this.runningScore = 0;
    this.score.set(0);
    this.lastResult.set(null);
    this.cloudResult.set(null);
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

/** Terminal phases that freeze the sim and wait on a recap dialog. */
function isResolved(phase: Phase): boolean {
  return phase === Phase.Landed || phase === Phase.Crashed || phase === Phase.CloudDone;
}

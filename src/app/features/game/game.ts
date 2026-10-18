import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PixelButton, PixelDialog } from '../../ui';
import { AudioService, QUIET } from '../../shared/audio/audio.service';
import { ControlsService } from '../../shared/controls/controls.service';
import { GamepadNavService } from '../../shared/controls/gamepad-nav.service';
import { MotionService } from '../../shared/motion.service';
import { ProgressStore } from '../../shared/progress.store';
import { RecordsStore } from '../../shared/records.store';
import { SettingsStore } from '../../shared/settings.store';
import { TransitionService } from '../../shared/transition.service';
import { BriefingCard } from './briefing-card/briefing-card';
import {
  arcadeRun,
  circuitRun,
  dailyRun,
  nextEvent,
  type Medal,
  type RunPlan,
} from './engine/events';
import { loadHudFonts } from './engine/font';
import { mulberry32 } from './engine/ground';
import { GameLoop } from './engine/loop';
import { InputController } from './engine/input';
import { createJump, integrate } from './engine/physics';
import { ambienceFor, cuesBetween } from './engine/sound-cues';
import { HUD_KEYS, SkyDiverRenderer, type HudLabels } from './engine/renderer';
import { loadBaked } from './engine/sprites';
import type { GameConfig, GameState, JumpResult } from './engine/types';
import { Phase } from './engine/types';
import { ResultCard, type ResultAction } from './result-card/result-card';
import { BASE_H, BASE_W, viewportFor } from './viewport';

/** Throttle for the (DOM) phase announcement — the HUD itself is in the canvas. */
const HUD_INTERVAL_MS = 100;
/** Hit-stop: the sim freezes for a beat at touchdown so the impact lands (s). */
const HIT_STOP = 0.12;

/** Where a run stands: reading the briefing, flying, or looking at the result. */
type Stage = 'briefing' | 'playing' | 'result';

/** The run requested by the route: `?mode=circuit&event=…`, `?mode=daily`, else arcade. */
export function planFromQuery(
  params: URLSearchParams,
  difficulty: Parameters<typeof arcadeRun>[0],
  now = new Date(),
): RunPlan {
  const mode = params.get('mode');
  if (mode === 'circuit') {
    const run = circuitRun(params.get('event') ?? '');
    if (run) {
      return run;
    }
  }
  if (mode === 'daily') {
    return dailyRun(now);
  }
  return arcadeRun(difficulty);
}

@Component({
  selector: 'app-game',
  templateUrl: './game.html',
  styleUrl: './game.scss',
  imports: [TranslocoPipe, PixelButton, PixelDialog, BriefingCard, ResultCard],
  host: {
    '(document:keydown.escape)': 'togglePause()',
    '(window:resize)': 'fit()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Game {
  private readonly route = inject(ActivatedRoute);
  private readonly transition = inject(TransitionService);
  private readonly settings = inject(SettingsStore);
  private readonly records = inject(RecordsStore);
  private readonly progress = inject(ProgressStore);
  private readonly transloco = inject(TranslocoService);
  private readonly audio = inject(AudioService);
  private readonly controls = inject(ControlsService);
  private readonly gamepadNav = inject(GamepadNavService);
  private readonly motion = inject(MotionService);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  // --- Run flow (template-facing) ---
  protected readonly plan = signal<RunPlan>(arcadeRun('rookie'));
  protected readonly jumpIndex = signal(0);
  protected readonly stage = signal<Stage>('briefing');
  protected readonly paused = signal(false);
  /** The jump about to be flown (briefing map) — a snapshot, not the live state. */
  protected readonly briefState = signal<GameState | null>(null);
  protected readonly config = signal<GameConfig>(this.plan().jumps[0].config);
  /** Current phase, announced to assistive tech (the HUD is drawn in the canvas). */
  protected readonly phaseKey = signal<string>(Phase.Plane);
  /** CSS size of the canvas (whole-number scale of its internal resolution). */
  protected readonly canvasSize = signal({ w: BASE_W * 2, h: BASE_H * 2 });

  // --- Result ---
  protected readonly lastResult = signal<JumpResult | null>(null);
  protected readonly runScore = signal(0);
  protected readonly medal = signal<Medal | null>(null);
  protected readonly newBest = signal(false);
  protected readonly unlockedNext = signal(false);
  protected readonly needsInitials = signal(false);
  protected readonly recordSaved = signal(false);

  /** The pause card's key list: the player's keys, or the pad's buttons. */
  protected readonly pauseKeys = computed(() => {
    const k = this.controls.labels();
    return [
      { keys: `${k.left} ${k.right}`, labelKey: 'game.keys.turn' },
      { keys: `${k.up} ${k.down}`, labelKey: 'game.keys.drive' },
      { keys: k.action, labelKey: 'game.keys.action' },
      { keys: k.pause, labelKey: 'game.keys.pause' },
    ];
  });

  protected readonly isLastJump = computed(() => this.jumpIndex() >= this.plan().jumps.length - 1);
  protected readonly eventRecord = computed(() => {
    const e = this.plan().event;
    return e ? this.progress.record(e.id) : null;
  });
  protected readonly dailyBest = computed(() => {
    const day = this.plan().day;
    return day ? this.progress.dailyBest(day) : 0;
  });

  /** The result card judges the jump, not just reports it. */
  protected readonly resultHeading = computed(() => {
    const r = this.lastResult();
    if (!r) {
      return 'game.jumpComplete';
    }
    if (r.crashed) {
      return 'game.crashed';
    }
    const base = r.breakdown?.base ?? 0;
    if (r.breakdown && r.breakdown.accuracy === 0) {
      return 'game.missed';
    }
    if (r.bullseye || base >= 2000) {
      return 'game.greatJump';
    }
    return base < 1000 ? 'game.poorJump' : 'game.jumpComplete';
  });

  /** Buttons under the result, by mode. */
  protected readonly resultActions = computed((): ResultAction[] => {
    const plan = this.plan();
    if (plan.mode === 'circuit') {
      const next = plan.event ? nextEvent(plan.event.id) : null;
      const canNext = !!next && this.progress.isUnlocked(next.id);
      return [
        ...(canNext ? [{ id: 'nextEvent', labelKey: 'result.nextEvent', primary: true }] : []),
        { id: 'retry', labelKey: 'result.retry', primary: !canNext },
        { id: 'circuit', labelKey: 'result.toCircuit' },
      ];
    }
    if (plan.mode === 'daily') {
      return [
        { id: 'retry', labelKey: 'result.retry', primary: true },
        { id: 'menu', labelKey: 'result.menu' },
      ];
    }
    return this.isLastJump()
      ? [
          { id: 'playAgain', labelKey: 'game.playAgain', primary: true },
          { id: 'menu', labelKey: 'result.menu' },
        ]
      : [{ id: 'nextJump', labelKey: 'game.nextJump', primary: true }];
  });

  // --- Engine (plain fields; never read in the template, so no CD churn) ---
  private state!: GameState;
  private input?: InputController;
  private renderer?: SkyDiverRenderer;
  private loop?: GameLoop;
  private lastHudPush = 0;
  /** Set at touchdown; the result card waits for the outro to finish. */
  private resultPending = false;
  /** Seconds left of the touchdown freeze-frame. */
  private hitStop = 0;
  /** Translated HUD strings, pushed into the canvas renderer. */
  private hudLabels: HudLabels = {};
  private fast = false;

  constructor() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(this.route.snapshot?.queryParams ?? {})) {
      params.set(k, String(v));
    }
    this.fast = params.has('fast');
    this.plan.set(planFromQuery(params, this.settings.difficulty()));
    this.prepareJump(0);

    afterNextRender(() => this.boot());
    inject(DestroyRef).onDestroy(() => this.teardown());

    // While a jump is flown the gamepad is the game's; elsewhere it drives the cards.
    this.gamepadNav.startPauses = true;
    effect(() => {
      this.gamepadNav.flying = this.stage() === 'playing' && !this.paused();
    });
    // Prompts follow the keys (rebinding, keyboard ↔ pad) and the language.
    effect(() => {
      this.controls.labels();
      untracked(() => this.syncHud());
    });
    effect(() => {
      const reduced = this.motion.reduced();
      if (this.renderer) {
        this.renderer.reducedMotion = reduced;
      }
    });

    // HUD strings come from Transloco (re-pushed on language change).
    this.transloco
      .selectTranslateObject('game.hud')
      .pipe(takeUntilDestroyed())
      .subscribe((labels: Record<string, string>) => {
        const picked: HudLabels = {};
        for (const k of HUD_KEYS) {
          picked[k] = labels?.[k] ?? '';
        }
        this.hudLabels = picked;
        this.syncHud();
      });
  }

  private boot(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    this.input = new InputController(window, this.settings.keys());
    const { w, h } = this.fit();
    this.renderer = new SkyDiverRenderer(ctx, w, h);
    this.renderer.reducedMotion = this.motion.reduced();
    this.syncHud();
    // Fire-and-forget: the renderer draws stand-ins until the sprites and the
    // HUD fonts arrive (and forever, should loading fail). Local references
    // keep the promises from retaining the component after navigation.
    const renderer = this.renderer;
    void loadBaked()
      .then((baked) => (renderer.baked = baked))
      .catch(() => undefined);
    void loadHudFonts().then((fonts) => (renderer.fonts = fonts));
    this.loop = new GameLoop(
      (dt) => this.step(dt),
      () => this.render(),
    );
    this.loop.start();
  }

  private teardown(): void {
    this.loop?.stop();
    this.input?.dispose();
    this.audio.setAmbience(QUIET);
    this.gamepadNav.flying = false;
    this.gamepadNav.startPauses = false;
  }

  /** Size the canvas for the window (whole-number scaling); returns the internal size. */
  protected fit(): { w: number; h: number } {
    const { w, h, scale } = viewportFor(window.innerWidth, window.innerHeight);
    const canvas = this.canvasRef().nativeElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.renderer?.resize(w, h);
    }
    this.canvasSize.set({ w: w * scale, h: h * scale });
    return { w, h };
  }

  /** `?fast=1` shrinks a jump for the e2e smoke tests. */
  private tuned(cfg: GameConfig): GameConfig {
    if (!this.fast) {
      return cfg;
    }
    return {
      ...cfg,
      exitAltitude: 140,
      spotLeadTime: 0,
      spotOvertime: 0, // straight into free fall
      hardDeck: 40,
      pullCeiling: 120,
      ringCount: 0,
      deployDuration: 0.3,
      outroDuration: 0.2,
    };
  }

  /** Set up jump `i` of the plan and show its briefing. */
  private prepareJump(i: number): void {
    const jump = this.plan().jumps[i];
    const cfg = this.tuned(jump.config);
    this.jumpIndex.set(i);
    this.config.set(cfg);
    this.state = createJump(cfg, jump.seed === null ? Math.random : mulberry32(jump.seed));
    this.briefState.set(this.state);
    this.lastResult.set(null);
    this.resultPending = false;
    this.hitStop = 0;
    this.phaseKey.set(this.state.phase);
    this.stage.set('briefing');
    this.audio.setAmbience(QUIET);
    this.syncHud();
  }

  /** Briefing done: fly. */
  protected startJump(): void {
    this.input?.reset();
    this.stage.set('playing');
  }

  private step(dt: number): void {
    if (this.stage() !== 'playing' || this.paused() || !this.input) {
      return;
    }
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    const cfg = this.config();
    if (this.state.phase === Phase.Landed || this.state.phase === Phase.Crashed) {
      // The outro plays first (skippable — integrate consumes the action).
      if (this.state.outroTimer > 0) {
        this.state = integrate(this.state, this.input.read(), dt, cfg);
        this.pushHud();
      } else if (this.resultPending) {
        this.resultPending = false;
        this.stage.set('result');
        this.audio.setAmbience(QUIET);
        this.playResultJingle();
      }
      return;
    }

    const prev = this.state;
    this.state = integrate(this.state, this.input.read(), dt, cfg);
    for (const cue of cuesBetween(prev, this.state, cfg)) {
      this.audio.play(cue);
    }
    if (this.state.result && prev.phase !== this.state.phase) {
      if (this.renderer?.isWater(this.state.posX, this.state.posY)) {
        this.audio.play('splash');
      }
      this.onResolved(this.state.result);
    }
    this.pushHud();
  }

  /** The tally ticks under the count-up, then the verdict lands with the medal stamp. */
  private playResultJingle(): void {
    const r = this.lastResult();
    if (!r) {
      return;
    }
    if (r.crashed) {
      this.audio.play('fail', 0.2);
      return;
    }
    this.audio.play('tally');
    const medal = this.medal();
    const verdict =
      medal === 'gold'
        ? 'medalGold'
        : medal === 'silver'
          ? 'medalSilver'
          : medal === 'bronze'
            ? 'medalBronze'
            : this.newBest()
              ? 'newBest'
              : null;
    if (verdict) {
      this.audio.play(verdict, 1.56);
    }
  }

  private render(): void {
    this.renderer?.draw(this.state, this.config());
  }

  private pushHud(): void {
    const now = performance.now();
    if (now - this.lastHudPush < HUD_INTERVAL_MS) {
      return;
    }
    this.lastHudPush = now;
    this.phaseKey.set(this.state.phase);
    if (this.input) {
      this.controls.device.set(this.input.device);
    }
    this.audio.setAmbience(ambienceFor(this.state, this.config()));
  }

  /** Push run-level info (score, jump N/M), labels and coaching into the canvas HUD. */
  private syncHud(): void {
    if (!this.renderer) {
      return;
    }
    const plan = this.plan();
    const labels: HudLabels = {};
    for (const [k, v] of Object.entries(this.hudLabels)) {
      labels[k as keyof HudLabels] = this.controls.fill(v ?? '', true);
    }
    this.renderer.labels = labels;
    this.renderer.tutorial = plan.tutorial;
    const where =
      plan.mode === 'arcade'
        ? this.transloco.translate('game.jumpProgress', {
            current: this.jumpIndex() + 1,
            total: plan.jumps.length,
          })
        : plan.event
          ? this.transloco.translate(`events.${plan.event.id}.name`)
          : this.transloco.translate('brief.daily');
    this.renderer.run = { score: this.runScore(), jump: where.toUpperCase() };
  }

  /** Touchdown: bank the score (a crash scores 0) and record progress. */
  private onResolved(r: JumpResult): void {
    const plan = this.plan();
    this.lastResult.set(r);
    this.runScore.update((s) => (plan.mode === 'arcade' ? s : 0) + r.score);
    this.medal.set(null);
    this.newBest.set(false);
    this.unlockedNext.set(false);
    // Smoke tests (?fast=1) run the real flow but never write progress.
    if (plan.mode === 'circuit' && plan.event && !this.fast) {
      const out = this.progress.submitEvent(plan.event.id, r.score);
      this.medal.set(out.medal);
      this.newBest.set(out.newBest);
      this.unlockedNext.set(out.unlockedNext);
    } else if (plan.mode === 'daily' && plan.day && !this.fast) {
      this.newBest.set(this.progress.submitDaily(plan.day, r.score).newBest);
    } else if (plan.mode === 'arcade' && this.isLastJump()) {
      this.needsInitials.set(this.records.qualifies(this.runScore(), this.settings.difficulty()));
      this.recordSaved.set(false);
    }
    this.syncHud();
    this.resultPending = true;
    this.hitStop = HIT_STOP;
  }

  /** A result-card button. */
  protected onAction(id: string): void {
    const plan = this.plan();
    switch (id) {
      case 'nextJump':
        this.prepareJump(this.jumpIndex() + 1);
        return;
      case 'retry':
        this.prepareJump(this.jumpIndex());
        return;
      case 'playAgain':
        this.plan.set(arcadeRun(this.settings.difficulty()));
        this.runScore.set(0);
        this.needsInitials.set(false);
        this.recordSaved.set(false);
        this.prepareJump(0);
        return;
      case 'nextEvent': {
        const next = plan.event ? nextEvent(plan.event.id) : null;
        const run = next ? circuitRun(next.id) : null;
        if (run) {
          this.plan.set(run);
          this.runScore.set(0);
          this.prepareJump(0);
        }
        return;
      }
      case 'circuit':
        this.transition.navigate('/circuit');
        return;
      default:
        this.transition.navigate('/');
    }
  }

  /** Sign the arcade board with initials. */
  protected submitInitials(initials: string): void {
    const name = initials.trim() || this.transloco.translate('records.defaultPilot');
    this.records.add({
      name,
      score: this.runScore(),
      date: new Date().toISOString(),
      difficulty: this.settings.difficulty(),
    });
    this.needsInitials.set(false);
    this.recordSaved.set(true);
  }

  /** The result card was dismissed (Escape): take its primary action. */
  protected onResultClosed(): void {
    if (this.stage() !== 'result') {
      return;
    }
    const primary = this.resultActions().find((a) => a.primary);
    if (primary && !(this.needsInitials() && this.isLastJump())) {
      this.onAction(primary.id);
    }
  }

  /** The briefing closed: by Escape it means "back"; by starting the jump, nothing. */
  protected onBriefingClosed(): void {
    if (this.stage() === 'briefing') {
      this.leave();
    }
  }

  /** Back out of the briefing (Escape or the button). */
  protected leave(): void {
    this.transition.navigate(this.plan().mode === 'circuit' ? '/circuit' : '/');
  }

  /** Pause only while flying. */
  protected togglePause(): void {
    if (this.stage() !== 'playing') {
      return;
    }
    this.paused.update((p) => !p);
    this.input?.reset();
    // Paused: the air goes still and the music dips.
    this.audio.setAmbience(
      this.paused() ? { ...QUIET, music: 0.5 } : ambienceFor(this.state, this.config()),
    );
  }

  quit(): void {
    this.paused.set(false);
    this.leave();
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelDialog, PixelPanel, PixelSlider } from '../../ui';
import { AudioService } from '../../shared/audio/audio.service';
import { ControlsService } from '../../shared/controls/controls.service';
import { ProgressStore } from '../../shared/progress.store';
import { Difficulty, Language, MotionPreference, SettingsStore } from '../../shared/settings.store';
import { TransitionService } from '../../shared/transition.service';
import { WorldBackdrop } from '../game/backdrop/world-backdrop';
import {
  bindKey,
  CONTROL_ACTIONS,
  DEFAULT_BINDINGS,
  isBindable,
  SLOTS_PER_ACTION,
  type ControlAction,
} from '../game/engine/bindings';
import { codeOf } from '../game/engine/input';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  imports: [TranslocoPipe, PixelButton, PixelDialog, PixelPanel, PixelSlider, WorldBackdrop],
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly transition = inject(TransitionService);
  private readonly progress = inject(ProgressStore);
  private readonly audio = inject(AudioService);
  private lastPreview = 0;
  /** The key just bound: its keyup must not reach the page either. */
  private swallowKeyUp = '';
  protected readonly settings = inject(SettingsStore);
  protected readonly controls = inject(ControlsService);

  protected readonly difficulties: { value: Difficulty; labelKey: string }[] = [
    { value: 'rookie', labelKey: 'settings.difficultyRookie' },
    { value: 'ace', labelKey: 'settings.difficultyAce' },
    { value: 'barnstormer', labelKey: 'settings.difficultyBarnstormer' },
  ];

  // Labels are autonyms (each language in its own tongue), so they read the same
  // regardless of the active language and need no translation key.
  protected readonly languages: { value: Language; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' },
  ];

  protected readonly motions: { value: MotionPreference; labelKey: string }[] = [
    { value: 'system', labelKey: 'settings.motionOptions.system' },
    { value: 'reduced', labelKey: 'settings.motionOptions.reduced' },
    { value: 'full', labelKey: 'settings.motionOptions.full' },
  ];

  protected readonly controlActions = CONTROL_ACTIONS;
  protected readonly slots = Array.from({ length: SLOTS_PER_ACTION }, (_, i) => i);
  /** The key slot waiting for a key press, if any. */
  protected readonly capturing = signal<{ action: ControlAction; slot: number } | null>(null);

  /** Confirming a progress reset. */
  protected readonly confirmReset = signal(false);
  protected readonly resetDone = signal(false);

  constructor() {
    // Capture phase on window: a key being bound never reaches the page (nor
    // Escape the "back" binding below).
    const onKeyDown = (e: KeyboardEvent) => this.captureKey(e);
    const onKeyUp = (e: KeyboardEvent) => {
      if (this.swallowKeyUp && codeOf(e) === this.swallowKeyUp) {
        this.swallowKeyUp = '';
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    });
  }

  /** The key in a slot, as the player's keyboard names it. */
  keyLabel(action: ControlAction, slot: number): string {
    const code = this.settings.keys()[action][slot];
    return code ? this.controls.label(code) : '—';
  }

  isCapturing(action: ControlAction, slot: number): boolean {
    const c = this.capturing();
    return !!c && c.action === action && c.slot === slot;
  }

  /** Click a slot to rebind it; click it again to give up. */
  toggleCapture(action: ControlAction, slot: number): void {
    this.capturing.set(this.isCapturing(action, slot) ? null : { action, slot });
  }

  resetKeys(): void {
    this.capturing.set(null);
    this.settings.keys.set(DEFAULT_BINDINGS);
  }

  private captureKey(e: KeyboardEvent): void {
    const c = this.capturing();
    if (!c) {
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      // Escape gives up (and stays on the screen); Tab gives up and moves on.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      this.capturing.set(null);
      return;
    }
    if (!e.isTrusted) {
      return; // a gamepad's synthetic arrows navigate; they don't bind
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    const code = codeOf(e);
    if (e.repeat || !isBindable(code)) {
      return;
    }
    this.settings.keys.update((b) => bindKey(b, c.action, c.slot, code));
    this.capturing.set(null);
    this.swallowKeyUp = code;
    this.audio.select();
  }

  /** Effects level: apply it and play a sample (throttled while dragging). */
  setSfx(value: number): void {
    this.settings.sfxVolume.set(value);
    const now = performance.now();
    if (now - this.lastPreview > 150) {
      this.lastPreview = now;
      this.audio.play('ringPass');
    }
  }

  resetProgress(): void {
    this.progress.clear();
    this.confirmReset.set(false);
    this.resetDone.set(true);
  }

  /** Escape backs out — unless it is closing the confirmation dialog. */
  onEscape(): void {
    if (!this.confirmReset()) {
      this.goBack();
    }
  }

  goBack(): void {
    this.transition.navigate('/');
  }

  onBack(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.goBack();
  }
}

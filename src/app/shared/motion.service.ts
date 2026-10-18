import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { SettingsStore } from './settings.store';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether to calm the screen down: the player's Settings choice, or the OS
 * "reduce motion" switch when it's left on Auto. Published on
 * `<html data-motion="reduced|full">` so global CSS and the UI kit can follow
 * without depending on this service.
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly settings = inject(SettingsStore);
  private readonly system = signal(false);

  readonly reduced = computed(() => {
    const pref = this.settings.motion();
    return pref === 'reduced' || (pref === 'system' && this.system());
  });

  constructor() {
    if (typeof matchMedia === 'function') {
      const mq = matchMedia(QUERY);
      this.system.set(mq.matches);
      mq.addEventListener?.('change', (e) => this.system.set(e.matches));
    }
    effect(() => {
      document.documentElement.dataset['motion'] = this.reduced() ? 'reduced' : 'full';
    });
  }
}

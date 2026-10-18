import { InjectionToken } from '@angular/core';

/**
 * Feedback sounds for the kit's controls. The kit stays audio-agnostic: the
 * app provides an implementation (the AudioService) and components inject it
 * optionally — without a provider they are simply silent (e.g. in specs).
 */
export interface UiSounds {
  /** Focus moved to another option. */
  move(): void;
  /** Something was activated. */
  select(): void;
}

export const UI_SOUNDS = new InjectionToken<UiSounds>('UI_SOUNDS');

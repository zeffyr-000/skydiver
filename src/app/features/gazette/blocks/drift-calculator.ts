import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelSlider } from '../../../ui';

/** A 28-foot round canopy comes down at about this rate (order of magnitude). */
export const DESCENT_MS = 6;
const MAX_WIND_MS = 12;
const MAX_OPENING_M = 1200;
/** Drift at both maxima: the diagram's full width. */
const MAX_DRIFT_M = (MAX_WIND_MS * MAX_OPENING_M) / DESCENT_MS;

/** How far the wind carries a round canopy opened at `opening` metres. */
export function drift(windMs: number, openingM: number): { seconds: number; metres: number } {
  const seconds = openingM / DESCENT_MS;
  return { seconds: Math.round(seconds), metres: Math.round(windMs * seconds) };
}

/**
 * The jumper's slide rule: pick a wind and an opening height, read how far
 * upwind of the target to leave the aeroplane — the period rule of thumb
 * behind the game's green light.
 */
@Component({
  selector: 'app-drift-calculator',
  templateUrl: './drift-calculator.html',
  styleUrl: './drift-calculator.scss',
  imports: [TranslocoPipe, PixelSlider],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriftCalculator {
  protected readonly maxWind = MAX_WIND_MS;
  protected readonly maxOpening = MAX_OPENING_M;

  protected readonly wind = signal(5);
  protected readonly opening = signal(600);
  protected readonly result = computed(() => drift(this.wind(), this.opening()));
  /** The exit marker's distance from the target, as a share of the diagram. */
  protected readonly share = computed(() => this.result().metres / MAX_DRIFT_M);
  protected readonly verdict = computed(() => {
    const m = this.result().metres;
    return m < 200 ? 'calm' : m < 900 ? 'fair' : 'strong';
  });
}

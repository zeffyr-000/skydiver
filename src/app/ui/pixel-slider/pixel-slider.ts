import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'app-pixel-slider',
  templateUrl: './pixel-slider.html',
  styleUrl: './pixel-slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelSlider {
  /** Two-way bound current value. */
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly ariaLabel = input('');

  onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).valueAsNumber);
  }
}

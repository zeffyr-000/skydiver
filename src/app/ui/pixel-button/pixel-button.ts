import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { UI_SOUNDS } from '../ui-sounds';

export type PixelButtonVariant = 'default' | 'primary' | 'brass';

@Component({
  selector: 'app-pixel-button',
  host: { '[class.pixel-btn-host--block]': 'block()' },
  templateUrl: './pixel-button.html',
  styleUrl: './pixel-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelButton {
  readonly variant = input<PixelButtonVariant>('default');
  readonly disabled = input(false);
  readonly type = input<'button' | 'submit'>('button');
  /** Toggle semantics (aria-pressed) for buttons used as exclusive options. */
  readonly ariaPressed = input<boolean | null>(null);
  /** Full-width, left-aligned card button (lists of choices with details). */
  readonly block = input(false);
  /** Accessible name when the visible text isn't enough (e.g. a lone key cap). */
  readonly ariaLabel = input<string | null>(null);
  readonly pressed = output<void>();

  private readonly sounds = inject(UI_SOUNDS, { optional: true });

  onClick(): void {
    if (!this.disabled()) {
      this.sounds?.select();
      this.pressed.emit();
    }
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type PixelButtonVariant = 'default' | 'primary' | 'brass';

@Component({
  selector: 'app-pixel-button',
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
  readonly pressed = output<void>();

  onClick(): void {
    if (!this.disabled()) {
      this.pressed.emit();
    }
  }
}

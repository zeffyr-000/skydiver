import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-pixel-dialog',
  templateUrl: './pixel-dialog.html',
  styleUrl: './pixel-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelDialog {
  /** Two-way bound open state. */
  readonly open = model(false);
  readonly heading = input('');
  /** Roomier layout for content-rich cards (briefing, results). */
  readonly wide = input(false);
  /** Emitted whenever the dialog closes (ESC, backdrop, or programmatic). */
  readonly closed = output<void>();

  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialogRef()?.nativeElement;
      if (!el) {
        return;
      }
      if (this.open()) {
        if (!el.open) {
          // jsdom (unit tests) has no modal dialogs: fall back to the attribute.
          if (typeof el.showModal === 'function') {
            el.showModal();
          } else {
            el.setAttribute('open', '');
          }
        }
      } else if (el.open) {
        if (typeof el.close === 'function') {
          el.close();
        } else {
          el.removeAttribute('open');
        }
      }
    });
  }

  // Fired by the native dialog on ESC or close() — keep our state in sync.
  onClose(): void {
    this.open.set(false);
    this.closed.emit();
  }
}

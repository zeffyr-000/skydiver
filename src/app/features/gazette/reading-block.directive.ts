import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, inject } from '@angular/core';

/** One arrow press scrolls three lines of body text (22px type, 1.5 line height). */
const ARROW_STEP_PX = 99;
/** Air kept between a block's edge and the viewport's when bringing it into view. */
const MARGIN_PX = 32;

/**
 * A stretch of prose the reader can focus and read with the arrows (or a
 * gamepad, since GamepadNavService sends arrows to the focused element first).
 * Down scrolls the page until the block's end is in view; past that the key is
 * left alone, so focus moves on to the next block or control below — the page
 * reads top to bottom, one block at a time. Up does the same backwards.
 */
@Directive({
  selector: '[appReading]',
  host: { tabindex: '0', '(keydown)': 'onKey($event)', '(focus)': 'onFocus()' },
})
export class ReadingBlock {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  protected onKey(event: KeyboardEvent): void {
    if (event.target !== this.el.nativeElement) {
      return;
    }
    const root = this.scroller();
    const view = root.clientHeight;
    const rect = this.el.nativeElement.getBoundingClientRect();
    const step = event.key.startsWith('Page') ? Math.round(view * 0.85) : ARROW_STEP_PX;
    let delta = 0;
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      delta = Math.min(step, Math.max(0, rect.bottom - (view - MARGIN_PX)));
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      delta = -Math.min(step, Math.max(0, MARGIN_PX - rect.top));
    }
    if (!delta) {
      return; // this way, the block is read: let focus move on
    }
    root.scrollTop += delta;
    event.preventDefault();
  }

  /**
   * A block half out of view when focused is brought in from the side it was
   * entered: from above it starts at its top, from below it ends at its end.
   */
  protected onFocus(): void {
    const root = this.scroller();
    const view = root.clientHeight;
    const rect = this.el.nativeElement.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= view) {
      return;
    }
    if (rect.top > view / 2) {
      root.scrollTop += rect.top - MARGIN_PX;
    } else if (rect.bottom < view / 2) {
      root.scrollTop += rect.bottom - (view - MARGIN_PX);
    }
  }

  private scroller(): Element {
    return this.document.scrollingElement ?? this.document.documentElement;
  }
}

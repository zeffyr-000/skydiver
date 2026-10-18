import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Listbox, Option } from '@angular/aria/listbox';
import { UI_SOUNDS } from '../ui-sounds';

export interface PixelMenuItem {
  value: string;
  label: string;
}

@Component({
  selector: 'app-pixel-menu-list',
  templateUrl: './pixel-menu-list.html',
  styleUrl: './pixel-menu-list.scss',
  imports: [Listbox, Option],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelMenuList {
  readonly items = input.required<PixelMenuItem[]>();
  readonly ariaLabel = input('');
  /** Plays a staggered entrance when the menu first renders (title screen). */
  readonly animateIn = input(false);
  /** Emits the value of the activated item (Enter / Space / click). */
  readonly activate = output<string>();
  /** Put keyboard focus on the first item once it shows (so Enter works at once). */
  readonly autofocus = input(false);

  // Bound to the listbox; reset after each activation so it behaves momentarily.
  protected readonly selected = signal<string[]>([]);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sounds = inject(UI_SOUNDS, { optional: true });
  private focusDone = false;
  private lastFocused: Element | null = null;

  constructor() {
    afterRenderEffect(() => {
      if (!this.autofocus() || this.focusDone || this.items().length === 0) {
        return;
      }
      this.focusDone = true;
      // Wait out the staggered entrance: hidden items can't take focus. A busy
      // main thread can run the entrance late, so retry until the option takes
      // it — unless the player has meanwhile put focus somewhere else.
      const tryFocus = (attempt: number) => {
        const option = this.host.nativeElement.querySelector<HTMLElement>('[role="option"]');
        if (!option || !this.focusIsFree()) {
          return;
        }
        option.focus();
        if (document.activeElement !== option && attempt < 20) {
          setTimeout(() => tryFocus(attempt + 1), 150);
        }
      };
      setTimeout(() => tryFocus(0), this.animateIn() ? 1300 : 0);
    });
  }

  /** Nothing the player chose holds focus (the page, or the app shell after a navigation). */
  private focusIsFree(): boolean {
    const active = document.activeElement;
    return (
      !active ||
      active === document.body ||
      active.id === 'app-shell' ||
      this.host.nativeElement.contains(active)
    );
  }

  /** A blip as the cursor moves between items (not on the first focus). */
  onFocusIn(event: FocusEvent): void {
    const target = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    if (target && this.lastFocused && target !== this.lastFocused) {
      this.sounds?.move();
    }
    this.lastFocused = target ?? this.lastFocused;
  }

  onSelect(values: string[]): void {
    const value = values.at(-1);
    if (value) {
      this.sounds?.select();
      this.activate.emit(value);
      this.selected.set([]);
    }
  }
}

import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { Listbox, Option } from '@angular/aria/listbox';

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
  /** Emits the value of the activated item (Enter / Space / click). */
  readonly activate = output<string>();

  // Bound to the listbox; reset after each activation so it behaves momentarily.
  protected readonly selected = signal<string[]>([]);

  onSelect(values: string[]): void {
    const value = values.at(-1);
    if (value) {
      this.activate.emit(value);
      this.selected.set([]);
    }
  }
}

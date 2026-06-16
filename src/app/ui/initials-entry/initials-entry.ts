import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { PixelButton } from '../pixel-button/pixel-button';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LENGTH = 3;

/**
 * Arcade-cabinet initials entry: three letter cells the player cycles A–Z.
 * Drive it from the keyboard (←/→ move, ↑/↓ change the letter, a–z type,
 * Enter confirms) or by clicking the on-screen arrows. Emits the joined
 * initials (e.g. "ACE") through {@link confirmed}.
 */
@Component({
  selector: 'app-initials-entry',
  templateUrl: './initials-entry.html',
  styleUrl: './initials-entry.scss',
  imports: [PixelButton],
  host: { '(document:keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InitialsEntry {
  readonly confirmed = output<string>();

  protected readonly chars = signal<string[]>(Array.from({ length: LENGTH }, () => 'A'));
  protected readonly pos = signal(0);
  protected readonly value = computed(() => this.chars().join(''));

  /** Cycle the letter in `index` one step (and focus that cell). */
  protected cycle(index: number, dir: 1 | -1): void {
    this.chars.update((cur) => {
      const next = [...cur];
      const i = (ALPHABET.indexOf(cur[index]) + dir + ALPHABET.length) % ALPHABET.length;
      next[index] = ALPHABET[i];
      return next;
    });
    this.pos.set(index);
  }

  protected select(index: number): void {
    this.pos.set(index);
  }

  protected confirm(): void {
    this.confirmed.emit(this.value());
  }

  protected onKey(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'ArrowUp') {
      this.cycle(this.pos(), 1);
    } else if (key === 'ArrowDown') {
      this.cycle(this.pos(), -1);
    } else if (key === 'ArrowLeft' || key === 'Backspace') {
      this.move(-1);
    } else if (key === 'ArrowRight') {
      this.move(1);
    } else if (key === 'Enter') {
      this.confirm();
    } else if (/^[a-zA-Z]$/.test(key)) {
      this.setChar(this.pos(), key.toUpperCase());
      this.move(1);
    } else {
      return; // leave anything we don't handle to the browser
    }
    event.preventDefault();
  }

  private move(dir: -1 | 1): void {
    this.pos.update((p) => Math.min(LENGTH - 1, Math.max(0, p + dir)));
  }

  private setChar(index: number, ch: string): void {
    this.chars.update((cur) => {
      const next = [...cur];
      next[index] = ch;
      return next;
    });
  }
}

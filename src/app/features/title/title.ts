import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { ProgressStore } from '../../shared/progress.store';
import { TransitionService } from '../../shared/transition.service';
import { PixelMenuItem, PixelMenuList } from '../../ui';
import { WorldBackdrop } from '../game/backdrop/world-backdrop';
import type { Venue } from '../game/engine/types';

/**
 * Title screen in attract mode: the logo and menu over a live demo — the real
 * engine flying whole jumps across the venues, like an arcade cabinet.
 */
@Component({
  selector: 'app-title',
  templateUrl: './title.html',
  styleUrl: './title.scss',
  imports: [PixelMenuList, WorldBackdrop, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Title {
  private readonly transition = inject(TransitionService);
  private readonly transloco = inject(TranslocoService);
  protected readonly medals = inject(ProgressStore).medalCounts;
  /** The venue the demo is flying over. */
  protected readonly venue = signal<Venue>('county');

  // `selectTranslate` only emits once the active language is loaded (and again on
  // language change), so labels are never read before the translations exist —
  // unlike a plain `computed(() => transloco.translate(...))`, which runs on first
  // render and caches the missing-key fallback.
  protected readonly menuItems = toSignal(
    this.transloco.selectTranslate('menu.circuit').pipe(
      map((): PixelMenuItem[] => [
        { value: '/circuit', label: this.transloco.translate('menu.circuit') },
        { value: '/game?mode=arcade', label: this.transloco.translate('menu.arcade') },
        { value: '/game?mode=daily', label: this.transloco.translate('menu.daily') },
        { value: '/records', label: this.transloco.translate('menu.records') },
        { value: '/settings', label: this.transloco.translate('menu.settings') },
      ]),
    ),
    { initialValue: [] as PixelMenuItem[] },
  );

  // One span per letter so the logo can slam in / shine-sweep character by
  // character (same loaded-language-safe pattern as `menuItems` above).
  protected readonly logoChars = toSignal(
    this.transloco
      .selectTranslate('app.title')
      .pipe(map((title: string) => [...title].map((ch) => (ch === ' ' ? ' ' : ch)))),
    { initialValue: [] as string[] },
  );

  onSelect(route: string): void {
    this.transition.navigate(route);
  }
}

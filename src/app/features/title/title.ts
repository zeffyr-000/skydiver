import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { PixelMenuItem, PixelMenuList } from '../../ui';

@Component({
  selector: 'app-title',
  templateUrl: './title.html',
  styleUrl: './title.scss',
  imports: [PixelMenuList, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Title {
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  // `selectTranslate` only emits once the active language is loaded (and again on
  // language change), so labels are never read before the translations exist —
  // unlike a plain `computed(() => transloco.translate(...))`, which runs on first
  // render and caches the missing-key fallback.
  protected readonly menuItems = toSignal(
    this.transloco.selectTranslate('menu.play').pipe(
      map((): PixelMenuItem[] => [
        { value: '/game', label: this.transloco.translate('menu.play') },
        { value: '/records', label: this.transloco.translate('menu.records') },
        { value: '/settings', label: this.transloco.translate('menu.settings') },
      ]),
    ),
    { initialValue: [] as PixelMenuItem[] },
  );

  onSelect(route: string): void {
    this.router.navigateByUrl(route);
  }
}

import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AudioService } from './shared/audio/audio.service';
import { GamepadNavService } from './shared/controls/gamepad-nav.service';
import { MotionService } from './shared/motion.service';
import { SettingsStore } from './shared/settings.store';
import { ScreenWipe } from './ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ScreenWipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly settings = inject(SettingsStore);
  private readonly transloco = inject(TranslocoService);
  private readonly audio = inject(AudioService);

  constructor() {
    // Started with the shell: one publishes <html data-motion>, the other lets
    // a gamepad drive the menus.
    inject(MotionService);
    inject(GamepadNavService);

    // The root component is instantiated at bootstrap, so wiring the language
    // here applies a previously persisted choice before the title screen paints,
    // and re-applies it on every change from Settings. SettingsStore stays a pure
    // persistence store; the Transloco coupling lives at the shell.
    effect(() => {
      this.transloco.setActiveLang(this.settings.language());
    });

    // The soundtrack follows the screen: the flight theme in a jump, the
    // fairground rag everywhere else.
    inject(Router)
      .events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.audio.music(e.urlAfterRedirects.startsWith('/game') ? 'flight' : 'menu');
      });
  }
}

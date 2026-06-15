import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
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

  constructor() {
    // The root component is instantiated at bootstrap, so wiring the language
    // here applies a previously persisted choice before the title screen paints,
    // and re-applies it on every change from Settings. SettingsStore stays a pure
    // persistence store; the Transloco coupling lives at the shell.
    effect(() => {
      this.transloco.setActiveLang(this.settings.language());
    });
  }
}

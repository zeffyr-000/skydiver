import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelPanel, PixelSlider, SkyScene } from '../../ui';
import { Difficulty, SettingsStore } from '../../shared/settings.store';
import { TransitionService } from '../../shared/transition.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  imports: [TranslocoPipe, UpperCasePipe, PixelButton, PixelPanel, PixelSlider, SkyScene],
  host: { '(document:keydown.escape)': 'goBack()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly transition = inject(TransitionService);
  protected readonly settings = inject(SettingsStore);

  protected readonly difficulties: { value: Difficulty; labelKey: string }[] = [
    { value: 'rookie', labelKey: 'settings.difficultyRookie' },
    { value: 'ace', labelKey: 'settings.difficultyAce' },
    { value: 'barnstormer', labelKey: 'settings.difficultyBarnstormer' },
  ];

  goBack(): void {
    this.transition.navigate('/');
  }

  onBack(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.goBack();
  }
}

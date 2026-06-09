import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelPanel, PixelSlider } from '../../ui';
import { Difficulty, SettingsStore } from '../../shared/settings.store';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  imports: [RouterLink, TranslocoPipe, UpperCasePipe, PixelButton, PixelPanel, PixelSlider],
  host: { '(document:keydown.escape)': 'goBack()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly router = inject(Router);
  protected readonly settings = inject(SettingsStore);

  protected readonly difficulties: { value: Difficulty; labelKey: string }[] = [
    { value: 'rookie', labelKey: 'settings.difficultyRookie' },
    { value: 'ace', labelKey: 'settings.difficultyAce' },
    { value: 'barnstormer', labelKey: 'settings.difficultyBarnstormer' },
  ];

  goBack(): void {
    this.router.navigateByUrl('/');
  }
}

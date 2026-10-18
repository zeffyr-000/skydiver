import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelPanel } from '../../ui';
import { WorldBackdrop } from '../game/backdrop/world-backdrop';
import { EVENTS } from '../game/engine/events';
import { ProgressStore } from '../../shared/progress.store';
import { RecordsStore } from '../../shared/records.store';
import { Difficulty, SettingsStore } from '../../shared/settings.store';
import { TransitionService } from '../../shared/transition.service';

type Tab = 'arcade' | 'circuit' | 'daily';

@Component({
  selector: 'app-records',
  templateUrl: './records.html',
  styleUrl: './records.scss',
  imports: [TranslocoPipe, DatePipe, PixelButton, PixelPanel, WorldBackdrop],
  host: { '(document:keydown.escape)': 'goBack()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Records {
  private readonly transition = inject(TransitionService);
  protected readonly store = inject(RecordsStore);
  protected readonly progress = inject(ProgressStore);

  protected readonly tabs: { value: Tab; labelKey: string }[] = [
    { value: 'arcade', labelKey: 'records.tabArcade' },
    { value: 'circuit', labelKey: 'records.tabCircuit' },
    { value: 'daily', labelKey: 'records.tabDaily' },
  ];
  protected readonly difficulties: { value: Difficulty; labelKey: string }[] = [
    { value: 'rookie', labelKey: 'settings.difficultyRookie' },
    { value: 'ace', labelKey: 'settings.difficultyAce' },
    { value: 'barnstormer', labelKey: 'settings.difficultyBarnstormer' },
  ];
  protected readonly events = EVENTS;

  protected readonly tab = signal<Tab>('arcade');
  protected readonly difficulty = signal<Difficulty>(inject(SettingsStore).difficulty());

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

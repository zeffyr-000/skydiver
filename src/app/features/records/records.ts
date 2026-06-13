import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelPanel, SkyScene } from '../../ui';
import { RecordsStore } from '../../shared/records.store';
import { TransitionService } from '../../shared/transition.service';

@Component({
  selector: 'app-records',
  templateUrl: './records.html',
  styleUrl: './records.scss',
  imports: [TranslocoPipe, DatePipe, PixelButton, PixelPanel, SkyScene],
  host: { '(document:keydown.escape)': 'goBack()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Records {
  private readonly transition = inject(TransitionService);
  protected readonly store = inject(RecordsStore);

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

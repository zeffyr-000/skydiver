import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelPanel } from '../../ui';
import { RecordsStore } from '../../shared/records.store';

@Component({
  selector: 'app-records',
  templateUrl: './records.html',
  styleUrl: './records.scss',
  imports: [RouterLink, TranslocoPipe, DatePipe, PixelButton, PixelPanel],
  host: { '(document:keydown.escape)': 'goBack()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Records {
  private readonly router = inject(Router);
  protected readonly store = inject(RecordsStore);

  goBack(): void {
    this.router.navigateByUrl('/');
  }
}

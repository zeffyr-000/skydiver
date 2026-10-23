import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HANDBILL_ACTS, RATES } from '../gazette.data';

/** A period document set in type: the Black Cats' rate card or a circus handbill. */
@Component({
  selector: 'app-gazette-document',
  templateUrl: './gazette-document.html',
  styleUrl: './gazette-document.scss',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GazetteDocument {
  readonly doc = input.required<'rates' | 'handbill'>();

  protected readonly rates = RATES;
  protected readonly acts = HANDBILL_ACTS;
}

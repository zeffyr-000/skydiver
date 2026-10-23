import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelPanel } from '../../ui';
import { WorldBackdrop } from '../game/backdrop/world-backdrop';
import { EVENTS, VENUES, type EventDef } from '../game/engine/events';
import { ProgressStore } from '../../shared/progress.store';
import { TransitionService } from '../../shared/transition.service';

/**
 * The Grand Tour: five venues, two events each, then the period acts. An event
 * opens once the one before it has any medal; each shows its medal and best score.
 */
@Component({
  selector: 'app-circuit',
  templateUrl: './circuit.html',
  styleUrl: './circuit.scss',
  imports: [TranslocoPipe, PixelButton, PixelPanel, WorldBackdrop],
  host: { '(document:keydown.escape)': 'goBack()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Circuit {
  private readonly transition = inject(TransitionService);
  protected readonly progress = inject(ProgressStore);

  /** One panel per venue, then the period acts that extend the tour. */
  protected readonly panels = [
    ...VENUES.map((venue) => ({
      key: venue as string,
      heading: `circuit.venue.${venue}`,
      events: EVENTS.filter((e) => e.venue === venue && e.group !== 'heritage'),
    })),
    {
      key: 'heritage',
      heading: 'circuit.group.heritage',
      events: EVENTS.filter((e) => e.group === 'heritage'),
    },
  ];
  protected readonly total = EVENTS.length;

  open(e: EventDef): void {
    if (this.progress.isUnlocked(e.id)) {
      this.transition.navigate(`/game?mode=circuit&event=${e.id}`);
    }
  }

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

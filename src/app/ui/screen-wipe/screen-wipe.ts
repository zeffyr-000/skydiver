import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  TransitionService,
  WIPE_CELL_MS,
  WIPE_COLS,
  WIPE_ROWS,
  WIPE_STAGGER_MS,
} from '../../shared/transition.service';

/**
 * Full-screen SNES checkerboard wipe rendered while the TransitionService is
 * covering or revealing. A grid of cells pops in along a diagonal wave (delay
 * proportional to row + col), then pops out in the same direction so the black
 * sweep reads as one continuous pass across both halves of the transition.
 */
@Component({
  selector: 'app-screen-wipe',
  templateUrl: './screen-wipe.html',
  styleUrl: './screen-wipe.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenWipe {
  protected readonly transition = inject(TransitionService);

  protected readonly cellMs = WIPE_CELL_MS;
  protected readonly staggerMs = WIPE_STAGGER_MS;

  /** Diagonal index (row + col) per cell, row-major — drives each cell's wave delay. */
  protected readonly cells = Array.from(
    { length: WIPE_COLS * WIPE_ROWS },
    (_, i) => Math.floor(i / WIPE_COLS) + (i % WIPE_COLS),
  );
}

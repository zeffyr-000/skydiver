import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-pixel-panel',
  templateUrl: './pixel-panel.html',
  styleUrl: './pixel-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelPanel {
  /** Optional title-bar caption. When empty, the title bar is hidden. */
  readonly heading = input('');
}

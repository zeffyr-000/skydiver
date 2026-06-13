import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SkySceneVariant = 'full' | 'calm';

/**
 * Purely decorative animated backdrop shared by the non-game screens, so every
 * menu lives in the same world as the game. 'full' is the title attract mode
 * (plane flyby dropping a diver, busy airfield); 'calm' tones it down to
 * drifting clouds and a lone windsock behind a content panel.
 */
@Component({
  selector: 'app-sky-scene',
  templateUrl: './sky-scene.html',
  styleUrl: './sky-scene.scss',
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkyScene {
  readonly variant = input<SkySceneVariant>('calm');
}

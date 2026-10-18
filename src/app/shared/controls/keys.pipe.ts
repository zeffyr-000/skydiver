import { inject, Pipe, type PipeTransform } from '@angular/core';
import { ControlsService } from './controls.service';

/**
 * `{{ 'brief.keys' | transloco | keys }}` — fills `[action]`, `[left]`… with
 * the player's keys (or pad buttons). Impure so it follows rebinding and the
 * device switch; the work is a tiny string replace.
 */
@Pipe({ name: 'keys', pure: false })
export class KeysPipe implements PipeTransform {
  private readonly controls = inject(ControlsService);

  transform(text: string | null | undefined): string {
    return text ? this.controls.fill(text) : '';
  }
}

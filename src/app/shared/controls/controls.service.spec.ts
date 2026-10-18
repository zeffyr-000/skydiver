import { TestBed } from '@angular/core/testing';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { bindKey, DEFAULT_BINDINGS } from '../../features/game/engine/bindings';
import { SettingsStore } from '../settings.store';
import { ControlsService } from './controls.service';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({ keys: { Space: 'Espace', Escape: 'Échap' } });
  }
}

describe('ControlsService', () => {
  let controls: ControlsService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({
          config: { availableLangs: ['fr'], defaultLang: 'fr' },
          loader: StubLoader,
        }),
      ],
    });
    controls = TestBed.inject(ControlsService);
    // Let the translation load.
    await new Promise((r) => setTimeout(r));
  });

  it('fills key tokens with the player’s primary keys, names translated', () => {
    expect(controls.fill('[action] : SAUTER')).toBe('Espace : SAUTER');
    expect(controls.fill('[left] [right] tourner · [pause]')).toBe('← → tourner · Échap');
    expect(controls.fill('no tokens here')).toBe('no tokens here');
  });

  it('follows rebinding', () => {
    TestBed.inject(SettingsStore).keys.set(bindKey(DEFAULT_BINDINGS, 'action', 0, 'KeyJ'));
    expect(controls.fill('[action]')).toBe('J');
  });

  it('upper-cases for the canvas HUD', () => {
    expect(controls.fill('[action]: JUMP', true)).toBe('ESPACE: JUMP');
  });

  it('shows the pad’s buttons once a gamepad is in use', () => {
    controls.device.set('gamepad');
    expect(controls.fill('[action] / [pause] / [up]')).toBe('A / START / ↑');
  });

  it('learns what a key types from real presses (layouts without the Keyboard Map API)', () => {
    // jsdom can't make a trusted event: hand the listener what a real press carries.
    const learn = (controls as unknown as { learn: (e: Partial<KeyboardEvent>) => void }).learn;
    learn({ isTrusted: true, key: 'z', code: 'KeyW' });
    expect(controls.label('KeyW')).toBe('Z');
    expect(controls.device()).toBe('keyboard');
  });
});

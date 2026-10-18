import { TestBed } from '@angular/core/testing';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import type { PadSnapshot } from '../../features/game/engine/gamepad';
import { ControlsService } from './controls.service';
import { GamepadNavService } from './gamepad-nav.service';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({});
  }
}

const A = 0;
const B = 1;
const START = 9;
const DOWN = 13;

describe('GamepadNavService', () => {
  let nav: GamepadNavService;
  let pad: PadSnapshot;
  let now = 0;

  function hold(...buttons: number[]): void {
    pad = {
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
    };
    nav.poll((now += 16));
  }

  /** Press and release, like a thumb would. */
  function tap(button: number): void {
    hold(button);
    hold();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: StubLoader,
        }),
      ],
    });
    nav = TestBed.inject(GamepadNavService);
    nav.pads = () => [pad];
    hold();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('A presses the focused button; it marks the pad as the device in use', () => {
    const btn = document.createElement('button');
    const clicked = vi.fn();
    btn.addEventListener('click', clicked);
    document.body.append(btn);
    btn.focus();
    tap(A);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(ControlsService).device()).toBe('gamepad');
  });

  it('a direction goes to whoever handles the arrow key first', () => {
    const box = document.createElement('div');
    box.tabIndex = 0;
    const seen: string[] = [];
    box.addEventListener('keydown', (e) => {
      seen.push(e.key);
      e.preventDefault();
    });
    document.body.append(box);
    box.focus();
    tap(DOWN);
    expect(seen).toEqual(['ArrowDown']);
  });

  it('a held direction repeats like a key, after a delay', () => {
    const box = document.createElement('div');
    box.tabIndex = 0;
    let count = 0;
    box.addEventListener('keydown', (e) => {
      count++;
      e.preventDefault();
    });
    document.body.append(box);
    box.focus();
    for (let i = 0; i < 30; i++) hold(DOWN); // ~480 ms
    expect(count).toBe(2);
  });

  it('B sends Escape, and closes an open dialog nobody else closed', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    dialog.close = vi.fn(() => dialog.removeAttribute('open'));
    document.body.append(dialog);
    const escapes = vi.fn();
    document.addEventListener('keydown', escapes);
    tap(B);
    expect(escapes).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    expect(dialog.close).toHaveBeenCalled();
    document.removeEventListener('keydown', escapes);
  });

  it('while flying, only Start (pause) is translated — A belongs to the jump', () => {
    nav.flying = true;
    nav.startPauses = true;
    const keys: string[] = [];
    const spy = (e: KeyboardEvent) => keys.push(e.key);
    document.addEventListener('keydown', spy);
    tap(A);
    tap(DOWN);
    tap(START);
    expect(keys).toEqual(['Escape']);
    document.removeEventListener('keydown', spy);
  });
});

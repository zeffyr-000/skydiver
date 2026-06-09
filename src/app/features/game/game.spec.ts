import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { Game } from './game';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({});
  }
}

describe('Game', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Game],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: StubLoader,
        }),
      ],
    }).compileComponents();
  });

  it('creates and renders the game canvas', async () => {
    const fixture = TestBed.createComponent(Game);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('canvas')).toBeTruthy();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  provideTransloco,
  TranslocoService,
  type Translation,
  type TranslocoLoader,
} from '@jsverse/transloco';
import { of } from 'rxjs';
import { App } from './app';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({});
  }
}

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en', 'fr'], defaultLang: 'en' },
          loader: StubLoader,
        }),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('drives the active language from the persisted setting', () => {
    localStorage.setItem('skydiver.settings', JSON.stringify({ language: 'fr' }));
    const transloco = TestBed.inject(TranslocoService);

    TestBed.createComponent(App);
    TestBed.tick(); // flush the language effect

    expect(transloco.getActiveLang()).toBe('fr');
  });
});

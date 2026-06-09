import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { Title } from './title';
import type { PixelMenuItem } from '../../ui';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({
      menu: { play: 'Play', records: 'Records', settings: 'Settings' },
    });
  }
}

describe('Title', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Title],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: StubLoader,
        }),
      ],
    }).compileComponents();
  });

  it('builds menu items with translated labels once translations load', async () => {
    const fixture = TestBed.createComponent(Title);
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();

    const menuItems = (
      fixture.componentInstance as unknown as { menuItems: () => PixelMenuItem[] }
    ).menuItems();
    expect(menuItems.map((i) => i.label)).toEqual(['Play', 'Records', 'Settings']);
    expect(menuItems.map((i) => i.value)).toEqual(['/game', '/records', '/settings']);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { Title } from './title';
import { TransitionService } from '../../shared/transition.service';
import type { PixelMenuItem } from '../../ui';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({
      app: { title: 'Skydiver' },
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

  async function renderTitle() {
    const fixture = TestBed.createComponent(Title);
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    return fixture;
  }

  it('builds menu items with translated labels once translations load', async () => {
    const fixture = await renderTitle();

    const menuItems = (
      fixture.componentInstance as unknown as { menuItems: () => PixelMenuItem[] }
    ).menuItems();
    expect(menuItems.map((i) => i.label)).toEqual(['Play', 'Records', 'Settings']);
    expect(menuItems.map((i) => i.value)).toEqual(['/game', '/records', '/settings']);
  });

  it('splits the translated title into per-letter logo spans', async () => {
    const fixture = await renderTitle();

    const logoChars = (
      fixture.componentInstance as unknown as { logoChars: () => string[] }
    ).logoChars();
    expect(logoChars).toEqual(['S', 'k', 'y', 'd', 'i', 'v', 'e', 'r']);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.title__logo-ch')).toHaveLength(8);
  });

  it('delegates menu activation to the wipe transition', async () => {
    const navigate = vi.spyOn(TestBed.inject(TransitionService), 'navigate');
    const fixture = await renderTitle();

    fixture.componentInstance.onSelect('/game');
    expect(navigate).toHaveBeenCalledWith('/game');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { EVENTS } from '../game/engine/events';
import { ProgressStore } from '../../shared/progress.store';
import { TransitionService } from '../../shared/transition.service';
import { Circuit } from './circuit';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({});
  }
}

describe('Circuit', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Circuit],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
          loader: StubLoader,
        }),
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(Circuit);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('lists every event, only the first unlocked at the start', async () => {
    const fixture = await render();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(EVENTS.length);
    expect(buttons.filter((b) => !b.disabled)).toHaveLength(1);
  });

  it('lists the period acts in a panel of their own, after the five venues', async () => {
    const fixture = await render();
    const panels = [...fixture.nativeElement.querySelectorAll('app-pixel-panel')] as HTMLElement[];
    expect(panels).toHaveLength(6);
    const acts = EVENTS.filter((e) => e.group === 'heritage');
    expect(acts.map((e) => e.id)).toEqual(['fair-balloon', 'meet-double', 'sea-grand-act']);
    expect(panels[5].querySelectorAll('button')).toHaveLength(acts.length);
  });

  it('a medal on the first event opens the second', async () => {
    TestBed.inject(ProgressStore).submitEvent(EVENTS[0].id, EVENTS[0].medals[0]);
    const fixture = await render();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.filter((b) => !b.disabled)).toHaveLength(2);
  });

  it('opens an unlocked event in the game, and ignores locked ones', async () => {
    const navigate = vi.spyOn(TestBed.inject(TransitionService), 'navigate');
    const fixture = await render();
    const circuit = fixture.componentInstance;
    circuit.open(EVENTS[1]);
    expect(navigate).not.toHaveBeenCalled();
    circuit.open(EVENTS[0]);
    expect(navigate).toHaveBeenCalledWith(`/game?mode=circuit&event=${EVENTS[0].id}`);
  });
});

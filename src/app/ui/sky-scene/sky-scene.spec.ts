import { TestBed } from '@angular/core/testing';
import { SkyScene, SkySceneVariant } from './sky-scene';

describe('SkyScene', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkyScene],
    }).compileComponents();
  });

  function render(variant: SkySceneVariant): HTMLElement {
    const fixture = TestBed.createComponent(SkyScene);
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('is hidden from assistive technology', () => {
    expect(render('calm').getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the calm backdrop without the attract-mode actors', () => {
    const el = render('calm');
    expect(el.querySelector('.scene__flyby')).toBeNull();
    expect(el.querySelector('.scene__diver')).toBeNull();
    expect(el.querySelector('.scene__deco--crowd')).toBeNull();
    expect(el.querySelector('.scene__deco--windsock')).not.toBeNull();
  });

  it('renders the golden-hour horizon in both variants', () => {
    for (const variant of ['calm', 'full'] as const) {
      const el = render(variant);
      expect(el.querySelector('.scene__sun')).not.toBeNull();
      expect(el.querySelectorAll('.scene__hills')).toHaveLength(2);
    }
  });

  it('renders the full attract-mode scene', () => {
    const el = render('full');
    expect(el.querySelector('.scene__flyby')).not.toBeNull();
    expect(el.querySelectorAll('.scene__diver')).toHaveLength(2);
    expect(el.querySelectorAll('.scene__deco--crowd')).toHaveLength(2);
  });
});

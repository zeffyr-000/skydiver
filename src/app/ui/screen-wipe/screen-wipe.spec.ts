import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  TransitionService,
  WIPE_COLS,
  WIPE_ROWS,
  WipePhase,
} from '../../shared/transition.service';
import { ScreenWipe } from './screen-wipe';

describe('ScreenWipe', () => {
  const phase = signal<WipePhase>('idle');

  beforeEach(() => {
    phase.set('idle');
    TestBed.configureTestingModule({
      imports: [ScreenWipe],
      providers: [{ provide: TransitionService, useValue: { phase } }],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(ScreenWipe);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing while idle', () => {
    const fixture = render();
    expect(fixture.nativeElement.querySelector('.wipe')).toBeNull();
  });

  it('renders the hidden-from-AT cell grid with diagonal delays while covering', () => {
    phase.set('covering');
    const fixture = render();

    const wipe = fixture.nativeElement.querySelector('.wipe') as HTMLElement;
    expect(wipe.getAttribute('aria-hidden')).toBe('true');
    expect(wipe.classList.contains('wipe--reveal')).toBe(false);

    const cells = wipe.querySelectorAll<HTMLElement>('.wipe__cell');
    expect(cells).toHaveLength(WIPE_COLS * WIPE_ROWS);
    expect(cells[0].style.getPropertyValue('--d')).toBe('0');
    expect(cells[cells.length - 1].style.getPropertyValue('--d')).toBe(
      String(WIPE_COLS - 1 + (WIPE_ROWS - 1)),
    );
  });

  it('switches to the reveal modifier while revealing', () => {
    phase.set('revealing');
    const fixture = render();

    const wipe = fixture.nativeElement.querySelector('.wipe') as HTMLElement;
    expect(wipe.classList.contains('wipe--reveal')).toBe(true);
  });
});

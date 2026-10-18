import { TestBed } from '@angular/core/testing';
import { MotionService } from './motion.service';
import { SettingsStore } from './settings.store';

describe('MotionService', () => {
  let systemReduces = false;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: systemReduces, addEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['motion'];
  });

  it('on Auto, follows the OS preference', () => {
    systemReduces = true;
    const motion = TestBed.inject(MotionService);
    expect(motion.reduced()).toBe(true);
  });

  it('the Settings choice overrides the OS either way', () => {
    systemReduces = true;
    const motion = TestBed.inject(MotionService);
    const settings = TestBed.inject(SettingsStore);
    settings.motion.set('full');
    expect(motion.reduced()).toBe(false);
    systemReduces = false;
    settings.motion.set('reduced');
    expect(motion.reduced()).toBe(true);
  });

  it('publishes the result on <html data-motion> for CSS and the UI kit', () => {
    systemReduces = false;
    TestBed.inject(MotionService);
    TestBed.tick();
    expect(document.documentElement.dataset['motion']).toBe('full');
    TestBed.inject(SettingsStore).motion.set('reduced');
    TestBed.tick();
    expect(document.documentElement.dataset['motion']).toBe('reduced');
  });
});

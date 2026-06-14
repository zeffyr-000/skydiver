import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TransitionService, WIPE_TOTAL_MS } from './transition.service';

@Component({ template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class Blank {}

describe('TransitionService', () => {
  let service: TransitionService;
  let router: Router;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'settings', component: Blank },
          { path: 'records', component: Blank },
          { path: 'blocked', component: Blank, canActivate: [() => false] },
        ]),
      ],
    });
    // Inject before the first navigation so the service observes it.
    service = TestBed.inject(TransitionService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Initial navigation — consumed silently by the service (no wipe on app load). */
  async function initialNavigation(): Promise<void> {
    await router.navigateByUrl('/');
    expect(service.phase()).toBe('idle');
  }

  it('runs the full covering → navigate → revealing → idle cycle', async () => {
    await initialNavigation();

    service.navigate('/settings');
    expect(service.phase()).toBe('covering');
    expect(router.url).toBe('/'); // navigation deferred until the cover lands

    await vi.advanceTimersByTimeAsync(WIPE_TOTAL_MS);
    expect(router.url).toBe('/settings');
    expect(service.phase()).toBe('revealing');

    await vi.advanceTimersByTimeAsync(WIPE_TOTAL_MS);
    expect(service.phase()).toBe('idle');
  });

  it('ignores navigate() while a wipe is already running', async () => {
    await initialNavigation();

    service.navigate('/settings');
    service.navigate('/records'); // double-click mid-wipe

    await vi.advanceTimersByTimeAsync(WIPE_TOTAL_MS * 2);
    expect(router.url).toBe('/settings');
  });

  it('plays a reveal-only wipe for navigations that bypass the service', async () => {
    await initialNavigation();

    await router.navigateByUrl('/settings'); // e.g. the game screen's quit()
    expect(service.phase()).toBe('revealing');

    await vi.advanceTimersByTimeAsync(WIPE_TOTAL_MS);
    expect(service.phase()).toBe('idle');
  });

  it('skips the very first navigation (initial app load)', async () => {
    await router.navigateByUrl('/');
    expect(service.phase()).toBe('idle');
  });

  it('navigates instantly when the user prefers reduced motion', async () => {
    await initialNavigation();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true } as Partial<MediaQueryList>),
    );
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');

    service.navigate('/settings');
    expect(navigateByUrl).toHaveBeenCalledWith('/settings');
    expect(service.phase()).toBe('idle');

    await vi.advanceTimersByTimeAsync(WIPE_TOTAL_MS * 2);
    expect(service.phase()).toBe('idle'); // no reveal either
  });

  it('returns to idle when the navigation is cancelled', async () => {
    await initialNavigation();

    service.navigate('/blocked');
    await vi.advanceTimersByTimeAsync(WIPE_TOTAL_MS);

    expect(router.url).toBe('/');
    expect(service.phase()).toBe('idle');
  });
});

import { TestBed } from '@angular/core/testing';
import { WorldBackdrop } from './world-backdrop';

describe('WorldBackdrop', () => {
  it('renders a decorative canvas (no 2D context under jsdom: it simply stays still)', async () => {
    const fixture = TestBed.createComponent(WorldBackdrop);
    fixture.componentRef.setInput('mode', 'calm');
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('canvas')).toBeTruthy();
    expect(host.querySelector('.backdrop__shade--calm')).toBeTruthy();
  });
});

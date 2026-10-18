import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CountUp } from './count-up';

@Component({
  imports: [CountUp],
  template: '<app-count-up [value]="value()" [duration]="0" />',
})
class Host {
  readonly value = signal(1234);
}

describe('CountUp', () => {
  it('shows the final value when there is nothing to animate', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.trim()).toBe('1234');

    fixture.componentInstance.value.set(56);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.trim()).toBe('56');
  });
});

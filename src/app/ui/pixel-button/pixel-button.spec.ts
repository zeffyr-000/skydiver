import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PixelButton } from './pixel-button';

describe('PixelButton', () => {
  it('emits "pressed" when clicked while enabled', () => {
    const fixture = TestBed.createComponent(PixelButton);
    const spy = vi.fn();
    fixture.componentInstance.pressed.subscribe(spy);

    fixture.componentInstance.onClick();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not emit when disabled', () => {
    const fixture = TestBed.createComponent(PixelButton);
    fixture.componentRef.setInput('disabled', true);
    const spy = vi.fn();
    fixture.componentInstance.pressed.subscribe(spy);

    fixture.componentInstance.onClick();

    expect(spy).not.toHaveBeenCalled();
  });
});

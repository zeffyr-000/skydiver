import { TestBed } from '@angular/core/testing';
import { PixelSlider } from './pixel-slider';

describe('PixelSlider', () => {
  it('updates the two-way bound value from a range input event', () => {
    const fixture = TestBed.createComponent(PixelSlider);
    const slider = fixture.componentInstance;

    const inputEl = document.createElement('input');
    inputEl.type = 'range';
    inputEl.value = '55';
    slider.onInput({ target: inputEl } as unknown as Event);

    expect(slider.value()).toBe(55);
  });
});

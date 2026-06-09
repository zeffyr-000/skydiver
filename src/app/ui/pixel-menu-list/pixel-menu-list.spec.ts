import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PixelMenuList } from './pixel-menu-list';

describe('PixelMenuList', () => {
  it('emits the last activated value and clears the momentary selection', () => {
    const fixture = TestBed.createComponent(PixelMenuList);
    const menu = fixture.componentInstance;
    const spy = vi.fn();
    menu.activate.subscribe(spy);

    menu.onSelect(['/game']);

    expect(spy).toHaveBeenCalledWith('/game');
    // The selection resets so the listbox behaves like a momentary trigger.
    expect((menu as unknown as { selected: () => string[] }).selected()).toEqual([]);
  });

  it('ignores an empty selection', () => {
    const fixture = TestBed.createComponent(PixelMenuList);
    const menu = fixture.componentInstance;
    const spy = vi.fn();
    menu.activate.subscribe(spy);

    menu.onSelect([]);

    expect(spy).not.toHaveBeenCalled();
  });
});

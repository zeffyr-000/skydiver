import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InitialsEntry } from './initials-entry';

function key(k: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
}

describe('InitialsEntry', () => {
  let fixture: ComponentFixture<InitialsEntry>;
  let emitted: string | undefined;

  beforeEach(() => {
    emitted = undefined;
    fixture = TestBed.createComponent(InitialsEntry);
    fixture.componentInstance.confirmed.subscribe((v) => (emitted = v));
    fixture.detectChanges(); // wires up the document:keydown host listener
  });

  afterEach(() => fixture.destroy());

  it('starts at AAA and confirms the current value on Enter', () => {
    key('Enter');
    expect(emitted).toBe('AAA');
  });

  it('types letters across the cells', () => {
    key('a');
    key('c');
    key('e');
    key('Enter');
    expect(emitted).toBe('ACE');
  });

  it('cycles the focused letter with the arrow keys and wraps', () => {
    key('ArrowUp'); // cell 0: A -> B
    key('ArrowRight');
    key('ArrowDown'); // cell 1: A -> Z (wraps backwards)
    key('Enter');
    expect(emitted).toBe('BZA');
  });
});

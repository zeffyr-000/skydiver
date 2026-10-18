import { TestBed } from '@angular/core/testing';
import { AudioService, QUIET } from './audio.service';

describe('AudioService', () => {
  beforeEach(() => localStorage.clear());

  it('is a silent no-op until a gesture unlocks audio (and without Web Audio)', () => {
    const audio = TestBed.inject(AudioService);
    expect(audio.ready).toBe(false);
    expect(() => {
      audio.music('menu');
      audio.setAmbience(QUIET);
      audio.play('ringPass');
      audio.move();
      audio.select();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    }).not.toThrow();
    expect(audio.ready).toBe(false); // jsdom has no AudioContext
  });
});

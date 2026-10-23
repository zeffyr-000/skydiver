import { effect, inject, Injectable } from '@angular/core';
import type { UiSounds } from '../../ui/ui-sounds';
import { SettingsStore } from '../settings.store';
import { FLIGHT_THEME, MENU_THEME, type Track } from './music';
import { Synth, type AmbienceLevels, type SoundName } from './synth';

export type MusicTrack = 'menu' | 'flight';

const TRACKS: Record<MusicTrack, Track> = { menu: MENU_THEME, flight: FLIGHT_THEME };

/** No wind, no engine, no crowd, music at full. */
export const QUIET: AmbienceLevels = { wind: 0, windPitch: 0, engine: 0, music: 1, crowd: 0 };

/**
 * The game's audio, app-wide. Browsers only start audio after a user gesture,
 * so the synth is created on the first key or pointer press; until then every
 * call just records what *should* be playing. Volumes follow the settings.
 * Without Web Audio (old browsers, unit tests) everything is a silent no-op.
 */
@Injectable({ providedIn: 'root' })
export class AudioService implements UiSounds {
  private readonly settings = inject(SettingsStore);
  private synth: Synth | null = null;
  private track: MusicTrack | null = null;
  private ambience: AmbienceLevels = QUIET;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
    }
    effect(() => {
      const music = this.settings.musicVolume() / 100;
      const sfx = this.settings.sfxVolume() / 100;
      this.synth?.setVolumes(music, sfx);
    });
  }

  /** Whether sound is actually running (after the first gesture). */
  get ready(): boolean {
    return this.synth !== null;
  }

  play(name: SoundName, delay = 0): void {
    this.synth?.play(name, delay);
  }

  /** Loop a music track (null for silence). */
  music(track: MusicTrack | null): void {
    this.track = track;
    this.synth?.playMusic(track ? TRACKS[track] : null);
  }

  setAmbience(levels: AmbienceLevels): void {
    this.ambience = levels;
    this.synth?.setAmbience(levels);
  }

  move(): void {
    this.play('uiMove');
  }

  select(): void {
    this.play('uiSelect');
  }

  private unlock(): void {
    if (this.synth) {
      if (this.synth.ctx.state === 'suspended') {
        void this.synth.ctx.resume();
      }
      return;
    }
    if (typeof AudioContext === 'undefined') {
      return;
    }
    try {
      this.synth = new Synth(new AudioContext());
    } catch {
      return; // no audio device — stay silent
    }
    this.synth.setVolumes(this.settings.musicVolume() / 100, this.settings.sfxVolume() / 100);
    this.synth.setAmbience(this.ambience);
    this.synth.playMusic(this.track ? TRACKS[this.track] : null);
  }
}

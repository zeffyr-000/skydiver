import { noteFreq, parseDrums, parsePart, type Note, type Track } from './music';

/**
 * Everything the game sounds like, synthesised live with the Web Audio API —
 * no samples, no dependency. Framework-agnostic (the AudioService wires it to
 * Angular): a music bus and an effects bus, a looping ambience (wind, the
 * biplane's engine), one-shot effects and a small lookahead chiptune sequencer.
 */

export type SoundName =
  // UI
  | 'uiMove'
  | 'uiSelect'
  | 'uiBack'
  | 'wipe'
  // Jump
  | 'spotGreen'
  | 'jump'
  | 'deploy'
  | 'canopyOpen'
  | 'flare'
  | 'stall'
  | 'ringPass'
  | 'ringMiss'
  | 'deckBeep'
  | 'standup'
  | 'slide'
  | 'tumble'
  | 'crash'
  | 'splash'
  | 'cheer'
  | 'bullseye'
  // Results
  | 'tally'
  | 'medalGold'
  | 'medalSilver'
  | 'medalBronze'
  | 'newBest'
  | 'fail';

export interface AmbienceLevels {
  wind: number;
  windPitch: number;
  engine: number;
  music: number;
}

type Wave = OscillatorType | PeriodicWave;

/** Scheduling window of the sequencer (s) and how often it tops it up (ms). */
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export class Synth {
  private readonly master: GainNode;
  private readonly musicBus: GainNode;
  /** Ambience-driven music duck (under the free-fall roar). */
  private readonly musicDuck: GainNode;
  private readonly sfx: GainNode;
  private readonly noise: AudioBuffer;
  private readonly pulses = new Map<number, PeriodicWave>();

  private readonly windGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly engineGain: GainNode;

  private track: Track | null = null;
  private lead: Note[] = [];
  private bass: Note[] = [];
  private drums: string[] = [];
  private steps = 0;
  private nextStep = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(readonly ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.musicBus.connect(this.musicDuck).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    // Two seconds of white noise, shared by every noisy sound.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }

    // Ambience: a looping band-passed rush and a putt-putting engine.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.sfx);
    wind.start();

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineTone = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 16; // cylinder beat
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.45;
    engineTone.gain.value = 0.55;
    lfo.connect(lfoDepth).connect(engineTone.gain);
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 700;
    for (const [type, freq] of [
      ['sawtooth', 52],
      ['square', 104.6],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(engineTone);
      osc.start();
    }
    engineTone.connect(engineFilter).connect(this.engineGain).connect(this.sfx);
    lfo.start();
  }

  /** Bus levels from the settings (0..1 each); perceptual (squared) curve. */
  setVolumes(music: number, sfx: number): void {
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(music * music * 0.32, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx * sfx * 0.9, t, 0.05);
  }

  setAmbience(a: AmbienceLevels): void {
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(a.wind * 0.42, t, 0.12);
    this.windFilter.frequency.setTargetAtTime(350 + a.windPitch * 1900, t, 0.2);
    this.engineGain.gain.setTargetAtTime(a.engine * 0.22, t, 0.15);
    this.musicDuck.gain.setTargetAtTime(a.music, t, 0.4);
  }

  // ---------------------------------------------------------------- music ---

  /** Loop a track (null stops the music). Re-playing the current track is a no-op. */
  playMusic(track: Track | null): void {
    if (track === this.track) {
      return;
    }
    this.track = track;
    clearInterval(this.timer);
    this.timer = undefined;
    if (!track) {
      return;
    }
    const lead = parsePart(track.lead);
    this.lead = lead.notes;
    this.bass = parsePart(track.bass).notes;
    this.drums = track.drums ? parseDrums(track.drums) : [];
    this.steps = lead.steps;
    this.nextStep = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  /** Top up the next LOOKAHEAD seconds of the current track. */
  private schedule(): void {
    const track = this.track;
    if (!track) {
      return;
    }
    const sixteenth = 60 / track.bpm / 4;
    const lead = this.pulse(track.leadDuty);
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const step = this.nextStep;
      const t = this.nextTime + (step % 2 ? track.swing * sixteenth : 0);
      for (const n of this.lead) {
        if (n.step === step)
          this.tone(lead, n.freq, t, n.length * sixteenth * 0.92, 0.5, this.musicBus, 0.01, 0.06);
      }
      for (const n of this.bass) {
        if (n.step === step)
          this.tone(
            'triangle',
            n.freq,
            t,
            n.length * sixteenth * 0.95,
            0.9,
            this.musicBus,
            0.005,
            0.03,
          );
      }
      const hit = this.drums[step] ?? '-';
      if (hit === 'k' || hit === 'x') this.kick(t, this.musicBus, 0.9);
      if (hit === 'h' || hit === 'x')
        this.noiseHit(t, 0.03, 0.18, 'highpass', 7000, undefined, this.musicBus);
      if (hit === 's') this.noiseHit(t, 0.11, 0.45, 'bandpass', 1900, 1200, this.musicBus);
      this.nextStep = (step + 1) % this.steps;
      this.nextTime += sixteenth;
    }
  }

  // ------------------------------------------------------------ one-shots ---

  play(name: SoundName, delay = 0): void {
    const t = this.ctx.currentTime + 0.005 + delay;
    const sq = 'square';
    const p125 = this.pulse(0.125);
    switch (name) {
      case 'uiMove':
        this.tone(p125, 880, t, 0.05, 0.16);
        break;
      case 'uiSelect':
        this.tone(sq, 660, t, 0.06, 0.12);
        this.tone(sq, 990, t + 0.06, 0.1, 0.12);
        break;
      case 'uiBack':
        this.tone(sq, 660, t, 0.06, 0.12);
        this.tone(sq, 440, t + 0.06, 0.1, 0.12);
        break;
      case 'wipe':
        this.noiseHit(t, 0.38, 0.16, 'bandpass', 350, 3200);
        break;
      case 'spotGreen':
        this.tone('sine', 1318.5, t, 0.5, 0.3);
        this.tone('sine', 2637, t, 0.3, 0.08);
        break;
      case 'jump':
        this.noiseHit(t, 0.6, 0.4, 'bandpass', 2400, 500);
        this.tone('sine', 220, t, 0.25, 0.25, this.sfx, 0.005, 0.2, 110);
        break;
      case 'deploy':
        for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.09, 0.08, 0.16, 'highpass', 1800);
        break;
      case 'canopyOpen':
        this.noiseHit(t, 0.12, 0.6, 'lowpass', 1400, 400);
        this.tone('sine', 95, t, 0.32, 0.8, this.sfx, 0.003, 0.25, 42);
        break;
      case 'flare':
        this.noiseHit(t, 0.7, 0.3, 'bandpass', 1300, 380);
        break;
      case 'stall':
        this.tone(sq, 320, t, 0.22, 0.12, this.sfx, 0.005, 0.1, 210);
        this.tone(sq, 300, t + 0.26, 0.3, 0.12, this.sfx, 0.005, 0.15, 150);
        break;
      case 'ringPass':
        this.tone('sine', 1046.5, t, 0.14, 0.3);
        this.tone('sine', 1568, t + 0.08, 0.3, 0.3);
        this.tone('triangle', 2093, t + 0.16, 0.14, 0.18);
        break;
      case 'ringMiss':
        this.tone(sq, 185, t, 0.28, 0.13, this.sfx, 0.005, 0.15, 123);
        break;
      case 'deckBeep':
        this.tone(sq, 1760, t, 0.07, 0.13);
        break;
      case 'standup':
        this.thump(t, 0.5);
        break;
      case 'slide':
        this.thump(t, 0.6);
        this.noiseHit(t + 0.03, 0.5, 0.35, 'lowpass', 900, 250);
        break;
      case 'tumble':
        this.thump(t, 0.7);
        this.thump(t + 0.22, 0.45);
        this.noiseHit(t + 0.05, 0.45, 0.3, 'lowpass', 800, 200);
        break;
      case 'crash':
        this.tone('sine', 80, t, 0.6, 1, this.sfx, 0.002, 0.45, 28);
        this.noiseHit(t, 0.7, 0.75, 'lowpass', 1600, 160);
        this.noiseHit(t + 0.02, 0.12, 0.35, 'highpass', 2600);
        break;
      case 'splash':
        this.noiseHit(t, 0.9, 0.6, 'lowpass', 3500, 280);
        for (let i = 0; i < 5; i++) {
          this.tone(
            'sine',
            600 + i * 230,
            t + 0.15 + i * 0.07,
            0.06,
            0.08,
            this.sfx,
            0.002,
            0.04,
            1200 + i * 200,
          );
        }
        break;
      case 'cheer':
        // A crowd: overlapping swells of mid-band noise, with a few whistles.
        for (let i = 0; i < 6; i++)
          this.noiseHit(t + i * 0.12, 1.4, 0.12, 'bandpass', 900 + i * 140, 1100 + i * 90);
        this.tone('sine', 2100, t + 0.3, 0.25, 0.05, this.sfx, 0.02, 0.1, 2600);
        this.tone('sine', 2400, t + 0.7, 0.3, 0.04, this.sfx, 0.02, 0.1, 1900);
        break;
      case 'bullseye':
        this.arpeggio(['C6', 'E6', 'G6', 'C7'], t + 0.1, 0.07, 0.22, 'triangle');
        break;
      case 'tally':
        for (let i = 0; i < 14; i++) this.tone(sq, 1200 + (i % 2) * 300, t + i * 0.1, 0.025, 0.07);
        break;
      case 'medalGold':
        this.arpeggio(['C5', 'E5', 'G5'], t, 0.1, 0.22, this.pulse(0.25));
        this.tone(this.pulse(0.25), 1046.5, t + 0.3, 0.7, 0.25, this.sfx, 0.01, 0.3);
        this.tone('triangle', 523.25, t + 0.3, 0.7, 0.25, this.sfx, 0.01, 0.3);
        break;
      case 'medalSilver':
        this.arpeggio(['G4', 'C5', 'E5'], t, 0.1, 0.2, this.pulse(0.25));
        this.tone(this.pulse(0.25), 783.99, t + 0.3, 0.45, 0.2, this.sfx, 0.01, 0.2);
        break;
      case 'medalBronze':
        this.arpeggio(['C5', 'G5'], t, 0.12, 0.2, this.pulse(0.25));
        break;
      case 'newBest':
        this.arpeggio(['C6', 'D6', 'E6', 'G6', 'C7'], t, 0.05, 0.12, 'triangle');
        break;
      case 'fail':
        for (const [i, f] of [392, 370, 349.2, 329.6].entries()) {
          this.tone(sq, f, t + i * 0.2, 0.2, 0.11, this.sfx, 0.005, 0.08, f * 0.97);
        }
        break;
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    void this.ctx.close();
  }

  // ------------------------------------------------------------- building ---

  /** A pulse wave of the given duty (Fourier series), cached. */
  private pulse(duty: number): PeriodicWave {
    let w = this.pulses.get(duty);
    if (!w) {
      const n = 48;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      }
      w = this.ctx.createPeriodicWave(real, imag);
      this.pulses.set(duty, w);
    }
    return w;
  }

  private tone(
    wave: Wave,
    freq: number,
    t0: number,
    dur: number,
    gain: number,
    dest: AudioNode = this.sfx,
    attack = 0.005,
    release = 0.05,
    slideTo?: number,
  ): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    if (wave instanceof PeriodicWave) {
      osc.setPeriodicWave(wave);
    } else {
      osc.type = wave;
    }
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, Math.max(t0 + attack, t0 + dur - release));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noiseHit(
    t0: number,
    dur: number,
    gain: number,
    type: BiquadFilterType,
    freq: number,
    freqTo?: number,
    dest: AudioNode = this.sfx,
  ): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (freqTo) {
      filter.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.02);
  }

  private kick(t0: number, dest: AudioNode, gain: number): void {
    this.tone('sine', 150, t0, 0.13, gain, dest, 0.002, 0.1, 48);
  }

  private thump(t0: number, gain: number): void {
    this.tone('sine', 130, t0, 0.2, gain, this.sfx, 0.002, 0.15, 55);
    this.noiseHit(t0, 0.12, gain * 0.5, 'lowpass', 700);
  }

  private arpeggio(names: string[], t0: number, step: number, gain: number, wave: Wave): void {
    names.forEach((name, i) => this.tone(wave, noteFreq(name), t0 + i * step, step * 1.6, gain));
  }
}

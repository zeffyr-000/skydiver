/**
 * The soundtrack, as data: two short chiptune loops written in a compact
 * text score (pure; the synth plays them).
 *
 * A part is a string of tokens, one per sixteenth note (`|` bar lines are
 * ignored): a pitch like `E5`, `C#5`, `Bb4` starts a note, `.` holds the
 * previous one, `-` is a rest. Drums use `k` kick, `s` snare, `h` hat,
 * `x` kick + hat, `-` nothing.
 */

export interface Track {
  bpm: number;
  /** Delay of the off-beat sixteenths, as a fraction of a sixteenth (0 = straight). */
  swing: number;
  /** Pulse-wave duty of the lead (0.125 thin … 0.5 square). */
  leadDuty: number;
  lead: string;
  bass: string;
  drums: string;
}

/** A parsed note: when (in sixteenths), how long, and its frequency. */
export interface Note {
  step: number;
  length: number;
  freq: number;
}

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `C#5` → Hz (A4 = 440). */
export function noteFreq(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) {
    throw new Error(`bad note ${name}`);
  }
  const semi = SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = 12 * (Number(m[3]) + 1) + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function tokens(part: string): string[] {
  return part.split(/\s+/).filter((t) => t && t !== '|');
}

/** Parse a melodic part into notes. */
export function parsePart(part: string): { notes: Note[]; steps: number } {
  const toks = tokens(part);
  const notes: Note[] = [];
  toks.forEach((t, step) => {
    if (t === '.' || t === '-') {
      return;
    }
    let length = 1;
    while (toks[step + length] === '.') {
      length++;
    }
    notes.push({ step, length, freq: noteFreq(t) });
  });
  return { notes, steps: toks.length };
}

/** Parse a drum part into per-step hit lists. */
export function parseDrums(part: string): string[] {
  return tokens(part);
}

/**
 * Menu theme — a jaunty fairground rag in C (C | A7 | Dm | G7, twice), stride
 * bass and a brushed backbeat: the barnstormers are in town.
 */
export const MENU_THEME: Track = {
  bpm: 128,
  swing: 0.16,
  leadDuty: 0.25,
  lead: `
    E5 . G5 . C6 . . . A5 . G5 . E5 . . . | C#5 . E5 . A5 . . . G5 . E5 . C#5 . . . |
    D5 . F5 . A5 . . . C6 . A5 . F5 . . . | G5 . F5 . D5 . B4 . G4 . . . - - - - |
    E5 . G5 . C6 . . . D6 . C6 . A5 . . . | G5 . E5 . C#6 . . . A5 . . . - - - - |
    F#5 . A5 . D6 . C6 . B5 . G5 . F5 . D5 . | C6 . . . G5 . E5 . C5 . . . - - - -`,
  bass: `
    C3 . - - G2 . - - C3 . - - G2 . - - | A2 . - - E2 . - - A2 . - - E2 . - - |
    D3 . - - A2 . - - D3 . - - A2 . - - | G2 . - - D3 . - - G2 . - - B2 . - - |
    C3 . - - G2 . - - C3 . - - G2 . - - | A2 . - - E2 . - - A2 . - - C#3 . - - |
    D3 . - - A2 . - - G2 . - - D3 . - - | C3 . - - G2 . - - C3 . - - - - - -`,
  drums: `
    x - h - s - h - x - h - s - h h | x - h - s - h - x - h - s - h - |
    x - h - s - h - x - h - s - h h | x - h - s - h - x - s - s - s s |
    x - h - s - h - x - h - s - h h | x - h - s - h - x - h - s - h - |
    x - h - s - h - x - h - s - h h | x - h - s - h - k - - - - - - -`,
};

/**
 * Flight theme — airy and unhurried in F (F | Dm | Bb | C), a thin lead over
 * rolling arpeggios, no drums: it sits under the wind.
 */
export const FLIGHT_THEME: Track = {
  bpm: 96,
  swing: 0,
  leadDuty: 0.125,
  lead: `
    A5 . . . C6 . . . A5 . G5 . F5 . . . | D5 . . . F5 . . . A5 . . . - - - - |
    Bb5 . . . A5 . . . G5 . F5 . D5 . . . | E5 . . . G5 . . . C6 . . . - - - - |
    A5 . C6 . F6 . . . E6 . C6 . A5 . . . | D6 . . . C6 . A5 . F5 . . . - - - - |
    D6 . . . C6 . Bb5 . A5 . G5 . F5 . . . | G5 . . . E5 . . . C5 . . . - - - -`,
  bass: `
    F3 . A3 . C4 . A3 . F3 . A3 . C4 . A3 . | D3 . F3 . A3 . F3 . D3 . F3 . A3 . F3 . |
    Bb2 . D3 . F3 . D3 . Bb2 . D3 . F3 . D3 . | C3 . E3 . G3 . E3 . C3 . E3 . G3 . E3 . |
    F3 . A3 . C4 . A3 . F3 . A3 . C4 . A3 . | D3 . F3 . A3 . F3 . D3 . F3 . A3 . F3 . |
    Bb2 . D3 . F3 . D3 . Bb2 . D3 . F3 . D3 . | C3 . E3 . G3 . E3 . C3 . - - - - - - |`,
  drums: '',
};

import { FLIGHT_THEME, MENU_THEME, noteFreq, parseDrums, parsePart } from './music';

describe('music', () => {
  it('tunes notes to A440', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('A5')).toBeCloseTo(880);
    expect(noteFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteFreq('C#5')).toBeCloseTo(noteFreq('Db5'));
    expect(() => noteFreq('H2')).toThrow();
  });

  it('reads holds and rests into note lengths', () => {
    const { notes, steps } = parsePart('C4 . . - E4 | G4 .');
    expect(steps).toBe(7);
    expect(notes.map((n) => [n.step, n.length])).toEqual([
      [0, 3],
      [4, 1],
      [5, 2],
    ]);
  });

  it('every part of a theme loops on the same length (whole bars)', () => {
    for (const t of [MENU_THEME, FLIGHT_THEME]) {
      const lead = parsePart(t.lead).steps;
      expect(lead % 16).toBe(0);
      expect(parsePart(t.bass).steps).toBe(lead);
      if (t.drums) {
        expect(parseDrums(t.drums)).toHaveLength(lead);
      }
    }
  });
});

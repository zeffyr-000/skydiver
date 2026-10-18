import { EVENTS } from './engine/events';
import { planFromQuery } from './game';
import { viewportFor } from './viewport';

describe('planFromQuery', () => {
  const q = (s: string) => new URLSearchParams(s);
  const now = new Date(2026, 9, 18);

  it('flies a circuit event by id', () => {
    const plan = planFromQuery(q(`mode=circuit&event=${EVENTS[3].id}`), 'ace', now);
    expect(plan.mode).toBe('circuit');
    expect(plan.event?.id).toBe(EVENTS[3].id);
  });

  it('falls back to arcade for an unknown event or no mode', () => {
    expect(planFromQuery(q('mode=circuit&event=nope'), 'ace', now).mode).toBe('arcade');
    expect(planFromQuery(q(''), 'rookie', now).mode).toBe('arcade');
  });

  it('flies the day’s jump', () => {
    const plan = planFromQuery(q('mode=daily'), 'ace', now);
    expect(plan.mode).toBe('daily');
    expect(plan.day).toBe('2026-10-18');
  });
});

describe('viewportFor', () => {
  it('scales by a whole number and fills the window around 640×360', () => {
    expect(viewportFor(1920, 1080)).toEqual({ w: 640, h: 360, scale: 3 });
    expect(viewportFor(2560, 1440)).toEqual({ w: 640, h: 360, scale: 4 });
    expect(viewportFor(1280, 720)).toEqual({ w: 640, h: 360, scale: 2 });
    expect(viewportFor(1440, 900)).toEqual({ w: 720, h: 450, scale: 2 });
    expect(viewportFor(1024, 768)).toEqual({ w: 852, h: 480, scale: 1 });
    expect(viewportFor(300, 200).scale).toBe(1);
  });
});

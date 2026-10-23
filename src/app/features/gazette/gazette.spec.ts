import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import en from 'src/assets/i18n/gazette/en.json';
import fr from 'src/assets/i18n/gazette/fr.json';
import { EVENTS } from '../game/engine/events';
import { GazetteStore } from '../../shared/gazette.store';
import { drift } from './blocks/drift-calculator';
import { Gazette } from './gazette';
import { PLATES } from './gazette-plates';
import {
  FIGURES,
  GLOSSARY,
  HANDBILL_ACTS,
  issueOfDate,
  ISSUES,
  RATES,
  TIMELINE,
  type Issue,
} from './gazette.data';

interface Tree {
  [key: string]: string | Tree;
}

/** Every leaf key of a translation tree, dotted. */
function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : leaves(v, `${prefix}${k}.`),
  );
}

/** The keys an issue's text must hold, derived from its blocks. */
function issueKeys(issue: Issue): string[] {
  const keys = ['headline', 'standfirst', 'sources'];
  if (issue.id !== 'supplement') {
    keys.push('teaser');
  }
  if (issue.play) {
    keys.push('play.title', 'play.body');
  }
  for (const q of issue.quiz) {
    keys.push(...['q', 'a', 'b', 'c', 'why'].map((k) => `quiz.${q.id}.${k}`));
  }
  for (const b of issue.blocks) {
    if (b.kind === 'text') {
      keys.push(`text.${b.id}.head`, `text.${b.id}.body`);
    } else if (b.kind === 'quote') {
      keys.push(`quotes.${b.id}.text`, `quotes.${b.id}.who`);
    } else if (b.kind === 'aside') {
      keys.push(`asides.${b.id}`);
    } else if (b.kind === 'myth') {
      keys.push(`myths.${b.id}.claim`, `myths.${b.id}.verdict`);
    } else if (b.kind === 'geek') {
      keys.push(`geek.${b.id}.title`, `geek.${b.id}.body`);
      for (const s of b.specs ?? []) {
        keys.push(`geek.${b.id}.specs.${s}.label`, `geek.${b.id}.specs.${s}.value`);
      }
    }
  }
  return keys;
}

describe('Gazette content', () => {
  it('keeps English and French key-for-key in sync', () => {
    expect(leaves(fr as Tree).sort()).toEqual(leaves(en as Tree).sort());
  });

  it.each([
    ['en', en as Tree],
    ['fr', fr as Tree],
  ])(
    'holds exactly the %s text the issues ask for — nothing missing, nothing orphaned',
    (_, tree) => {
      const issues = tree['issues'] as Tree;
      expect(Object.keys(issues).sort()).toEqual(ISSUES.map((i) => i.id).sort());
      for (const issue of ISSUES) {
        expect(leaves(issues[issue.id] as Tree).sort(), issue.id).toEqual(issueKeys(issue).sort());
      }
      const plates = ISSUES.flatMap((i) =>
        i.blocks.flatMap((b) =>
          b.kind === 'plate' ? [`${b.plate}.caption`, `${b.plate}.credit`] : [],
        ),
      );
      expect(leaves(tree['plates'] as Tree).sort()).toEqual(plates.sort());
      expect(Object.keys(tree['timeline'] as Tree)).toEqual([...TIMELINE]);
      expect(Object.keys((tree['rates'] as Tree)['rows'] as Tree)).toEqual([...RATES]);
      expect(Object.keys((tree['handbill'] as Tree)['acts'] as Tree)).toEqual([...HANDBILL_ACTS]);
      const terms = (tree['glossary'] as Tree)['terms'] as Tree;
      expect(Object.keys(terms).sort()).toEqual(GLOSSARY.flatMap((g) => g.terms).sort());
      for (const f of FIGURES) {
        expect(terms[f.term], f.term).toBeDefined();
      }
    },
  );

  it('tells every date in exactly one issue, in timeline order', () => {
    const told = ISSUES.flatMap((i) => i.dates);
    expect(told.sort()).toEqual([...TIMELINE].sort());
    for (const issue of ISSUES) {
      const order = issue.dates.map((d) => TIMELINE.indexOf(d));
      expect(order, issue.id).toEqual([...order].sort((a, b) => a - b));
    }
    expect(issueOfDate('godefroy')?.id).toBe('nineteen');
  });

  it('uses every baked plate exactly once', () => {
    const used = ISSUES.flatMap((i) =>
      i.blocks.flatMap((b) => (b.kind === 'plate' ? [b.plate] : [])),
    );
    expect(used.sort()).toEqual(Object.keys(PLATES).sort());
  });

  it('ties issues only to events the game has', () => {
    for (const issue of ISSUES) {
      const play = issue.play;
      if (play && 'event' in play) {
        expect(
          EVENTS.some((e) => e.id === play.event),
          issue.id,
        ).toBe(true);
      }
    }
  });

  it('works out the drift as wind × time under a 6 m/s canopy', () => {
    expect(drift(5, 600)).toEqual({ seconds: 100, metres: 500 });
    expect(drift(0, 900).metres).toBe(0);
  });
});

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of<Translation>({
      common: { back: 'Back' },
      events: Object.fromEntries(EVENTS.map((e) => [e.id, { name: e.id }])),
    });
  }
}

describe('Gazette', () => {
  beforeEach(() => localStorage.clear());

  async function render(query: Record<string, string> = {}): Promise<ComponentFixture<Gazette>> {
    TestBed.configureTestingModule({
      imports: [Gazette],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
        provideTransloco({
          config: { availableLangs: ['en', 'fr'], defaultLang: 'en' },
          loader: StubLoader,
        }),
      ],
    });
    const fixture = TestBed.createComponent(Gazette);
    fixture.detectChanges();
    // The gazette scope is a lazy import: wait for its text to land.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(headline(fixture)).not.toBe('');
    });
    return fixture;
  }

  function headline(fixture: ComponentFixture<Gazette>): string {
    return fixture.nativeElement.querySelector('.issue__headline')?.textContent.trim() ?? '';
  }

  function click(fixture: ComponentFixture<Gazette>, selector: string, text: string): void {
    const buttons = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(selector));
    const button = buttons.find((b) => b.textContent?.includes(text));
    expect(button, text).toBeDefined();
    button?.click();
    fixture.detectChanges();
  }

  it('opens on issue No. 1, with its stories, plates and quiz', async () => {
    const fixture = await render();

    expect(headline(fixture)).toBe('The professors of the air');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.story__body').length).toBe(7);
    expect(el.querySelector('.plate__img')?.getAttribute('width')).toBe(
      String(PLATES['balloon-poster'].w * 2),
    );
    expect(el.querySelectorAll('.quiz__item').length).toBe(3);
  });

  it('reads on linearly: "Next issue" turns the page and marks the last one read', async () => {
    const fixture = await render();

    click(fixture, '.gazette__buttons button', 'Next issue');
    expect(headline(fixture)).toBe('The sky turned upside down');
    const store = TestBed.inject(GazetteStore);
    expect(store.read()).toEqual(['professors']);
    expect(store.last()).toBe('upside-down');
  });

  it('resumes at the issue last opened', async () => {
    localStorage.setItem('skydiver.gazette', JSON.stringify({ last: 'trade', read: [], quiz: {} }));
    const fixture = await render();

    expect(headline(fixture)).toBe("The parachutist's trade");
    expect(fixture.nativeElement.querySelector('app-drift-calculator')).toBeTruthy();
  });

  it('reveals a legend-or-fact verdict once the reader has guessed', async () => {
    const fixture = await render({ issue: 'upside-down' });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.myth__text')).toBeNull();
    click(fixture, '.myth__choices button', 'Fact');
    expect(el.querySelector('.myth__result')?.textContent).toContain('Missed!');
    expect(el.querySelector('.myth__text')?.textContent).toContain('Nesterov');
  });

  it('scores the quiz and keeps the best score', async () => {
    const fixture = await render();

    click(fixture, '.quiz__choices button', '$1,000');
    click(fixture, '.quiz__choices button', 'The Statue of Liberty');
    click(fixture, '.quiz__choices button', 'Ten years');
    expect(fixture.nativeElement.querySelector('.quiz__score')?.textContent).toContain(
      'Score: 2 out of 3',
    );
    expect(TestBed.inject(GazetteStore).quiz()).toEqual({ professors: 2 });
  });

  it("folds the buffs' sidebar open and shut", async () => {
    const fixture = await render({ issue: 'nineteen' });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.geek__specs')).toBeNull();
    click(fixture, '.geek button', 'Spec sheet');
    expect(el.querySelectorAll('.geek__specs tr').length).toBe(6);
    click(fixture, '.geek button', 'Spec sheet');
    expect(el.querySelector('.geek__specs')).toBeNull();
  });

  it('opens an issue from its date in the supplement', async () => {
    const fixture = await render({ issue: 'supplement' });

    click(fixture, '.dates button', 'No. 3');
    expect(headline(fixture)).toBe('1919, the mad year');
  });
});

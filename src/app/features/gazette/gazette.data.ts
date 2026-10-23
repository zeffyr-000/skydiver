import type { PlateId } from './gazette-plates';

/**
 * The Sky Gazette's structure: eight issues read in order, then a supplement.
 * An issue is a run of blocks — prose, period plates, pull quotes, "did you
 * know" boxes, technical sidebars, legend-or-fact cards, documents and toys —
 * followed by the issue's dates, a game tie-in and a quiz. Every word lives in
 * the lazily loaded `gazette` i18n scope (src/assets/i18n/gazette/*.json) under
 * `issues.<issue>.<branch>.<id>`; gazette.spec.ts keeps text and data in step.
 */

export type IssueId =
  | 'professors'
  | 'upside-down'
  | 'nineteen'
  | 'circuses'
  | 'queens'
  | 'trade'
  | 'meets'
  | 'curtain'
  | 'supplement';

export type MythAnswer = 'legend' | 'fact';
export type QuizAnswer = 'a' | 'b' | 'c';

export type Block =
  /** A titled run of paragraphs: `text.<id>.head` / `.body`. */
  | { readonly kind: 'text'; readonly id: string }
  /** A period photograph or document (caption and credit under `plates.<plate>`). */
  | { readonly kind: 'plate'; readonly plate: PlateId }
  /** A pull quote from the period: `quotes.<id>.text` / `.who`. */
  | { readonly kind: 'quote'; readonly id: string }
  /** A "did you know?" box: `asides.<id>`. */
  | { readonly kind: 'aside'; readonly id: string }
  /** "For the buffs": a folding sidebar with an optional spec table (`geek.<id>.specs.<key>`). */
  | { readonly kind: 'geek'; readonly id: string; readonly specs?: readonly string[] }
  /** Legend or fact? The reader guesses, then the card tells: `myths.<id>.claim` / `.verdict`. */
  | { readonly kind: 'myth'; readonly id: string; readonly answer: MythAnswer }
  /** A period document set in type (the Black Cats' rate card, a handbill). */
  | { readonly kind: 'doc'; readonly doc: 'rates' | 'handbill' }
  /** A toy: the wind-drift calculator or the aerobatic figures in flight. */
  | { readonly kind: 'widget'; readonly widget: 'drift' | 'figures' };

/** "In the game": an event of the Grand Tour, or another screen. */
export type PlayLink = { readonly event: string } | { readonly route: string };

export interface Issue {
  readonly id: IssueId;
  /** Shown in the masthead ("1797–1912"). */
  readonly years: string;
  readonly blocks: readonly Block[];
  /** Timeline keys told in this issue (`timeline.<key>`), oldest first. */
  readonly dates: readonly string[];
  /** Three questions (`quiz.<id>.q` / `.a` `.b` `.c` / `.why`) and their answers. */
  readonly quiz: readonly { readonly id: string; readonly answer: QuizAnswer }[];
  readonly play?: PlayLink;
}

export const ISSUES: readonly Issue[] = [
  {
    id: 'professors',
    years: '1797–1912',
    blocks: [
      { kind: 'text', id: 'garnerin' },
      { kind: 'text', id: 'baldwin' },
      { kind: 'plate', plate: 'balloon-poster' },
      { kind: 'text', id: 'fair' },
      { kind: 'quote', id: 'delmont' },
      {
        kind: 'geek',
        id: 'balloon',
        specs: ['height', 'release', 'fee1887', 'fee1897', 'career'],
      },
      { kind: 'text', id: 'danger' },
      { kind: 'aside', id: 'goats' },
      { kind: 'myth', id: 'freefall', answer: 'fact' },
      { kind: 'text', id: 'doll' },
      { kind: 'text', id: 'reichelt' },
      { kind: 'plate', plate: 'reichelt' },
      { kind: 'text', id: 'berry' },
    ],
    dates: ['garnerin', 'baldwin', 'broadwickFirst', 'law', 'reichelt', 'berry'],
    quiz: [
      { id: 'q1', answer: 'b' },
      { id: 'q2', answer: 'c' },
      { id: 'q3', answer: 'a' },
    ],
    play: { event: 'fair-balloon' },
  },
  {
    id: 'upside-down',
    years: '1913–1918',
    blocks: [
      { kind: 'text', id: 'jump' },
      { kind: 'plate', plate: 'pegoud-chateaufort' },
      { kind: 'text', id: 'inverted' },
      { kind: 'myth', id: 'firstLoop', answer: 'legend' },
      { kind: 'plate', plate: 'pegoud-ticket' },
      { kind: 'widget', widget: 'figures' },
      { kind: 'geek', id: 'loop' },
      { kind: 'text', id: 'beachey' },
      { kind: 'text', id: 'tiny' },
      { kind: 'plate', plate: 'broadwick' },
      { kind: 'text', id: 'war' },
      { kind: 'aside', id: 'immelmann' },
    ],
    dates: [
      'broadwickPlane',
      'pegoudJump',
      'nesterov',
      'pegoudLoop',
      'broadwickFreefall',
      'beacheyDeath',
      'stinson',
    ],
    quiz: [
      { id: 'q1', answer: 'a' },
      { id: 'q2', answer: 'b' },
      { id: 'q3', answer: 'c' },
    ],
    play: { event: 'fair-hoops' },
  },
  {
    id: 'nineteen',
    years: '1918–1919',
    blocks: [
      { kind: 'text', id: 'surplus' },
      { kind: 'plate', plate: 'souther-field' },
      {
        kind: 'geek',
        id: 'jenny',
        specs: ['span', 'engine', 'speed', 'landing', 'endurance', 'price'],
      },
      { kind: 'plate', plate: 'inverted-jenny' },
      { kind: 'aside', id: 'stamp' },
      { kind: 'text', id: 'vedrines' },
      { kind: 'plate', plate: 'vedrines-roof' },
      { kind: 'text', id: 'godefroy' },
      { kind: 'plate', plate: 'godefroy-arc' },
      { kind: 'myth', id: 'arc', answer: 'legend' },
      { kind: 'text', id: 'irvin' },
      { kind: 'plate', plate: 'irvin-patent' },
      { kind: 'aside', id: 'smith' },
      { kind: 'text', id: 'locklear' },
      { kind: 'plate', plate: 'locklear-ladder' },
    ],
    dates: ['codyWing', 'airmail', 'locklearFirst', 'vedrines', 'irvin', 'godefroy'],
    quiz: [
      { id: 'q1', answer: 'a' },
      { id: 'q2', answer: 'c' },
      { id: 'q3', answer: 'b' },
    ],
    play: { event: 'sea-low' },
  },
  {
    id: 'circuses',
    years: '1920–1927',
    blocks: [
      { kind: 'text', id: 'ritual' },
      { kind: 'plate', plate: 'cody-transfer' },
      { kind: 'text', id: 'life' },
      { kind: 'quote', id: 'woods' },
      { kind: 'doc', doc: 'handbill' },
      { kind: 'text', id: 'gates' },
      { kind: 'myth', id: 'million', answer: 'fact' },
      { kind: 'text', id: 'gordon' },
      { kind: 'aside', id: 'willard' },
      { kind: 'text', id: 'lindbergh' },
      { kind: 'myth', id: 'lindbergh', answer: 'legend' },
      {
        kind: 'geek',
        id: 'books',
        specs: ['jenny', 'engine', 'ride', 'record', 'lindbergh'],
      },
      { kind: 'aside', id: 'mayse' },
    ],
    dates: ['gates', 'lindberghLincoln', 'lindberghJenny', 'gordon', 'teterboro'],
    quiz: [
      { id: 'q1', answer: 'a' },
      { id: 'q2', answer: 'b' },
      { id: 'q3', answer: 'a' },
    ],
    play: { event: 'meet-show' },
  },
  {
    id: 'queens',
    years: '1920–1928',
    blocks: [
      { kind: 'text', id: 'boyer' },
      { kind: 'plate', plate: 'boyer-breakaway' },
      { kind: 'geek', id: 'transfer', specs: ['speed', 'ladder', 'boyer', 'cody'] },
      { kind: 'text', id: 'roy' },
      { kind: 'quote', id: 'roy' },
      { kind: 'myth', id: 'tennis', answer: 'legend' },
      { kind: 'text', id: 'troupe' },
      { kind: 'text', id: 'omlie' },
      { kind: 'text', id: 'coleman' },
      { kind: 'plate', plate: 'coleman' },
      { kind: 'myth', id: 'french', answer: 'fact' },
      { kind: 'text', id: 'bolland' },
      { kind: 'plate', plate: 'bolland' },
      { kind: 'aside', id: 'snook' },
    ],
    dates: [
      'bolland',
      'colemanLicence',
      'colemanShow',
      'tennis',
      'colemanDeath',
      'royDeath',
      'boyerLast',
    ],
    quiz: [
      { id: 'q1', answer: 'c' },
      { id: 'q2', answer: 'a' },
      { id: 'q3', answer: 'b' },
    ],
    play: { event: 'field-wagon' },
  },
  {
    id: 'trade',
    years: '1919–1925',
    blocks: [
      { kind: 'text', id: 'canopy' },
      { kind: 'text', id: 'potomac' },
      { kind: 'quote', id: 'post' },
      { kind: 'widget', widget: 'drift' },
      { kind: 'geek', id: 'drift', specs: ['canopy', 'descent', 'ors', 'rule'] },
      { kind: 'text', id: 'exit' },
      { kind: 'plate', plate: 'hendon-1930' },
      { kind: 'text', id: 'double' },
      { kind: 'text', id: 'caterpillar' },
      { kind: 'aside', id: 'pin' },
      { kind: 'text', id: 'collin' },
      { kind: 'text', id: 'hilsz' },
      { kind: 'plate', plate: 'hilsz' },
      { kind: 'aside', id: 'tree' },
      { kind: 'text', id: 'crane' },
      { kind: 'myth', id: 'blackout', answer: 'legend' },
    ],
    dates: ['potomac', 'harris', 'collin', 'hilsz', 'crane'],
    quiz: [
      { id: 'q1', answer: 'b' },
      { id: 'q2', answer: 'a' },
      { id: 'q3', answer: 'c' },
    ],
    play: { event: 'sea-breeze' },
  },
  {
    id: 'meets',
    years: '1920–1934',
    blocks: [
      { kind: 'text', id: 'buc' },
      { kind: 'plate', plate: 'buc-1920' },
      { kind: 'text', id: 'crowds' },
      { kind: 'text', id: 'fronval' },
      { kind: 'plate', plate: 'fronval' },
      { kind: 'myth', id: 'fronval', answer: 'legend' },
      { kind: 'text', id: 'duel' },
      { kind: 'plate', plate: 'doret' },
      { kind: 'aside', id: 'udet' },
      { kind: 'geek', id: 'caudron', specs: ['span', 'engine', 'speed', 'weight', 'endurance'] },
      { kind: 'text', id: 'women' },
    ],
    dates: ['fronval962', 'buc', 'vincennes', 'dubendorf', 'fronval1111', 'bron', 'bastie'],
    quiz: [
      { id: 'q1', answer: 'b' },
      { id: 'q2', answer: 'a' },
      { id: 'q3', answer: 'c' },
    ],
    play: { event: 'meet-grand-prix' },
  },
  {
    id: 'curtain',
    years: '1920–1936',
    blocks: [
      { kind: 'text', id: 'skywayman' },
      { kind: 'text', id: 'cats' },
      { kind: 'plate', plate: 'ingle-change' },
      { kind: 'doc', doc: 'rates' },
      { kind: 'myth', id: 'letters', answer: 'fact' },
      { kind: 'text', id: 'movies' },
      { kind: 'aside', id: 'perry' },
      { kind: 'text', id: 'rules' },
      { kind: 'quote', id: 'courier' },
      { kind: 'myth', id: 'orville', answer: 'legend' },
      { kind: 'text', id: 'end' },
      { kind: 'text', id: 'legacy' },
    ],
    dates: [
      'locklearDeath',
      'blackCats',
      'airCommerceAct',
      'licenceOne',
      'lindberghParis',
      'wings',
      'gatesEnd',
      'hellsAngels',
      'union',
      'ban',
    ],
    quiz: [
      { id: 'q1', answer: 'a' },
      { id: 'q2', answer: 'c' },
      { id: 'q3', answer: 'b' },
    ],
    play: { route: '/game?mode=daily' },
  },
  { id: 'supplement', years: '1797–1936', blocks: [], dates: [], quiz: [] },
];

/** The Black Cats' rate card, cheapest first (`rates.<key>.label` / `.price`). */
export const RATES: readonly string[] = [
  'planeChange',
  'inverted',
  'jump',
  'wingLoop',
  'upsideChange',
  'explode',
];

/** The reconstructed handbill's billed acts (`handbill.acts.<key>`). */
export const HANDBILL_ACTS: readonly string[] = ['a1', 'a2', 'a3', 'a4'];

/** The whole chronology, oldest first — each key is told in exactly one issue. */
export const TIMELINE: readonly string[] = [
  'garnerin',
  'baldwin',
  'broadwickFirst',
  'codyWing',
  'law',
  'reichelt',
  'berry',
  'broadwickPlane',
  'pegoudJump',
  'nesterov',
  'pegoudLoop',
  'broadwickFreefall',
  'beacheyDeath',
  'stinson',
  'airmail',
  'locklearFirst',
  'vedrines',
  'irvin',
  'godefroy',
  'potomac',
  'fronval962',
  'locklearDeath',
  'buc',
  'bolland',
  'colemanLicence',
  'gates',
  'lindberghLincoln',
  'colemanShow',
  'harris',
  'lindberghJenny',
  'collin',
  'gordon',
  'hilsz',
  'blackCats',
  'vincennes',
  'crane',
  'tennis',
  'colemanDeath',
  'airCommerceAct',
  'licenceOne',
  'lindberghParis',
  'royDeath',
  'teterboro',
  'dubendorf',
  'wings',
  'fronval1111',
  'bron',
  'boyerLast',
  'gatesEnd',
  'bastie',
  'hellsAngels',
  'union',
  'ban',
];

/** The glossary, by theme (`glossary.groups.<group>`, `glossary.terms.<key>.term` / `.def`). */
export const GLOSSARY: readonly { group: string; terms: readonly string[] }[] = [
  {
    group: 'trade',
    terms: [
      'barnstormer',
      'flyingCircus',
      'joyride',
      'handbill',
      'wingWalking',
      'planeChange',
      'meeting',
      'ace',
    ],
  },
  {
    group: 'chute',
    terms: [
      'hitTheSilk',
      'ripcord',
      'staticLine',
      'pilotChute',
      'canopy',
      'doubleDrop',
      'delayedOpening',
      'spotLanding',
      'spot',
      'caterpillar',
    ],
  },
  {
    group: 'voltige',
    terms: [
      'loop',
      'inverted',
      'roll',
      'snapRoll',
      'spin',
      'fallingLeaf',
      'chandelle',
      'stallTurn',
      'immelmann',
      'splitS',
      'pullOut',
    ],
  },
  {
    group: 'machine',
    terms: [
      'jenny',
      'canuck',
      'ox5',
      'castorOil',
      'dope',
      'contact',
      'stick',
      'rudderBar',
      'groundLoop',
      'noseOver',
      'windsock',
      'zinc',
    ],
  },
];

/**
 * The figures the "figures in flight" toy can fly, seen side-on in a 320×160
 * box (x right, y down, ground at 150): the plane's path, named by the
 * glossary term that explains it.
 */
export const FIGURES: readonly { term: string; path: string }[] = [
  { term: 'loop', path: 'M10 128 H140 A44 44 0 0 0 140 40 A44 44 0 0 0 140 128 H310' },
  { term: 'immelmann', path: 'M10 132 H150 A46 46 0 0 0 150 40 H10' },
  { term: 'splitS', path: 'M10 40 H150 A46 46 0 0 1 150 132 H10' },
  { term: 'stallTurn', path: 'M10 132 H130 Q160 132 160 102 V28 V102 Q160 132 130 132 H10' },
  {
    term: 'spin',
    path: 'M10 28 H110 L136 40 L114 54 L136 68 L114 82 L136 96 L114 110 Q126 136 160 136 H310',
  },
  {
    term: 'fallingLeaf',
    path: 'M10 28 H96 Q150 40 166 56 Q118 70 100 82 Q150 94 166 108 Q130 120 150 136 H310',
  },
];

export function issueIndex(id: string | null | undefined): number {
  return ISSUES.findIndex((i) => i.id === id);
}

/** The issue that tells a timeline date (the supplement links each date to it). */
export function issueOfDate(key: string): Issue | undefined {
  return ISSUES.find((i) => i.dates.includes(key));
}

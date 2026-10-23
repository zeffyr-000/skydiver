import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { provideTranslocoScope, TranslocoPipe } from '@jsverse/transloco';
import { GazetteStore } from '../../shared/gazette.store';
import { TransitionService } from '../../shared/transition.service';
import { PixelButton, PixelPanel } from '../../ui';
import { WorldBackdrop } from '../game/backdrop/world-backdrop';
import { issueIndex, ISSUES, type IssueId } from './gazette.data';
import { GazetteIssue } from './issue/gazette-issue';

/** Scrolled this far through an issue, it counts as read. */
const READ_AT = 0.95;

/**
 * The Sky Gazette: a period paper about the 1920s flying daredevils, read one
 * issue after the other. The masthead and the row of issue numbers sit on top,
 * a thin bar tracks the reading, and every issue ends on "in the next issue"
 * and a button to turn to it. Reading resumes at the last issue opened.
 */
@Component({
  selector: 'app-gazette',
  templateUrl: './gazette.html',
  styleUrl: './gazette.scss',
  imports: [TranslocoPipe, PixelButton, PixelPanel, WorldBackdrop, GazetteIssue],
  providers: [
    // Some 90 kB of text per language: a scope of its own, bundled in this
    // screen's lazy chunk rather than in the main translations.
    provideTranslocoScope({
      scope: 'gazette',
      loader: {
        en: () => import('src/assets/i18n/gazette/en.json'),
        fr: () => import('src/assets/i18n/gazette/fr.json'),
      },
    }),
  ],
  host: {
    '(document:keydown.escape)': 'goBack()',
    '(window:scroll)': 'onScroll()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Gazette {
  private readonly transition = inject(TransitionService);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly store = inject(GazetteStore);

  protected readonly issues = ISSUES;
  /** `?issue=<id>` opens one directly; otherwise reading resumes where it stopped. */
  protected readonly index = signal(
    Math.max(
      0,
      issueIndex(inject(ActivatedRoute).snapshot.queryParamMap.get('issue') ?? this.store.last()),
    ),
  );
  protected readonly issue = computed(() => ISSUES[this.index()]);
  protected readonly last = ISSUES.length - 1;
  /** How far down the page the reader is, 0–1. */
  protected readonly progress = signal(0);

  constructor() {
    this.store.open(this.issue().id);
  }

  /** Turn to another issue: back to the top, focus on its standfirst. */
  go(index: number): void {
    if (index < 0 || index > this.last || index === this.index()) {
      return;
    }
    if (index > this.index()) {
      this.store.markRead(this.issue().id);
    }
    this.index.set(index);
    this.store.open(this.issue().id);
    this.scroller().scrollTop = 0;
    this.progress.set(0);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>('.issue__standfirst')
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  open(id: IssueId): void {
    this.go(issueIndex(id));
  }

  goBack(): void {
    this.transition.navigate('/');
  }

  onBack(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.goBack();
  }

  protected onScroll(): void {
    const root = this.scroller();
    const room = root.scrollHeight - root.clientHeight;
    const progress = room > 0 ? Math.min(1, root.scrollTop / room) : 1;
    this.progress.set(progress);
    if (progress >= READ_AT) {
      this.store.markRead(this.issue().id);
    }
  }

  private scroller(): Element {
    return this.document.scrollingElement ?? this.document.documentElement;
  }
}

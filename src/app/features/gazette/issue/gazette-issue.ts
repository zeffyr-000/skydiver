import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProgressStore } from '../../../shared/progress.store';
import { TransitionService } from '../../../shared/transition.service';
import { PixelButton } from '../../../ui';
import { DriftCalculator } from '../blocks/drift-calculator';
import { FigureFlyer } from '../blocks/figure-flyer';
import { GazetteDocument } from '../blocks/gazette-document';
import { IssueQuiz } from '../blocks/issue-quiz';
import { MythCard } from '../blocks/myth-card';
import { PLATES } from '../gazette-plates';
import { GLOSSARY, issueOfDate, ISSUES, TIMELINE, type Issue, type IssueId } from '../gazette.data';
import { ParagraphsPipe } from '../paragraphs.pipe';
import { ReadingBlock } from '../reading-block.directive';

/**
 * One issue of the Gazette, top to bottom: headline and standfirst, "in this
 * issue", the run of blocks, then the issue's dates, its game tie-in, its quiz
 * and its sources. The supplement swaps the blocks for the glossary and the
 * whole timeline, each date opening the issue that tells it.
 */
@Component({
  selector: 'app-gazette-issue',
  templateUrl: './gazette-issue.html',
  styleUrl: './gazette-issue.scss',
  imports: [
    TranslocoPipe,
    PixelButton,
    ParagraphsPipe,
    ReadingBlock,
    MythCard,
    IssueQuiz,
    DriftCalculator,
    FigureFlyer,
    GazetteDocument,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GazetteIssue {
  private readonly progress = inject(ProgressStore);
  private readonly transition = inject(TransitionService);

  readonly issue = input.required<Issue>();
  /** An issue to open (from the supplement's timeline). */
  readonly open = output<IssueId>();

  protected readonly plates = PLATES;
  protected readonly glossary = GLOSSARY;
  protected readonly key = computed(() => `gazette.issues.${this.issue().id}`);
  protected readonly isSupplement = computed(() => this.issue().id === 'supplement');
  /** The stories' heads, for "in this issue". */
  protected readonly stories = computed(() =>
    this.issue().blocks.flatMap((b) => (b.kind === 'text' ? [b.id] : [])),
  );
  /** Folded open "for the buffs" sidebars — all folded again on a new issue. */
  protected readonly unfolded = linkedSignal<Issue, ReadonlySet<string>>({
    source: this.issue,
    computation: () => new Set(),
  });
  protected readonly timeline = TIMELINE.map((key) => {
    const issue = issueOfDate(key);
    return { key, issue: issue?.id, n: issue ? ISSUES.indexOf(issue) + 1 : 0 };
  });

  /** The tie-in's target: its event (open, or the Grand Tour while locked) or its screen. */
  protected readonly play = computed(() => {
    const play = this.issue().play;
    if (!play) {
      return null;
    }
    if ('route' in play) {
      return { url: play.route, event: null, locked: false };
    }
    const locked = !this.progress.isUnlocked(play.event);
    return {
      url: locked ? '/circuit' : `/game?mode=circuit&event=${play.event}`,
      event: play.event,
      locked,
    };
  });

  protected toggle(id: string): void {
    this.unfolded.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected go(url: string): void {
    this.transition.navigate(url);
  }
}

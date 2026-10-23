import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GazetteStore } from '../../../shared/gazette.store';
import { PixelButton } from '../../../ui';
import type { Issue, QuizAnswer } from '../gazette.data';
import { ReadingBlock } from '../reading-block.directive';

const CHOICES: readonly QuizAnswer[] = ['a', 'b', 'c'];

/**
 * The issue's three questions. Each answer is final: the right one lights up
 * in brass, a wrong pick in red, and the explanation follows. Once all three
 * are answered the reader gets a score, a period rank, and the store keeps the
 * best score per issue.
 */
@Component({
  selector: 'app-issue-quiz',
  templateUrl: './issue-quiz.html',
  styleUrl: './issue-quiz.scss',
  imports: [TranslocoPipe, PixelButton, ReadingBlock],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueQuiz {
  private readonly store = inject(GazetteStore);

  readonly issue = input.required<Issue>();

  protected readonly choices = CHOICES;
  protected readonly base = computed(() => `gazette.issues.${this.issue().id}.quiz`);
  /** Picks so far, by question id — cleared when the issue changes. */
  protected readonly picks = linkedSignal<Issue, Record<string, QuizAnswer>>({
    source: this.issue,
    computation: () => ({}),
  });
  protected readonly done = computed(
    () => Object.keys(this.picks()).length === this.issue().quiz.length,
  );
  protected readonly score = computed(
    () => this.issue().quiz.filter((q) => this.picks()[q.id] === q.answer).length,
  );

  protected pick(question: string, choice: QuizAnswer): void {
    if (this.picks()[question]) {
      return; // answers are final
    }
    this.picks.update((picks) => ({ ...picks, [question]: choice }));
    if (this.done()) {
      this.store.saveQuiz(this.issue().id, this.score());
    }
  }

  protected variant(question: { id: string; answer: QuizAnswer }, choice: QuizAnswer) {
    const picked = this.picks()[question.id];
    if (!picked) {
      return 'default';
    }
    if (choice === question.answer) {
      return 'brass';
    }
    return choice === picked ? 'primary' : 'default';
  }
}

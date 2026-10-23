import { Pipe, PipeTransform } from '@angular/core';

/** Splits a translated text on blank lines, so translators write paragraphs as prose. */
@Pipe({ name: 'paragraphs' })
export class ParagraphsPipe implements PipeTransform {
  transform(text: string | null | undefined): string[] {
    return (text ?? '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
}

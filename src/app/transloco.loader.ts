import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

import en from 'src/assets/i18n/en.json';
import fr from 'src/assets/i18n/fr.json';

/**
 * Resolves translations from statically bundled JSON — there is no backend and
 * no HTTP request. Each language is imported at build time and looked up by code.
 * Adding a language: import its JSON and add it to the `translations` map.
 */
@Injectable({ providedIn: 'root' })
export class TranslocoStaticLoader implements TranslocoLoader {
  private readonly translations: Record<string, Translation> = {
    en: en,
    fr: fr,
  };

  getTranslation(lang: string) {
    return Promise.resolve(this.translations[lang] ?? this.translations['en']);
  }
}

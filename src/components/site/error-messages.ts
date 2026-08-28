/**
 * Client-safe accessor for localized error-boundary copy.
 *
 * Error boundaries (`error.tsx` / `global-error.tsx`) must be Client
 * Components, which cannot read the server-side `getDictionary()` registry.
 * Rather than maintaining a second, hand-copied translation source, this
 * module statically imports the canonical `config/i18n/<locale>.json`
 * dictionaries (the same single source the server registry validates), so the
 * copy an error boundary shows can never drift from what adopters edit in
 * `config/i18n/`.
 *
 * Only the `error` block is exposed here (a deliberately minimal, four-string
 * surface) to keep the client bundle tiny while staying canonical.
 */
import de from "../../../config/i18n/de.json";
import en from "../../../config/i18n/en.json";
import es from "../../../config/i18n/es.json";
import fr from "../../../config/i18n/fr.json";
import id from "../../../config/i18n/id.json";
import ja from "../../../config/i18n/ja.json";
import ko from "../../../config/i18n/ko.json";
import zh from "../../../config/i18n/zh.json";

/** Localized copy shown by an error boundary, sourced from the canonical dictionaries. */
export interface ErrorMessages {
  readonly title: string;
  readonly message: string;
  readonly tryAgain: string;
  readonly returnHome: string;
}

/** Default locale used when a requested locale has no entry (matches the server registry). */
const DEFAULT_LOCALE = "en";

const byLocale: Readonly<Record<string, ErrorMessages>> = {
  de: de.error,
  en: en.error,
  es: es.error,
  fr: fr.error,
  id: id.error,
  ja: ja.error,
  ko: ko.error,
  zh: zh.error,
};

/** Every locale shipped in this project, for test-coverage assertions. */
export const supportedErrorLocales: readonly string[] = Object.keys(byLocale);

/**
 * Returns the localized `error` copy for a locale, falling back to the default
 * locale when the requested one is unknown.
 */
export function getErrorMessages(locale?: string | null): ErrorMessages {
  if (locale && locale in byLocale) {
    return byLocale[locale];
  }
  return byLocale[DEFAULT_LOCALE];
}

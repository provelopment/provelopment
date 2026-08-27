import de from "../../../config/i18n/de.json";
import en from "../../../config/i18n/en.json";
import es from "../../../config/i18n/es.json";
import fr from "../../../config/i18n/fr.json";
import id from "../../../config/i18n/id.json";
import ja from "../../../config/i18n/ja.json";
import ko from "../../../config/i18n/ko.json";
import zh from "../../../config/i18n/zh.json";

import { dictionarySchema, type Dictionary } from "./dictionary";
import type { Locale } from "@/core/locale";
import { siteConfig } from "../loader";

/**
 * Validates a raw locale dictionary against the schema and returns it.
 * Throws a descriptive error listing every problem so malformed edits fail
 * fast (at build/test time) rather than silently at runtime.
 */
function parseDictionary(raw: unknown): Dictionary {
  const result = dictionarySchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid dictionary:\n${details}`);
  }

  return result.data;
}

const dictionaries: Readonly<Record<string, Dictionary>> = {
  de: parseDictionary(de),
  en: parseDictionary(en),
  es: parseDictionary(es),
  fr: parseDictionary(fr),
  id: parseDictionary(id),
  ja: parseDictionary(ja),
  ko: parseDictionary(ko),
  zh: parseDictionary(zh),
};

/**
 * Returns the dictionary for a locale, falling back to the default
 * locale's dictionary when a translation has not been authored yet.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[siteConfig.defaultLocale];
}
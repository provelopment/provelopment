import { en } from "./en";
import type { Dictionary } from "./dictionary";
import type { Locale } from "@/core/locale";
import { siteConfig } from "../loader";

const dictionaries: Readonly<Record<string, Dictionary>> = { en };

/**
 * Returns the dictionary for a locale, falling back to the default
 * locale's dictionary when a translation has not been authored yet.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[siteConfig.defaultLocale];
}
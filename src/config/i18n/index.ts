import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { id } from "./id";
import { ja } from "./ja";
import { ko } from "./ko";
import { zh } from "./zh";
import type { Dictionary } from "./dictionary";
import type { Locale } from "@/core/locale";
import { siteConfig } from "../loader";

const dictionaries: Readonly<Record<string, Dictionary>> = {
  de,
  en,
  es,
  fr,
  id,
  ja,
  ko,
  zh,
};

/**
 * Returns the dictionary for a locale, falling back to the default
 * locale's dictionary when a translation has not been authored yet.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[siteConfig.defaultLocale];
}
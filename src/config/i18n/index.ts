import path from "node:path";

import type { Locale } from "@/core/locale";

import { siteConfig } from "../loader";
import type { Dictionary } from "./dictionary";
import { loadDictionaryRegistry } from "./registry";

const dictionaryDirectory = path.join(process.cwd(), "config", "i18n");

// Built once at module load (build time). Discovery is data-driven: the set of
// available dictionaries comes from the `config/i18n/` directory (validated
// against the Zod dictionary schema and against the locales enabled in
// `site.config.json`). Adding a locale is a config/data edit — never a change
// to `src/` registration code.
const registry = loadDictionaryRegistry({
  directory: dictionaryDirectory,
  declaredLocales: siteConfig.locales.map((locale) => locale.code),
  defaultLocale: siteConfig.defaultLocale,
});

/**
 * Returns the dictionary for a locale, falling back to the default locale's
 * dictionary only when the requested locale is not configured. Every configured
 * locale is guaranteed (at registry load) to have a validated dictionary.
 */
export function getDictionary(locale: Locale): Dictionary {
  return registry.get(locale);
}
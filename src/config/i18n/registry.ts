import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Locale } from "@/core/locale";

import { dictionarySchema, type Dictionary } from "./dictionary";

/** Well-formed locale code (e.g. `en`, `pt-BR`, `zh-Hans`). */
const localeNamePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export interface DictionaryRegistry {
  /** Returns the dictionary for a locale, falling back to the default locale. */
  get(locale: Locale): Dictionary;
}

export interface LoadDictionaryRegistryOptions {
  /** Directory containing one `<locale>.json` dictionary per supported locale. */
  readonly directory: string;
  /** Every locale enabled in `site.config.json`; each must have a dictionary file. */
  readonly declaredLocales: readonly string[];
  /** Default locale used when a requested locale has no dictionary. */
  readonly defaultLocale: string;
}

interface FileProblem {
  readonly file: string;
  readonly reason: string;
}

/**
 * Loads and validates every `*.json` dictionary in `directory` and verifies
 * that every locale declared in `site.config.json` has a matching file.
 *
 * Locale discovery is **data-driven**: the set of dictionaries comes from the
 * filesystem, never from a hard-coded TypeScript import list. An adopter adds a
 * locale by adding `config/i18n/<code>.json` (and registering it in
 * `site.config.json`) — no `src/` code change is required.
 *
 * Failures are loud and actionable:
 *  - a file that is not valid JSON, or that fails the Zod dictionary schema, is
 *    reported by filename with the exact issues (never silently skipped);
 *  - a configured locale with no dictionary file is reported as a build error.
 * Only locales that are NOT configured fall back to the default locale.
 */
export function loadDictionaryRegistry(options: LoadDictionaryRegistryOptions): DictionaryRegistry {
  let entries: string[];
  try {
    entries = readdirSync(options.directory)
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch {
    throw new Error(
      `Unable to read i18n directory "${options.directory}". ` +
        "Expected it to contain one config/i18n/<locale>.json per supported locale.",
    );
  }

  const byLocale = new Map<string, Dictionary>();
  const problems: FileProblem[] = [];

  for (const file of entries) {
    const locale = path.basename(file, ".json");
    if (!localeNamePattern.test(locale)) {
      continue; // not a recognized locale filename; ignore rather than fail
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path.join(options.directory, file), "utf8"));
    } catch {
      problems.push({ file, reason: "file is not valid JSON" });
      continue;
    }

    const result = dictionarySchema.safeParse(raw);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      problems.push({ file, reason: `fails the dictionary schema:\n${details}` });
      continue;
    }

    byLocale.set(locale, result.data);
  }

  if (problems.length > 0) {
    const details = problems
      .map((problem) => `  - ${problem.file}: ${problem.reason}`)
      .join("\n");
    throw new Error(`Invalid i18n dictionary data:\n${details}`);
  }

  const missing = options.declaredLocales.filter((locale) => !byLocale.has(locale));
  if (missing.length > 0) {
    throw new Error(
      `Configured locale(s) have no dictionary file: ${missing.join(", ")}.\n` +
        `Add a config/i18n/<locale>.json for each and make it match the shape of the existing dictionaries.`,
    );
  }

  if (!byLocale.has(options.defaultLocale)) {
    throw new Error(
      `Default locale "${options.defaultLocale}" has no dictionary file. ` +
        "A default locale dictionary is required for fallback.",
    );
  }

  return {
    get(locale: Locale): Dictionary {
      return byLocale.get(locale) ?? byLocale.get(options.defaultLocale)!;
    },
  };
}
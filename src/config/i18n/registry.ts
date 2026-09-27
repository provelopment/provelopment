import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Locale } from "@/core/locale";
import { LOCALE_PATTERN } from "@/core/locale";

import {
  dictionaryOverrideSchema,
  dictionarySchema,
  mergeDictionaryOverride,
  type Dictionary,
} from "./dictionary";

/**
 * Well-formed locale code — the ONE contract (`@/core/locale`), imported rather than
 * restated so dictionary discovery can never accept a locale the rest of the platform
 * refuses (`en`, `pt-BR`, `zh-Hans`, `en-CA`).
 */
const localeNamePattern = LOCALE_PATTERN;

export interface DictionaryRegistry {
  /**
   * Returns the EFFECTIVE dictionary for a locale — the shared dictionary for that locale, with
   * S1E2 site+locale overrides applied when a `siteCode` is given and that site has an override.
   * Falls back to the default locale's shared dictionary for a locale that is not configured.
   */
  get(locale: Locale, siteCode?: string): Dictionary;
  /** Returns every loaded SHARED dictionary keyed by locale code (no overrides, no fallback). */
  all(): ReadonlyMap<string, Dictionary>;
  /** Returns every effective site+locale override, keyed `"<site>/<locale>"` (S1E2). */
  overrides(): ReadonlyMap<string, Dictionary>;
}

/** S1E2 — one site whose locale overrides may exist: its code, and the locales it serves. */
export interface DictionarySiteScope {
  readonly code: string;
  /** The site's locale PATH KEYS — an override outside this set is refused. */
  readonly locales: readonly string[];
}

export interface LoadDictionaryRegistryOptions {
  /** Directory containing one `<locale>.json` dictionary per supported locale. */
  readonly directory: string;
  /**
   * S1E2 — directory containing the OPTIONAL `<site>/<locale>.json` overrides. Absent → no
   * overrides are loaded at all (the deployment has no `sites/` folder to declare any).
   */
  readonly overrideDirectory?: string | undefined;
  /** Every locale enabled in `site.config.json`; each must have a dictionary file. */
  readonly declaredLocales: readonly string[];
  /** Default locale used when a requested locale has no dictionary. */
  readonly defaultLocale: string;
  /**
   * The deployment's sites, so an override can be checked against a real site and locale.
   * Absent → an override folder would be refused (no site could own it) rather than ignored.
   */
  readonly sites?: readonly DictionarySiteScope[] | undefined;
}

interface FileProblem {
  readonly file: string;
  readonly reason: string;
}

/** One actionable line per problem, used by every dictionary failure message. */
function formatProblems(problems: readonly FileProblem[]): string {
  return problems.map((problem) => `  - ${problem.file}: ${problem.reason}`).join("\n");
}

/** One actionable line per Zod issue. */
function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
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
 *
 * S1E2 — after the shared dictionaries are validated, the OPTIONAL site+locale overrides in
 * `<overrideDirectory>/<site>/<locale>.json` are merged over them (see `loadSiteOverlays`). A
 * deployment with no `sites/` directory behaves exactly as before.
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
      problems.push({
        file,
        reason: `fails the dictionary schema:\n${formatIssues(result.error.issues)}`,
      });
      continue;
    }

    byLocale.set(locale, result.data);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid i18n dictionary data:\n${formatProblems(problems)}`);
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

  const overlays = loadSiteOverlays(options, byLocale);

  return {
    get(locale: Locale, siteCode?: string): Dictionary {
      // The site's OWN override first (only that site's file is ever consulted), then the shared
      // dictionary for the locale, then the shared default-locale dictionary.
      if (siteCode !== undefined) {
        const overlay = overlays.get(overlayKey(siteCode, locale));
        if (overlay !== undefined) return overlay;
      }
      return byLocale.get(locale) ?? byLocale.get(options.defaultLocale)!;
    },
    all(): ReadonlyMap<string, Dictionary> {
      return new Map(byLocale);
    },
    overrides(): ReadonlyMap<string, Dictionary> {
      return new Map(overlays);
    },
  };
}

/** The key of one (site, locale) override. */
function overlayKey(siteCode: string, locale: string): string {
  return `${siteCode}/${locale}`;
}

/**
 * S1E2 — THE SITE+LOCALE OVERLAYS
 * ==============================
 *
 * `config/i18n/sites/<site>/<locale>.json` is an OPTIONAL partial override of the shared
 * dictionary for one (site, locale). Every failure is loud and names the file, because a silent
 * override (or a silently ignored one) is how two sites end up convinced they say the same thing:
 *
 *  - a directory that is not a configured site code is refused;
 *  - a file that is not named after one of THAT site's locale path keys is refused;
 *  - an override with no shared dictionary to override is refused;
 *  - a key the dictionary does not define is refused by the override schema;
 *  - the MERGED result must satisfy the complete `dictionarySchema`.
 *
 * A missing `sites/` directory is the ordinary single-dictionary deployment and overrides nothing.
 */
function loadSiteOverlays(
  options: LoadDictionaryRegistryOptions,
  byLocale: ReadonlyMap<string, Dictionary>,
): Map<string, Dictionary> {
  const overlays = new Map<string, Dictionary>();
  if (options.overrideDirectory === undefined) return overlays;

  let siteDirectories: string[];
  try {
    siteDirectories = readdirSync(options.overrideDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return overlays;
  }

  const problems: FileProblem[] = [];
  const declared = new Map((options.sites ?? []).map((site) => [site.code, site]));

  for (const code of siteDirectories) {
    const site = declared.get(code);
    if (site === undefined) {
      problems.push({
        file: code,
        reason:
          `is not a configured site code — declare a "sites" entry for "${code}" in ` +
          "site.config.json, or remove the folder (an override can only belong to a real site)",
      });
      continue;
    }

    const directory = path.join(options.overrideDirectory, code);
    const files = readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort();

    for (const file of files) {
      const relative = `sites/${code}/${file}`;
      const locale = path.basename(file, ".json");

      if (!localeNamePattern.test(locale)) {
        problems.push({ file: relative, reason: "is not named after a locale path key" });
        continue;
      }
      if (!site.locales.includes(locale)) {
        problems.push({
          file: relative,
          reason:
            `is not a locale of site "${code}" ` +
            `(it serves: ${site.locales.join(", ")})`,
        });
        continue;
      }

      const base = byLocale.get(locale);
      if (base === undefined) {
        problems.push({
          file: relative,
          reason: `has no shared dictionary to override (expected config/i18n/${locale}.json)`,
        });
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path.join(directory, file), "utf8"));
      } catch {
        problems.push({ file: relative, reason: "is not valid JSON" });
        continue;
      }

      const parsed = dictionaryOverrideSchema.safeParse(raw);
      if (!parsed.success) {
        problems.push({
          file: relative,
          reason:
            "fails the site+locale override schema " +
            `(only existing dictionary keys may be overridden):\n${formatIssues(parsed.error.issues)}`,
        });
        continue;
      }

      const effective = dictionarySchema.safeParse(mergeDictionaryOverride(base, parsed.data));
      if (!effective.success) {
        problems.push({
          file: relative,
          reason: `produced an invalid effective dictionary:\n${formatIssues(effective.error.issues)}`,
        });
        continue;
      }

      overlays.set(overlayKey(code, locale), effective.data);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid site+locale dictionary overrides:\n${formatProblems(problems)}`);
  }

  return overlays;
}
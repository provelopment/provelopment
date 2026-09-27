/**
 * LOCALE PATH KEYS AND CANONICAL LANGUAGE TAGS (FOUNDATION-S1)
 * ==========================================================
 *
 * A locale has TWO spellings, and they are deliberately different concerns:
 *
 *   PATH KEY          lowercase, used for the content directory and the URL segment:
 *                     `en`, `fr`, `de`, `en-ca`, `fr-ca`, `fr-fr`
 *   CANONICAL TAG     the standards-facing language tag used in metadata/hreflang:
 *                     `en`, `en-CA`, `fr-CA`, `fr-FR`, `zh-Hans`
 *
 * A path key may be SIMPLE (a bare language, `fr`) or FULL (language + region, `fr-ca`). The
 * simple form keeps ordinary authoring easy, and its MEANING depends on the site:
 *
 *   site `ca` + `en`     → en-CA      (English appropriate to Canada)
 *   site `ca` + `fr`     → fr-CA      (French appropriate to Canada)
 *   site `ww` + `en`     → en-US      (the Worldwide site's English convention)
 *   site `fr` + `fr`     → fr-FR
 *
 * and an author who deliberately wants another country's language INSIDE a site writes the full
 * form instead (`ca/fr-fr` → fr-FR), which is never reinterpreted.
 *
 * RESOLUTION ORDER (ONE authority, no scattered magic):
 *   1. the entry's explicit `canonical` (the adopter's declaration: `ww/en` → `en-US`);
 *   2. a FULL path key resolves to itself in canonical casing (`fr-ca` → `fr-CA`);
 *   3. a SIMPLE path key inside a COUNTRY site resolves to `<lang>-<CODE>` (`ca` + `fr` → `fr-CA`);
 *   4. a SIMPLE path key inside the WORLDWIDE site uses the language's global convention
 *      (`en` → `en-US`, per the documented table below), else the bare language.
 *
 * Framework-neutral: pure data + types only.
 */
import { isWorldwideSiteCode, normalizeSiteCode } from "./site-code";

/** A locale's lowercase path key: `en`, `fr`, `fr-ca`, `en-ca`, `zh-hans`. */
export const LOCALE_PATH_KEY_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;

/** True when a value may be a locale path key (lowercase, no spaces, no traversal). */
export function isLocalePathKey(value: string): boolean {
  return typeof value === "string" && LOCALE_PATH_KEY_PATTERN.test(value);
}

/** The canonical (standards-facing) language tag for a path key: `en-ca` → `en-CA`. */
export function canonicalTagForPathKey(pathKey: string): string {
  const [language, ...rest] = pathKey.split("-");
  if (language === undefined || language === "") return pathKey;
  return [language, ...rest.map((subtag) => (subtag.length === 2 ? subtag.toUpperCase() : subtag))].join("-");
}

/**
 * The documented global conventions for a SIMPLE key inside the Worldwide site — the only place
 * such a choice is made, so `ww/en` is `en-US` everywhere and nowhere else.
 */
export const WORLDWIDE_LOCALE_CONVENTIONS: Readonly<Record<string, string>> = {
  en: "en-US",
  pt: "pt-PT",
  es: "es-ES",
  zh: "zh-Hans",
};

/** One locale as an adopter declares it for a site. */
export interface SiteLocaleInput {
  /** The lowercase path key: the content directory and the URL segment. */
  readonly path: string;
  /** An explicit standards-facing tag. Absent → the resolution order above decides. */
  readonly canonical?: string;
  /** Optional per-site display label; absent → the deployment locale registry's label. */
  readonly label?: string;
}

/** One locale, fully resolved for one site. */
export interface ResolvedSiteLocale {
  /** The lowercase path key (directory + URL segment). */
  readonly path: string;
  /** The standards-facing language tag (metadata, hreflang). */
  readonly canonical: string;
  /** Optional per-site display label override. */
  readonly label?: string;
}

/** Whether a path key is SIMPLE (bare language) or FULL (language + region). */
export function isSimpleLocalePathKey(pathKey: string): boolean {
  return isLocalePathKey(pathKey) && !pathKey.includes("-");
}

/**
 * Resolves one declared locale for ONE site (the single authority for the path-key ↔ canonical
 * relationship; the schema and the runtime both call it, so validation cannot disagree).
 */
export function resolveSiteLocale(
  siteCode: string,
  input: SiteLocaleInput | string,
): ResolvedSiteLocale {
  const entry: SiteLocaleInput = typeof input === "string" ? { path: input } : input;
  const key = entry.path.trim().toLowerCase();
  const code = normalizeSiteCode(siteCode);

  if (entry.canonical !== undefined && entry.canonical.trim() !== "") {
    return {
      path: key,
      canonical: entry.canonical.trim(),
      ...(entry.label === undefined ? {} : { label: entry.label }),
    };
  }

  const canonical = (() => {
    if (!isSimpleLocalePathKey(key)) return canonicalTagForPathKey(key);
    if (isWorldwideSiteCode(code)) return WORLDWIDE_LOCALE_CONVENTIONS[key] ?? key;
    return `${key}-${code.toUpperCase()}`;
  })();

  return { path: key, canonical, ...(entry.label === undefined ? {} : { label: entry.label }) };
}

/** The path key that carries a canonical tag inside one site, or `undefined`. */
export function pathKeyForCanonical(
  locales: readonly ResolvedSiteLocale[],
  canonical: string,
): string | undefined {
  const wanted = canonical.toLowerCase();
  return locales.find((locale) => locale.canonical.toLowerCase() === wanted)?.path;
}

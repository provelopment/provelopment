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

/**
 * A locale PATH KEY: `en`, `fr`, `fr-ca`, `en-ca`, `zh-hans`, `zh-hant-tw`, `sr-latn`.
 *
 * The supported grammar is deliberately bounded and documented here, in ONE place:
 *
 *     language           2–3 lowercase letters            en, fr, id, zh, sr
 *     [-script]          4 lowercase letters              hans, hant, latn
 *     [-region]          2 lowercase letters, or 3 digits ca, tw, 419
 *
 * BCP 47 extensions, variants and private-use subtags are NOT supported (nothing here consumes
 * them), and the key is always lowercase because it is a directory name AND a URL segment.
 */
export const LOCALE_PATH_KEY_PATTERN = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-[a-z]{2}|-[0-9]{3})?$/;

/** True when a value may be a locale path key (lowercase, no spaces, no traversal). */
export function isLocalePathKey(value: string): boolean {
  return typeof value === "string" && LOCALE_PATH_KEY_PATTERN.test(value);
}

/**
 * The canonical (standards-facing) language tag for a path key — language lowercase, script
 * title-case, region uppercase:
 *
 *     en-ca      → en-CA
 *     fr-ca      → fr-CA
 *     zh-hant    → zh-Hant
 *     zh-hant-tw → zh-Hant-TW
 *     sr-latn    → sr-Latn
 *
 * The path key and the canonical tag are the SAME locale in two spellings; the mapping is total
 * and deterministic, never a lookup table.
 */
export function canonicalTagForPathKey(pathKey: string): string {
  const [language, ...subtags] = pathKey.split("-");
  if (language === undefined || language === "") return pathKey;
  return [
    language,
    ...subtags.map((subtag) => {
      if (subtag.length === 4) return subtag.charAt(0).toUpperCase() + subtag.slice(1);
      if (subtag.length === 2) return subtag.toUpperCase();
      return subtag;
    }),
  ].join("-");
}


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
    // A FULL key already names its own locale: `fr-ca` → `fr-CA`, `zh-hant-tw` → `zh-Hant-TW`.
    if (!isSimpleLocalePathKey(key)) return canonicalTagForPathKey(key);
    // The Worldwide site makes NO country assumption: `ww/fr` is simply French (`fr`). A
    // deliberate convention (`ww/en` → `en-US`) is an EXPLICIT `canonical` on the entry, so the
    // platform never invents a country for a global language.
    if (isWorldwideSiteCode(code)) return key;
    // A country site derives the country's own variant: `ca/en` → `en-CA`, `br/pt` → `pt-BR`.
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

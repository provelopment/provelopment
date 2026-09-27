/**
 * Locale concepts and pure locale-negotiation helpers.
 *
 * This module is framework-independent: it must never import React,
 * Next.js, or browser APIs.
 */

export type Locale = string;

/**
 * THE LOCALE CONTRACT (FOUNDATION-S1 — one rule, one place)
 * =======================================================
 *
 * A locale identifier is a language tag: a language subtag of two or three lowercase
 * letters, optionally followed by subtags of two to eight alphanumerics each, separated
 * by `-`:
 *
 *     en          fr          id          de          nl
 *     en-CA       fr-CA       fr-FR       en-GB       pt-BR
 *     zh-Hans     sr-Latn-RS
 *
 * The first subtag is the language, so `en-GB` and `en-CA` are DIFFERENT locales with
 * different page trees, while a plain `fr` is a language that a site may serve on its own
 * (`france/fr/about`). Foundation supports this documented shape deliberately instead of
 * a full BCP 47 implementation: a complete parser would add a large, speculative surface
 * (grandfathered tags, extensions, private-use subtags) that nothing here consumes, while
 * two-letter-only codes would make "Canada French" and "France French" unrepresentable —
 * which is exactly the coupling S1 removes.
 *
 * THIS PATTERN IS THE ONE RULE. The configuration schema and the i18n dictionary registry
 * import it rather than declaring their own, so "what a locale may look like" cannot drift
 * between validation, discovery and routing.
 */
export const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isWellFormedLocale(locale: string): boolean {
  return typeof locale === "string" && LOCALE_PATTERN.test(locale);
}

export interface NegotiateLocaleOptions {
  readonly supported: readonly Locale[];
  readonly defaultLocale: Locale;
  readonly cookieLocale?: Locale | undefined;
  /** Raw `Accept-Language` header value. */
  readonly acceptLanguage?: string | undefined;
}

export interface AcceptLanguageEntry {
  readonly locale: string;
  readonly quality: number;
}

/**
 * Parses an `Accept-Language` header into entries ordered by quality
 * (highest first). Malformed entries are dropped.
 */
export function parseAcceptLanguage(header: string): readonly AcceptLanguageEntry[] {
  return header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const [tag, ...parameters] = part.split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.split("=")[1] ?? "")
        : 1;

      return {
        locale: (tag ?? "").trim(),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => isWellFormedLocale(entry.locale))
    .sort((a, b) => b.quality - a.quality);
}

/**
 * Resolves the best supported locale from a cookie and the
 * `Accept-Language` header, falling back to the default locale. Region
 * sub-tags are matched against base locales (e.g. `nl-NL` matches `nl`).
 */
export function negotiateLocale(options: NegotiateLocaleOptions): Locale {
  const { supported, defaultLocale, cookieLocale, acceptLanguage } = options;

  if (cookieLocale && supported.includes(cookieLocale)) {
    return cookieLocale;
  }

  if (acceptLanguage) {
    for (const { locale } of parseAcceptLanguage(acceptLanguage)) {
      if (supported.includes(locale)) {
        return locale;
      }

      const [baseLocale] = locale.split("-");
      if (baseLocale && supported.includes(baseLocale)) {
        return baseLocale;
      }
    }
  }

  return defaultLocale;
}

/**
 * S1 — `replaceLocaleSegment` is GONE, deliberately.
 *
 * "Replace the first segment" was correct only while a URL's first segment was always the
 * locale. With site contexts it may be a site prefix instead, so the operation is no longer
 * expressible as a segment swap: the destination of a language switch is built from the
 * SITE's own locale path (`@/core/site` → `sitePath(site, locale, routePath)`), which keeps
 * the site, replaces the locale and preserves the page. Removing the helper removes the
 * possibility of a language switch that silently leaves its site.
 */

export interface LanguageAlternatesOptions {
  readonly baseUrl: string;
  /**
   * The alternate locales. A plain string is a locale PATH KEY used for BOTH the URL segment and
   * the advertised tag; an entry may instead carry a canonical tag, so a `fr-CA` hreflang can
   * point at the lowercase `/ca/fr` URL (S1E2 — path keys address, tags identify).
   */
  readonly locales: readonly (Locale | LanguageAlternateLocale)[];
  /** When provided, emits an `x-default` entry for this locale PATH KEY. */
  readonly defaultLocale?: Locale | undefined;
  /** Route path such as `/about`; omit for the locale root. */
  readonly path?: string | undefined;
  /**
   * S1 — the site's public prefix (`/<site>`), always present in the site-scoped URL model. It is
   * the SAME prefix `@/core/site` puts in front of a site's URLs, so an hreflang alternate can
   * never point at another site's tree.
   */
  readonly sitePrefix?: string | undefined;
}

/** S1E2 — one alternate locale: how its URL is spelled, and how standards identify it. */
export interface LanguageAlternateLocale {
  /** The locale PATH KEY: the URL segment (lowercase). */
  readonly path: string;
  /** The standards-facing tag (`fr-CA`, `zh-Hant`). Absent → the path key is used as-is. */
  readonly canonical?: string;
}

/** The path key and the advertised tag of one alternate entry. */
export function languageAlternate(entry: Locale | LanguageAlternateLocale): {
  readonly path: string;
  readonly tag: string;
} {
  if (typeof entry === "string") return { path: entry, tag: entry };
  return { path: entry.path, tag: entry.canonical ?? entry.path };
}

/**
 * Builds an hreflang alternates map (`alternates.languages` metadata) covering every
 * locale of ONE site plus an optional `x-default`.
 *
 * S1E2 — the KEY is the canonical tag and the URL is the locale PATH KEY: `/ca/fr/about` is
 * advertised as `fr-CA`. The two spellings are the same locale, so no URL changes.
 */
export function buildLanguageAlternates(
  options: LanguageAlternatesOptions,
): Record<string, string> {
  const { baseUrl, locales, defaultLocale, path = "", sitePrefix = "" } = options;
  const normalizedPath = path === "/" ? "" : path;

  const alternates: Record<string, string> = {};
  for (const entry of locales) {
    const { path: localePath, tag } = languageAlternate(entry);
    alternates[tag] = `${baseUrl}${sitePrefix}/${localePath}${normalizedPath}`;
  }

  if (defaultLocale) {
    alternates["x-default"] = `${baseUrl}${sitePrefix}/${defaultLocale}${normalizedPath}`;
  }

  return alternates;
}
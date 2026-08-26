/**
 * Locale concepts and pure locale-negotiation helpers.
 *
 * This module is framework-independent: it must never import React,
 * Next.js, or browser APIs.
 */

export type Locale = string;

export interface NegotiateLocaleOptions {
  readonly supported: readonly Locale[];
  readonly defaultLocale: Locale;
  readonly cookieLocale?: Locale | undefined;
  /** Raw `Accept-Language` header value. */
  readonly acceptLanguage?: string | undefined;
}

/** Matches well-formed language tags such as `en`, `en-US`, or `zh-Hans`. */
const wellFormedLocalePattern = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isWellFormedLocale(locale: string): boolean {
  return wellFormedLocalePattern.test(locale);
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

export interface LanguageAlternatesOptions {
  readonly baseUrl: string;
  readonly locales: readonly Locale[];
  /** When provided, emits an `x-default` entry for this locale. */
  readonly defaultLocale?: Locale | undefined;
  /** Route path such as `/about`; omit for the locale root. */
  readonly path?: string | undefined;
}

/**
 * Builds an hreflang alternates map (`alternates.languages` metadata)
 * covering every supported locale plus an optional `x-default`.
 */
export function buildLanguageAlternates(
  options: LanguageAlternatesOptions,
): Record<string, string> {
  const { baseUrl, locales, defaultLocale, path = "" } = options;
  const normalizedPath = path === "/" ? "" : path;

  const alternates: Record<string, string> = {};
  for (const locale of locales) {
    alternates[locale] = `${baseUrl}/${locale}${normalizedPath}`;
  }

  if (defaultLocale) {
    alternates["x-default"] = `${baseUrl}/${defaultLocale}${normalizedPath}`;
  }

  return alternates;
}
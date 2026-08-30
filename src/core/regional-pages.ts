/**
 * Phase L — locale + location as first-class page context.
 *
 * A rendered page is `locale + region + content page`. This module answers the
 * inventory + navigation questions for those dimensions purely:
 *
 *   - which regions are available for a locale,
 *   - which pages exist under (locale, region),
 *   - the deterministic destination when switching location,
 *   - the deterministic destination when switching language,
 *   - hreflang alternates for genuinely existing (locale, region, page).
 *
 * Framework-free and pure so both server routes and the thin client switchers
 * share exactly one behavior. No component performs selection logic; no
 * `RegionalService<T>`-style abstraction is introduced.
 */

import type { PageRegionBinding } from "./region";

/** Whether the exact (locale, region, slug) combination is configured. */
export function hasPageEntry(
  entries: readonly PageRegionBinding[],
  locale: string,
  region: string,
  slug: string | null,
): boolean {
  return entries.some(
    (entry) =>
      entry.locale === locale && entry.region === region && entry.slug === slug,
  );
}

/**
 * Region ids available for a locale, in configuration order. A region is
 * available only when it has a landing entry `{ locale, region }` for that
 * locale (validated at build time) — availability is configuration, never a
 * global property of the region.
 */
export function regionsForLocale(
  entries: readonly PageRegionBinding[],
  locale: string,
): readonly string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.locale !== locale || entry.slug !== null) continue;
    if (seen.has(entry.region)) continue;
    seen.add(entry.region);
    ordered.push(entry.region);
  }
  return ordered;
}

/** Ordered page slugs (null = landing) configured for (locale, region). */
export function pagesForRegion(
  entries: readonly PageRegionBinding[],
  locale: string,
  region: string,
): readonly (string | null)[] {
  return entries
    .filter((entry) => entry.locale === locale && entry.region === region)
    .map((entry) => entry.slug);
}

/**
 * Deterministic destination for switching LOCATION within the same locale.
 *
 *   1. the same content page under the target region, if configured;
 *   2. the target region's landing page;
 *   3. the target region's first page in configuration order;
 *   4. `null` (the caller hides/omits the option — never a dead link).
 *
 * The current language is NEVER changed by this function.
 */
export function resolveLocationDestination(
  entries: readonly PageRegionBinding[],
  locale: string,
  targetRegion: string,
  currentSlug: string | null,
): { readonly region: string; readonly slug: string | null } | null {
  if (hasPageEntry(entries, locale, targetRegion, currentSlug)) {
    return { region: targetRegion, slug: currentSlug };
  }
  if (hasPageEntry(entries, locale, targetRegion, null)) {
    return { region: targetRegion, slug: null };
  }
  const firstPage = entries.find(
    (entry) => entry.locale === locale && entry.region === targetRegion && entry.slug !== null,
  );
  return firstPage ? { region: targetRegion, slug: firstPage.slug } : null;
}

/**
 * Deterministic destination for switching LANGUAGE but keeping the region.
 *
 *   1. the same (region, page) under the target locale, if configured;
 *   2. the region's landing page in the target locale;
 *   3. the first page of the region in the target locale;
 *   4. `null` (language option omitted/disabled — the region is never
 *      silently replaced because the target locale lacks the page).
 */
export function resolveLocaleDestination(
  entries: readonly PageRegionBinding[],
  targetLocale: string,
  region: string,
  currentSlug: string | null,
): { readonly region: string; readonly slug: string | null } | null {
  if (hasPageEntry(entries, targetLocale, region, currentSlug)) {
    return { region, slug: currentSlug };
  }
  if (hasPageEntry(entries, targetLocale, region, null)) {
    return { region, slug: null };
  }
  const firstPage = entries.find(
    (entry) => entry.locale === targetLocale && entry.region === region && entry.slug !== null,
  );
  return firstPage ? { region, slug: firstPage.slug } : null;
}

/** `/{locale}` (no slug) | `/{locale}/{region}` | `/{locale}/{region}/{slug}`. */
export function regionalPath(
  locale: string,
  region: string,
  slug: string | null,
): string {
  return slug ? `/${locale}/${region}/${slug}` : `/${locale}/${region}`;
}

/**
 * Parses a client-side pathname into its (locale, region, slug) context. The
 * middle segment is only a region when it is actually bound to that locale;
 * otherwise the route is a flat (non-regional) content page and region is null.
 */
export function parseRegionalPath(
  entries: readonly PageRegionBinding[],
  pathname: string,
): { readonly locale: string; readonly region: string | null; readonly slug: string | null } {
  const segments = pathname.split("/").filter(Boolean);
  const locale = segments[0] ?? "";
  const second = segments[1] ?? null;
  const third = segments[2] ?? null;

  if (second && entries.some((entry) => entry.locale === locale && entry.region === second)) {
    return { locale, region: second, slug: third };
  }
  return { locale, region: null, slug: second };
}

export interface RegionalLanguageAlternatesOptions {
  readonly baseUrl: string;
  readonly locales: readonly string[];
  readonly defaultLocale?: string;
  readonly entries: readonly PageRegionBinding[];
  /** The current page's region (same region is preserved across locales). */
  readonly region: string;
  /** Current page slug; `null` for a regional landing. */
  readonly slug: string | null;
}

/**
 * Builds the hreflang alternates for a regional page. Only genuinely
 * configured `(locale, region, page)` combinations are emitted — a language is
 * never linked to a 404, and `x-default` is emitted only when the default
 * locale has an equivalent destination.
 */
export function buildRegionalLanguageAlternates(
  options: RegionalLanguageAlternatesOptions,
): Record<string, string> {
  const { baseUrl, locales, defaultLocale, entries, region, slug } = options;
  const alternates: Record<string, string> = {};

  for (const locale of locales) {
    const destination = resolveLocaleDestination(entries, locale, region, slug);
    if (destination) {
      alternates[locale] = `${baseUrl}${regionalPath(locale, destination.region, destination.slug)}`;
    }
  }

  if (defaultLocale) {
    const destination = resolveLocaleDestination(entries, defaultLocale, region, slug);
    if (destination) {
      alternates["x-default"] =
        `${baseUrl}${regionalPath(defaultLocale, destination.region, destination.slug)}`;
    }
  }

  return alternates;
}
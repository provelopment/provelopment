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
 * Phase M adds the two independent inventory concerns:
 *
 *   - `configuredRegionIds` — the LOCATION SELECTOR's inventory, derived from
 *     `business.regions` (configured operating locations), independent of
 *     locale and page bindings;
 *   - `resolveNavHref` / `unspecifiedDestination` — region-aware navigation
 *     links (a regional context only exposes pages that exist there, never a
 *     silent redirect) and the explicit unspecified-location destination.
 *
 * Framework-free and pure so both server routes and the thin client switchers
 * share exactly one behavior. No component performs selection logic; no
 * `RegionalService<T>`-style abstraction is introduced.
 */

import type { OperationalRegion, PageRegionBinding } from "./region";

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

/**
 * Phase M — the LOCATION SELECTOR's inventory: every CONFIGURED operating
 * location, in `business.regions` insertion (configuration) order, regardless
 * of locale or page bindings. `business.regions` answers "which operating
 * locations exist"; `business.pages` answers "which locale + region + page
 * combinations exist" — two separate concerns that must not be merged.
 *
 * A region may legitimately have only a landing (or no bindings yet) and still
 * be selectable.
 */
export function configuredRegionIds(
  regions: Readonly<Record<string, OperationalRegion>>,
): readonly string[] {
  return Object.keys(regions);
}

/** Distinct locales bound to a region, in configuration order. */
export function localesForRegion(
  entries: readonly PageRegionBinding[],
  region: string,
): readonly string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.region !== region || seen.has(entry.locale)) continue;
    seen.add(entry.locale);
    ordered.push(entry.locale);
  }
  return ordered;
}

/** Whether an href is a site-internal route (starts with `/`). */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/");
}

/**
 * Phase M — the deterministic locale a region uses when the visitor's current
 * locale is NOT bound to it. Explicit `region.defaultLocale` wins; otherwise
 * the locale of the region's first landing binding in configuration order.
 * Pure so the LocationSwitcher and tests share exactly one rule.
 */
export function regionDefaultLocale(
  regions: Readonly<Record<string, OperationalRegion>>,
  entries: readonly PageRegionBinding[],
  regionId: string,
): string | null {
  const explicit = regions[regionId]?.defaultLocale;
  if (explicit) return explicit;

  const landing = entries.find(
    (entry) => entry.region === regionId && entry.slug === null,
  );
  return landing?.locale ?? null;
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

export interface ResolveLocationDestinationOptions {
  readonly entries: readonly PageRegionBinding[];
  readonly locale: string;
  readonly targetRegion: string;
  readonly currentSlug: string | null;
  /**
   * Phase M — the target region's deterministic default locale (`region
   * defaultLocale` from config). Used ONLY when the current locale is not
   * bound to the target region at all: the destination becomes that locale's
   * LANDING (the page is not preserved across a forced locale change).
   */
  readonly defaultLocale?: string | null;
}

export interface LocationDestination {
  readonly locale: string;
  readonly region: string;
  readonly slug: string | null;
}

/**
 * Phase M — deterministic destination for switching LOCATION.
 *
 *  - current locale IS bound to the target region:
 *      1. the same content page under the target region, if configured;
 *      2. the target region's landing page;
 *      3. the target region's first page in configuration order;
 *    (locale is preserved — location and language are independent).
 *  - current locale is NOT bound to the target region: the destination is the
 *    target region's configured default locale + its landing (a forced locale
 *    change ends at the landing; the page is never preserved across it).
 *  - `null` when no destination exists (caller hides/omits — never a dead
 *    link, never a silent region/language change).
 */
export function resolveLocationDestination(
  options: ResolveLocationDestinationOptions,
): LocationDestination | null {
  const { entries, locale, targetRegion, currentSlug, defaultLocale } = options;

  if (hasPageEntry(entries, locale, targetRegion, currentSlug)) {
    return { locale, region: targetRegion, slug: currentSlug };
  }
  if (hasPageEntry(entries, locale, targetRegion, null)) {
    return { locale, region: targetRegion, slug: null };
  }
  const firstPage = entries.find(
    (entry) => entry.locale === locale && entry.region === targetRegion && entry.slug !== null,
  );
  if (firstPage) {
    return { locale, region: targetRegion, slug: firstPage.slug };
  }

  if (defaultLocale && hasPageEntry(entries, defaultLocale, targetRegion, null)) {
    return { locale: defaultLocale, region: targetRegion, slug: null };
  }
  return null;
}

/**
 * Phase M — NAVIGATION link resolution. In a REGIONAL context a page is only
 * exposed when it actually exists for (locale, region): a nav item must never
 * promise one page and silently deliver another. Returns `null` for an
 * unavailable regional page (the caller filters it out); returns the regional
 * LANDING for `href === "/"` (Home is always the regional home). In the
 * generic (unspecified location) context the flat `/{locale}{href}` route is
 * returned. External hrefs (`mailto:`, `tel:`, `https:`, …) pass through
 * unchanged — the caller renders them as plain links.
 */
export function resolveNavHref(
  entries: readonly PageRegionBinding[],
  locale: string,
  region: string | null,
  href: string,
): string | null {
  if (!isInternalHref(href)) return href;

  if (region === null) {
    return `/${locale}${href === "/" ? "" : href}`;
  }
  if (href === "/") {
    return regionalPath(locale, region, null);
  }
  const slug = href.replace(/^\//, "");
  if (slug && hasPageEntry(entries, locale, region, slug)) {
    return regionalPath(locale, region, slug);
  }
  return null;
}

/**
 * Phase M — the destination of the explicit "unspecified location" option:
 * the equivalent NON-REGIONAL page where one exists. A regional landing
 * (`slug === null`) returns to `/{locale}`; a regional page returns to the
 * flat `/{locale}/{slug}` (its existence is guaranteed by the content model —
 * regional pages reuse the locale's flat content file).
 */
export function unspecifiedDestination(locale: string, slug: string | null): string {
  return slug ? `/${locale}/${slug}` : `/${locale}`;
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
/**
 * Page context composition (Phase K).
 *
 * Assembles the resolved context for a route: locale + content slug + optional
 * operating region. The page-context resolver is the single place that joins
 * page → region; components consume the resolved region (or its absence) and
 * never perform region selection themselves.
 *
 * Pure and framework-free: the caller supplies the validated region/page
 * configuration (normally `siteConfig.regions` / `siteConfig.pageBindings`).
 */

import type { OperationalRegion, PageRegionBinding } from "@/core/region";
import { resolvePageRegionBinding, resolveRegion } from "@/core/region";

export interface PageContext {
  /** BCP-47 locale of the route. */
  readonly locale: string;
  /** Content slug within the locale (the content page identity). */
  readonly slug: string;
  /** Resolved operating region, or null when the page is not regional. */
  readonly region: OperationalRegion | null;
}

export interface ResolvePageContextOptions {
  readonly regions: Readonly<Record<string, OperationalRegion>>;
  readonly pageBindings: readonly PageRegionBinding[];
}

/**
 * Resolves `{ locale, slug }` to its optional region. A page with no binding
 * resolves `region: null` (legitimate — non-regional pages must not invent an
 * operational identity). A binding referencing a missing region is a config
 * error caught at build time by `assertRegionsValid`.
 */
export function resolvePageContext(
  options: ResolvePageContextOptions,
  locale: string,
  slug: string,
): PageContext {
  const regionId = resolvePageRegionBinding(options.pageBindings, locale, slug);
  const region = regionId ? resolveRegion(options.regions, regionId) : null;

  return { locale, slug, region };
}
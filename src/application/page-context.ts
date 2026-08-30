/**
 * Page context composition (Phase K/L).
 *
 * Assembles the resolved context for a route: locale + region + content slug.
 * For a regional route the region comes from the URL segment (authoritative);
 * resolution never re-derives it from locale, address, or global defaults.
 * Components consume the resolved region (or its absence) and never perform
 * region selection themselves.
 *
 * Pure and framework-free: the caller supplies the validated region/page
 * configuration (normally `siteConfig.regions` / `siteConfig.pageBindings`).
 */

import type { OperationalRegion } from "@/core/region";
import { resolveRegion } from "@/core/region";

export interface PageContext {
  /** BCP-47 locale of the route. */
  readonly locale: string;
  /** Resolved region id (from the URL for regional routes), or null. */
  readonly regionId: string | null;
  /** Resolved operating region, or null when the page is not regional. */
  readonly region: OperationalRegion | null;
  /** Content page slug within the region; null = regional landing. */
  readonly slug: string | null;
}

export interface ResolveRegionalPageContextOptions {
  readonly regions: Readonly<Record<string, OperationalRegion>>;
}

/**
 * Resolves `{ locale, regionId, slug }` to its page context. The region id is
 * authoritative when provided (it comes from the URL at `/{locale}/{region}`
 * or `/{locale}/{region}/{slug}` and must reference a configured region — the
 * missing-region case is a config error caught at build time). An absent id
 * yields `region: null` (legitimate — non-regional pages must not invent an
 * operational identity).
 */
export function resolveRegionalPageContext(
  options: ResolveRegionalPageContextOptions,
  locale: string,
  regionId: string | null,
  slug: string | null,
): PageContext {
  const region = regionId ? resolveRegion(options.regions, regionId) : null;

  return {
    locale,
    regionId: regionId && region ? regionId : null,
    region,
    slug,
  };
}
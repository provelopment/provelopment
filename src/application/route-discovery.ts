/**
 * Route discovery for the sitemap.
 *
 * The sitemap derives routes from the CONTENT MODEL plus feature enablement:
 *  - every page slug present in the default locale, plus the locale root;
 *  - when `features.offerings` is enabled, the offerings listing plus every
 *    canonical (default-locale) offering slug.
 * Navigation config is deliberately NOT consulted here — it controls
 * discoverability in the UI, not route existence. Pure and unit-testable.
 */
export interface SitemapRouteOptions {
  readonly offeringsEnabled: boolean;
  readonly pages: readonly string[];
  readonly canonicalOfferings: readonly string[];
}

export function buildSitemapRoutes(options: SitemapRouteOptions): string[] {
  const routes = ["", ...options.pages.map((slug) => `/${slug}`)];

  if (options.offeringsEnabled) {
    routes.push(
      "/offerings",
      ...options.canonicalOfferings.map((slug) => `/offerings/${slug}`),
    );
  }

  return routes;
}
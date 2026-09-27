import { HOME_CONTENT_SLUG } from "@/core/page-content";

/**
 * Route discovery for the sitemap.
 *
 * The sitemap derives routes from the CONTENT MODEL and nothing else: every page
 * route path that exists for a locale, plus the locale root. A nested page
 * (`offerings/website-design`) is emitted exactly as a top-level one is, because a
 * page's URL is its route path (`@/core/page-route-path`) — there is no per-kind
 * route rule left to keep in step.
 *
 * Navigation config is deliberately NOT consulted here — it controls discoverability
 * in the UI, not route existence. Pure and unit-testable.
 */
export interface SitemapRouteOptions {
  /** Every publishable page route path for the locale, nested paths included. */
  readonly pages: readonly string[];
}

export function buildSitemapRoutes(options: SitemapRouteOptions): string[] {
  // The RESERVED home slug is excluded: a site's home page may be authored as
  // ordinary content (`content/pages/markdown/<locale>/home.md`, or its JSON
  // counterpart) but is SERVED by the locale root (the `""` entry below), never at
  // `/{locale}/home`. Route discovery owns this rule so no sitemap caller has to
  // remember it, and so a site can never advertise a URL it does not serve.
  return [
    "",
    ...options.pages
      .filter((routePath) => routePath !== HOME_CONTENT_SLUG)
      .map((routePath) => `/${routePath}`),
  ];
}

import type { MetadataRoute } from "next";

import { createPageSources } from "@/adapters/content/page-sources";
import { buildSitemapRoutes } from "@/application/route-discovery";
import type { SpokeRuntimeContext } from "@/config/installation-runtime";
import { bindingsForSite, regionsForLocale, regionalPath } from "@/core/regional-pages";
import { sitePath, sitePrefixPath } from "@/core/site";

/**
 * THE SITEMAP OF ONE SPOKE CONTEXT (FOUNDATION-MULTISITE-M14)
 * ==========================================================
 *
 * S1 — THE INVENTORY IS SITE-SCOPED, and M14 makes it CONTEXT-SCOPED: every fact this function uses comes
 * from the ONE explicit context it is handed — its canonical origin (`context.siteConfig.url`), its sites and
 * page bindings, and its OWN authored page roots (`context.resources`), through the SAME page composition
 * every page route resolves with. There is no second inventory and no root discovery: a page a context may
 * serve is a sitemap entry, and a page it may not serve cannot appear.
 *
 * Each URL is built through the ONE site path builder, so:
 *
 *  - a page in `ca/fr/about.md` publishes `/ca/fr/about` and NOTHING for the `fr` site, whose own tree has its
 *    own inventory — the same locale path key in two sites is two pages;
 *  - every URL carries the site code first, because the site code IS the site's URL segment;
 *  - nested pages, regional landings and configured regional pages are emitted exactly as the route serves
 *    them (JSON-over-Markdown precedence is the composition's, never re-decided here).
 *
 * TWO CONTEXTS CANNOT MIX: because the roots and the origin are parameters, a sitemap built for context A
 * contains no URL of context B — proved for two disposable Installations in
 * `tests/unit/sitemap-context.test.ts`.
 */
export async function sitemapForContext(
  context: SpokeRuntimeContext,
): Promise<MetadataRoute.Sitemap> {
  const siteConfig = context.siteConfig;
  const routes = createPageSources({ sites: siteConfig.sites, roots: context.resources });

  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [{ url: siteConfig.url, lastModified }];

  // One site boundary per loop: nothing inside the body can see another site's tree.
  for (const site of siteConfig.sites) {
    const bindings = bindingsForSite(siteConfig.pageBindings, site.code);
    const prefix = sitePrefixPath(site);
    // LOC1 — A SITE THAT REQUIRES A LOCATION PUBLISHES NO UNSPECIFIED DESTINATION. Every non-regional
    // path of such a Site is a redirect into its configured default Location, so the flat
    // `/{site}/{locale}/{route}` form is not a visitor destination and is deliberately not advertised:
    // the canonical inventory of that Site is the regional one emitted below. An OPTIONAL Site is
    // unchanged.
    const requiresLocation = (site.locationSelection ?? null) !== null;

    for (const siteLocale of site.locales) {
      const locale = siteLocale.path;
      // Content route paths that are regional landings for this locale are emitted by the
      // regional loop below, not as flat `/{locale}/{route}` routes.
      const regional = regionsForLocale(bindings, locale);
      const routePaths = (await routes.listRoutes(site.code, locale)).filter(
        (routePath) => !regional.includes(routePath),
      );

      if (!requiresLocation) {
        for (const route of buildSitemapRoutes({ pages: routePaths })) {
          entries.push({
            url: `${siteConfig.url}${sitePath(site, locale, route.replace(/^\//, "")) as string}`,
            lastModified,
          });
        }
      }

      // Regional landings `/{locale}/{region}` (only configured for this locale + site).
      for (const region of regional) {
        entries.push({ url: `${siteConfig.url}${regionalPath(locale, region, null, prefix)}`, lastModified });
      }
      // Regional pages `/{locale}/{region}/{page}` (only configured combinations).
      for (const binding of bindings) {
        if (binding.locale === locale && binding.slug !== null) {
          entries.push({
            url: `${siteConfig.url}${regionalPath(locale, binding.region, binding.slug, prefix)}`,
            lastModified,
          });
        }
      }
    }
  }

  return entries;
}

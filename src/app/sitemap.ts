import type { MetadataRoute } from "next";

import { createPageSources } from "@/adapters/content/page-sources";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import { bindingsForSite, regionsForLocale, regionalPath } from "@/core/regional-pages";
import { sitePath, sitePrefixPath } from "@/core/site";

/**
 * The deployment's XML sitemap.
 *
 * S1 — THE INVENTORY IS SITE-SCOPED. Routes derive from the content model of EVERY declared
 * site, per locale and per configured regional (location) page — never from navigation config.
 * Each URL is built through the ONE site path builder, so:
 *
 *  - a page in `canada/fr-CA/services.md` publishes `/fr-CA/services` and NOTHING for the
 *    France site, whose own tree has its own inventory;
 *  - the default site's URLs carry no prefix, while another site's URLs carry its configured
 *    `pathPrefix` (`/france/fr-FR/…`);
 *  - the inventory is the page composition itself
 *    (`@/adapters/content/page-sources`), the SAME one every page route resolves through, so a
 *    newly authored file at ANY depth becomes a route and a sitemap entry in the same step.
 *
 * There is no second inventory to combine: `content/` holds pages (and assets), so a
 * page-shaped file published from anywhere else cannot make the sitemap advertise a URL the
 * deployment does not serve.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = createPageSources({ sites: siteConfig.sites });

  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [{ url: siteConfig.url, lastModified }];

  // One site boundary per loop: nothing inside the body can see another site's tree.
  for (const site of siteConfig.sites) {
    const bindings = bindingsForSite(siteConfig.pageBindings, site.id);
    const prefix = sitePrefixPath(site);

    for (const locale of site.locales) {
      // Content route paths that are regional landings for this locale are emitted by the
      // regional loop below, not as flat `/{locale}/{route}` routes.
      const regional = regionsForLocale(bindings, locale);
      const routePaths = (await routes.listRoutes(site.id, locale)).filter(
        (routePath) => !regional.includes(routePath),
      );

      for (const route of buildSitemapRoutes({ pages: routePaths })) {
        entries.push({
          url: `${siteConfig.url}${sitePath(site, locale, route.replace(/^\//, "")) as string}`,
          lastModified,
        });
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

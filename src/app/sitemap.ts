import type { MetadataRoute } from "next";

import { createPageSources } from "@/adapters/content/page-sources";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import { regionsForLocale, regionalPath } from "@/core/regional-pages";

/**
 * The site's XML sitemap.
 *
 * Route ownership: routes derive from the CONTENT MODEL + configured regional page
 * inventory per locale — never from navigation config. The inventory is the page
 * composition itself (`@/adapters/content/page-sources`), the SAME one every page
 * route resolves through, so a newly authored file at ANY depth becomes a route and
 * a sitemap entry in the same step. Because page inventories differ per locale and
 * region, every locale's routes are its own: a page that only exists in one
 * locale/region is only emitted there.
 *
 * There is no second inventory to combine: `content/` holds pages (and assets), so a
 * page-shaped file published from anywhere else cannot make the sitemap advertise a
 * URL the site does not serve.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = createPageSources({
    defaultLocale: siteConfig.defaultLocale,
    locales: siteConfig.locales.map((locale) => locale.code),
  });

  const lastModified = new Date();
  const rootEntry: MetadataRoute.Sitemap = [{ url: siteConfig.url, lastModified }];
  const localizedEntries: MetadataRoute.Sitemap = [];

  for (const { code } of siteConfig.locales) {
    // Content route paths that are regional landings for this locale are emitted by
    // the regional loop below, not as flat `/{locale}/{route}` routes.
    const regional = regionsForLocale(siteConfig.pageBindings, code);
    const routePaths = (await pages.listRoutes(code)).filter(
      (routePath) => !regional.includes(routePath),
    );
    const routes = buildSitemapRoutes({ pages: routePaths });

    for (const route of routes) {
      localizedEntries.push({ url: `${siteConfig.url}/${code}${route}`, lastModified });
    }

    // Regional landings `/{locale}/{region}` (only configured for this locale).
    for (const region of regional) {
      localizedEntries.push({
        url: `${siteConfig.url}${regionalPath(code, region, null)}`,
        lastModified,
      });
    }
    // Regional pages `/{locale}/{region}/{page}` (only configured combinations).
    for (const binding of siteConfig.pageBindings) {
      if (binding.locale === code && binding.slug !== null) {
        localizedEntries.push({
          url: `${siteConfig.url}${regionalPath(code, binding.region, binding.slug)}`,
          lastModified,
        });
      }
    }
  }

  return [...rootEntry, ...localizedEntries];
}

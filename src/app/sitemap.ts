import type { MetadataRoute } from "next";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pagesRepository = createFileSystemPageContentRepository({
    defaultLocale: siteConfig.defaultLocale,
  });
  const offeringsRepository = createFileSystemPageContentRepository({
    defaultLocale: siteConfig.defaultLocale,
    collection: "offerings",
  });

  // Route ownership: the sitemap derives routes from the CONTENT MODEL (page
  // and offering slugs that exist per the content repository) plus feature
  // enablement — never from navigation config. A navigation entry points only
  // at a route; a route belongs in the sitemap only when its content resolves
  // and the feature exposing it is enabled.
  const pages = await pagesRepository.listSlugs(siteConfig.defaultLocale);
  const canonicalOfferings = siteConfig.offeringsFeature
    ? await offeringsRepository.listSlugs(siteConfig.defaultLocale)
    : [];

  const routes = buildSitemapRoutes({
    offeringsEnabled: siteConfig.offeringsFeature === true,
    pages,
    canonicalOfferings,
  });

  const lastModified = new Date();

  const rootEntry: MetadataRoute.Sitemap = [{ url: siteConfig.url, lastModified }];

  const localizedEntries: MetadataRoute.Sitemap = siteConfig.locales.flatMap(({ code }) =>
    routes.map((route) => ({
      url: `${siteConfig.url}/${code}${route}`,
      lastModified,
    })),
  );

  return [...rootEntry, ...localizedEntries];
}
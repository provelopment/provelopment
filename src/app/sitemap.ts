import type { MetadataRoute } from "next";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { siteConfig } from "@/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const contentRepository = createFileSystemPageContentRepository({
    defaultLocale: siteConfig.defaultLocale,
  });

  // Route ownership: the sitemap derives routes from the CONTENT MODEL (the set
  // of pages that exist per the content repository), not from navigation
  // config. A navigation entry points only at a route; a route belongs in the
  // sitemap only when the corresponding content page resolves.
  const slugs = await contentRepository.listSlugs(siteConfig.defaultLocale);
  const routes = ["", ...slugs.map((slug) => `/${slug}`)];

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
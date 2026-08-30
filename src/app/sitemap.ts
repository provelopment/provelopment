import type { MetadataRoute } from "next";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import { resolveLegalDocs } from "@/core/legal";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pagesRepository = createFileSystemPageContentRepository({
    defaultLocale: siteConfig.defaultLocale,
  });
  const offeringsRepository = createFileSystemPageContentRepository({
    defaultLocale: siteConfig.defaultLocale,
    collection: "offerings",
  });
  const legalRepository = createFileSystemPageContentRepository({
    defaultLocale: siteConfig.defaultLocale,
    collection: "legal",
  });

  // Route ownership: routes derive from the CONTENT MODEL per locale (page,
  // offering, and legal slugs that exist for that locale) plus feature/config
  // enablement — never from navigation config. Because page inventories may
  // differ per locale (Phase K regional pages), every locale's routes are its
  // own: a page that only exists in one locale is only emitted there.
  const canonicalOfferings = siteConfig.offeringsFeature
    ? await offeringsRepository.listSlugs(siteConfig.defaultLocale)
    : [];
  const canonicalLegalSlugs = await legalRepository.listSlugs(siteConfig.defaultLocale);
  const legalSlugs = resolveLegalDocs(siteConfig.legal, canonicalLegalSlugs).map(
    (doc) => doc.slug,
  );

  const lastModified = new Date();

  const rootEntry: MetadataRoute.Sitemap = [{ url: siteConfig.url, lastModified }];

  const localizedEntries: MetadataRoute.Sitemap = [];
  for (const { code } of siteConfig.locales) {
    const pages = await pagesRepository.listSlugs(code);
    const routes = buildSitemapRoutes({
      offeringsEnabled: siteConfig.offeringsFeature === true,
      pages,
      canonicalOfferings,
      legalSlugs,
    });

    for (const route of routes) {
      localizedEntries.push({ url: `${siteConfig.url}/${code}${route}`, lastModified });
    }
  }

  return [...rootEntry, ...localizedEntries];
}
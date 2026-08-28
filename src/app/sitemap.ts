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

  // Route ownership: the sitemap derives routes from the CONTENT MODEL (page,
  // offering, and legal slugs that exist per the content repository) plus
  // feature/config enablement — never from navigation config. Legal routes are
  // the intersection of the configured `legal[]` block and canonical content.
  const pages = await pagesRepository.listSlugs(siteConfig.defaultLocale);
  const canonicalOfferings = siteConfig.offeringsFeature
    ? await offeringsRepository.listSlugs(siteConfig.defaultLocale)
    : [];
  const canonicalLegalSlugs = await legalRepository.listSlugs(siteConfig.defaultLocale);
  const legalSlugs = resolveLegalDocs(siteConfig.legal, canonicalLegalSlugs).map(
    (doc) => doc.slug,
  );

  const routes = buildSitemapRoutes({
    offeringsEnabled: siteConfig.offeringsFeature === true,
    pages,
    canonicalOfferings,
    legalSlugs,
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
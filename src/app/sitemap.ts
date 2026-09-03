import type { MetadataRoute } from "next";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import { resolveLegalDocs } from "@/core/legal";
import { regionsForLocale, regionalPath } from "@/core/regional-pages";

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

  // Route ownership: routes derive from the CONTENT MODEL + configured page
  // inventory per locale — never from navigation config. Because page
  // inventories differ per locale/region (Phase K/L regional pages), every
  // locale's routes are its own: a page that only exists in one locale/region
  // is only emitted there.
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
    // Content slugs that are regional landings for this locale are emitted by
    // the regional loop below, not as flat `/locale/slug` routes.
    const regional = regionsForLocale(siteConfig.pageBindings, code);
    const pages = (await pagesRepository.listSlugs(code)).filter(
      (slug) => !regional.includes(slug),
    );
    const routes = buildSitemapRoutes({
      offeringsEnabled: siteConfig.offeringsFeature === true,
      pages,
      canonicalOfferings,
      legalSlugs,
    });

    for (const route of routes) {
      localizedEntries.push({ url: `${siteConfig.url}/${code}${route}`, lastModified });
    }

    // Regional landings `/{locale}/{region}` (only configured for this locale).
    for (const region of regionsForLocale(siteConfig.pageBindings, code)) {
      localizedEntries.push({
        url: `${siteConfig.url}${regionalPath(code, region, null)}`,
        lastModified,
      });
    }
    // Regional pages `/{locale}/{region}/{slug}` (only configured combos).
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
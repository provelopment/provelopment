import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { PortfolioList } from "@/components/site/portfolio-list";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import type { PortfolioItem } from "@/core/portfolio";
import { sortPortfolio } from "@/core/portfolio";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const portfolioRepository = createFileSystemPageContentRepository<PortfolioItem>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "portfolio",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface PortfolioPageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

export async function generateMetadata({ params }: PortfolioPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const title = dictionary.portfolio?.heading ?? "Portfolio";
  const canonical = `${siteConfig.url}/${locale}/portfolio`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

  return {
    title,
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: "/portfolio",
      }),
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale,
      title,
      fallbackDescription: siteConfig.description,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales: localeCodes.filter((code) => code !== locale),
    }),
    twitter: buildTwitterData({
      title,
      fallbackDescription: siteConfig.description,
      imageUrl: ogImage,
    }),
  };
}

/**
 * `/portfolio` (Phase T). Same triple separation as offerings: content
 * existence (`content/portfolio/`), exposure (`features.portfolio`), and
 * discoverability (`navigation[]`).
 */
export default async function PortfolioPage({ params }: PortfolioPageProps) {
  const { locale } = await params;

  if (!siteConfig.portfolioFeature) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const chrome = dictionary.portfolio;
  if (!chrome) notFound();

  const canonicalSlugs = await portfolioRepository.listSlugs(siteConfig.defaultLocale);

  const items = new Array<PortfolioItem>();
  for (const slug of canonicalSlugs) {
    const content = await portfolioRepository.findBySlug(slug, locale);
    if (content) {
      items.push(content);
    }
  }

  const sorted = sortPortfolio(items);

  return (
    <Section as="article">
      <h1 className="text-3xl font-bold tracking-tight">{chrome.heading}</h1>
      <div className="mt-8">
        <PortfolioList
          items={sorted}
          baseHref={`/${locale}/portfolio`}
          emptyLabel={chrome.emptyState}
          featuredLabel={chrome.featured}
        />
      </div>
    </Section>
  );
}

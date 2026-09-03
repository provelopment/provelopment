import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { PortfolioDetail } from "@/components/site/portfolio-detail";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import type { PortfolioItem } from "@/core/portfolio";
import { isCanonicalPortfolioItem } from "@/core/portfolio";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const portfolioRepository = createFileSystemPageContentRepository<PortfolioItem>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "portfolio",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface PortfolioDetailPageProps {
  readonly params: Promise<{ readonly locale: string; readonly slug: string }>;
}

export async function generateStaticParams(): Promise<{ locale: string; slug: string }[]> {
  if (!siteConfig.portfolioFeature) return [];
  const canonicalSlugs = await portfolioRepository.listSlugs(siteConfig.defaultLocale);
  return localeCodes.flatMap((locale) =>
    canonicalSlugs.map((slug) => ({ locale, slug })),
  );
}

export const dynamicParams = false;

/** Canonical portfolio content for `slug`, or null when it should be a 404. */
async function findCanonicalPortfolioItem(
  slug: string,
  locale: string,
): Promise<PortfolioItem | null> {
  if (!siteConfig.portfolioFeature) return null;
  const canonicalSlugs = await portfolioRepository.listSlugs(siteConfig.defaultLocale);
  if (!isCanonicalPortfolioItem(slug, canonicalSlugs)) return null;
  return portfolioRepository.findBySlug(slug, locale);
}

export async function generateMetadata({
  params,
}: PortfolioDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await findCanonicalPortfolioItem(slug, locale);
  if (!content) return {};

  const title = content.title;
  const canonical = `${siteConfig.url}/${locale}/portfolio/${slug}`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

  return {
    title,
    description: content.summary,
    alternates: {
      canonical,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: `/portfolio/${slug}`,
      }),
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale,
      title,
      description: content.summary,
      fallbackDescription: siteConfig.description,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales: localeCodes.filter((code) => code !== locale),
    }),
    twitter: buildTwitterData({
      title,
      description: content.summary,
      fallbackDescription: siteConfig.description,
      imageUrl: ogImage,
    }),
  };
}

/**
 * `/portfolio/[slug]` (Phase T). Canonical-slug enforcement matches offerings
 * exactly: a requested slug is valid only when it is a canonical
 * (default-locale) portfolio item; unknown slugs render the 404.
 */
export default async function PortfolioDetailPage({ params }: PortfolioDetailPageProps) {
  const { locale, slug } = await params;
  const content = await findCanonicalPortfolioItem(slug, locale);
  if (!content) notFound();

  const dictionary = getDictionary(locale);
  const chrome = dictionary.portfolio;
  if (!chrome) notFound();

  return (
    <PortfolioDetail
      item={content}
      backHref={`/${locale}/portfolio`}
      backLabel={chrome.backToPortfolio}
      tagsLabel={chrome.tags}
    />
  );
}
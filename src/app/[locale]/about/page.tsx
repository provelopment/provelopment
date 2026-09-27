import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createPageSources } from "@/adapters/content/page-sources";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Section } from "@/components/ui/section";
import { Heading } from "@/components/ui/heading";
import { siteConfig } from "@/config";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";

const localeCodes = siteConfig.locales.map((locale) => locale.code);

/**
 * THE PAGE-SOURCE COMPOSITION for this route's page. `/about` owns its URL, but its
 * SOURCE is authored like every other page: safe Markdown under
 * `content/pages/markdown/<locale>/about.md`, or declarative JSON under
 * `content/pages/json/<locale>/about.json`. A site that authors neither has no
 * About page, and the URL is a proper 404.
 */
const pages = createPageSources({
  defaultLocale: siteConfig.defaultLocale,
  locales: localeCodes,
});

interface PageParams {
  readonly params: Promise<{ readonly locale: string }>;
}

function languageAlternates(): Record<string, string> {
  return buildLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: localeCodes,
    defaultLocale: siteConfig.defaultLocale,
    path: "/about",
  });
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const page = await pages.resolve("about", locale);

  const title = page?.title ?? "About";
  const canonical = `${siteConfig.url}/${locale}/about`;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);

  return {
    title,
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: languageAlternates(),
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

export default async function AboutPage({ params }: PageParams) {
  const { locale } = await params;
  const page = await pages.resolve("about", locale);
  if (!page) notFound();

  return (
    <Section as="article">
      <Heading level={1} tone="title">{page.title}</Heading>
      <div className="mt-6">
        <SafeMarkdownContent markdown={page.body} />
      </div>
    </Section>
  );
}




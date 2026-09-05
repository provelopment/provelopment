import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarkdownContent } from "@/components/site/markdown-content";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const pageContentRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

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
  const content = await pageContentRepository.findBySlug("about", locale);

  const title = content?.title ?? "About";
  const canonical = `${siteConfig.url}/${locale}/about`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

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
  const content = await pageContentRepository.findBySlug("about", locale);

  if (!content) {
    notFound();
  }

  return (
    <Section as="article">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>
    </Section>
  );
}

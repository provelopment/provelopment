import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarkdownContent } from "@/components/site/markdown-content";
import { siteConfig } from "@/config";
import { buildLanguageAlternates } from "@/core/locale";

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

  return {
    title: content?.title ?? "About",
    alternates: {
      canonical: `${siteConfig.url}/${locale}/about`,
      languages: languageAlternates(),
    },
  };
}

export default async function AboutPage({ params }: PageParams) {
  const { locale } = await params;
  const content = await pageContentRepository.findBySlug("about", locale);

  if (!content) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>
    </article>
  );
}
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { MarkdownContent } from "@/components/site/markdown-content";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { isCanonicalLegalSlug, resolveLegalDocs } from "@/core/legal";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const legalRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
  collection: "legal",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface LegalPageProps {
  readonly params: Promise<{ readonly locale: string; readonly slug: string }>;
}

/**
 * Statically generates every exposed legal detail page (each locale × slug
 * present in both the `legal` config block and default-locale content). Any
 * other slug returns a 404 via `dynamicParams`.
 */
export async function generateStaticParams(): Promise<
  { locale: string; slug: string }[]
> {
  const canonicalSlugs = await legalRepository.listSlugs(siteConfig.defaultLocale);
  const legalSlugs = resolveLegalDocs(siteConfig.legal, canonicalSlugs).map(
    (doc) => doc.slug,
  );
  return localeCodes.flatMap((locale) =>
    legalSlugs.map((slug) => ({ locale, slug })),
  );
}

/** Unknown slugs render the 404 instead of being rendered on demand. */
export const dynamicParams = false;

/** The configured entry for a legal slug, or null when not configured. */
function configuredEntry(slug: string) {
  return siteConfig.legal?.find((entry) => entry.slug === slug) ?? null;
}

/** Whether the slug is BOTH configured and canonical (content exists). */
async function isExposedLegal(slug: string): Promise<boolean> {
  if (!configuredEntry(slug)) return false;
  const canonicalSlugs = await legalRepository.listSlugs(siteConfig.defaultLocale);
  return isCanonicalLegalSlug(slug, canonicalSlugs);
}

export async function generateMetadata({
  params,
}: LegalPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!(await isExposedLegal(slug))) return {};

  const content = await legalRepository.findBySlug(slug, locale);
  if (!content) return {};

  const title = content.title;
  const canonical = `${siteConfig.url}/${locale}/legal/${slug}`;
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
        path: `/legal/${slug}`,
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
 * `/legal/[slug]` (Phase D). A legal document is exposed only when it is BOTH:
 *  - in the `legal` config block (config governs exposure), and
 *  - canonical (exists in the default locale — content governs existence).
 * Otherwise it is a proper 404 (no `/legal` index; legal docs are reached from
 * the footer). Rendering uses the same content repository `findBySlug` locale →
 * default fallback as every other collection.
 */
export default async function LegalPage({ params }: LegalPageProps) {
  const { locale, slug } = await params;

  if (!(await isExposedLegal(slug))) {
    notFound();
  }

  const content = await legalRepository.findBySlug(slug, locale);
  if (!content) {
    notFound();
  }

  const dictionary = getDictionary(locale);

  return (
    <Section as="article">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>
      <p className="mt-10 text-sm text-muted-foreground">
        {dictionary.legal.disclaimer}
      </p>
    </Section>
  );
}

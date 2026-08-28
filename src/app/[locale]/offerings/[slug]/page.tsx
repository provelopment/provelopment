import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { MarkdownContent } from "@/components/site/markdown-content";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import type { OfferingsContent } from "@/core/offerings";
import { isCanonicalOffering } from "@/core/offerings";

const offeringsRepository = createFileSystemPageContentRepository<OfferingsContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "offerings",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface OfferingsDetailPageProps {
  readonly params: Promise<{ readonly locale: string; readonly slug: string }>;
}

/**
 * Statically generates every canonical offering detail page (each locale ×
 * canonical slug). Non-canonical slugs return a 404 via `dynamicParams`.
 */
export async function generateStaticParams(): Promise<
  { locale: string; slug: string }[]
> {
  if (!siteConfig.offeringsFeature) return [];

  const canonicalSlugs = await offeringsRepository.listSlugs(siteConfig.defaultLocale);
  return localeCodes.flatMap((locale) =>
    canonicalSlugs.map((slug) => ({ locale, slug })),
  );
}

/** Unknown slugs render the 404 instead of being rendered on demand. */
export const dynamicParams = false;

/** Canonical offering content for `slug`, or null when it should be a 404. */
async function findCanonicalOffering(
  slug: string,
  locale: string,
): Promise<OfferingsContent | null> {
  if (!siteConfig.offeringsFeature) return null;

  const canonicalSlugs = await offeringsRepository.listSlugs(siteConfig.defaultLocale);
  if (!isCanonicalOffering(slug, canonicalSlugs)) return null;

  return offeringsRepository.findBySlug(slug, locale);
}

export async function generateMetadata({
  params,
}: OfferingsDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await findCanonicalOffering(slug, locale);

  if (!content) return {};

  return {
    title: content.title,
    description: content.blurb,
    alternates: {
      canonical: `${siteConfig.url}/${locale}/offerings/${slug}`,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: `/offerings/${slug}`,
      }),
    },
  };
}

/**
 * `/offerings/[slug]` (Phase C). A requested slug is valid only when it is a
 * canonical (default-locale) offering; a locale-only slug (present in a
 * non-default locale but not in the default) is deliberately NOT rendered —
 * otherwise the slug/content relationship would be ambiguous, silently falling
 * back to English for a page that was never canonical. Disabled feature and
 * missing content both yield a proper 404.
 */
export default async function OfferingsDetailPage({
  params,
}: OfferingsDetailPageProps) {
  const { locale, slug } = await params;
  const content = await findCanonicalOffering(slug, locale);

  if (!content) {
    notFound();
  }

  const dictionary = getDictionary(locale);

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      {content.image ? (
        <div className="relative mb-8 h-64 w-full overflow-hidden rounded">
          <Image
            src={content.image}
            alt={content.title}
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{content.blurb}</p>

      {content.price ? (
        <p className="mt-3 text-sm font-medium text-foreground">{content.price}</p>
      ) : null}

      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>

      <p className="mt-10">
        <Link
          href={`/${locale}/offerings`}
          className="text-sm text-primary hover:underline"
        >
          {dictionary.offerings.backToOfferings}
        </Link>
      </p>
    </article>
  );
}
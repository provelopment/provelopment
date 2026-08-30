import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createDirectionLinkResolver } from "@/adapters/maps";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { MarkdownContent } from "@/components/site/markdown-content";
import { ResolvedRegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import { siteConfig } from "@/config";
import { resolveRegionalPageContext } from "@/application/page-context";
import { hasPageEntry, regionalPath, buildRegionalLanguageAlternates } from "@/core/regional-pages";

const pageContentRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
});

// Composition boundary (identical pattern to the app factories): the maps
// factory selects the directions adapter from validated configuration.
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

const localeCodes = siteConfig.locales.map((locale) => locale.code);

/**
 * Phase L — regional content page `/{locale}/{region}/{page}`.
 *
 * Only configured `(locale, region, slug)` combinations are generated
 * (`dynamicParams` → unknown combinations are a proper 404). The content page
 * body reuses the locale's flat content file (`content/pages/{locale}/{slug}.md`,
 * Phase K decision); the region supplies the complete operational identity
 * (timezone/address/contact/hours/holidays/status/directions/JSON-LD).
 */
export const dynamicParams = false;

interface RegionalPageProps {
  readonly params: Promise<{
    readonly locale: string;
    readonly item: string;
    readonly slug: string;
  }>;
}

export async function generateStaticParams(): Promise<
  { locale: string; item: string; slug: string }[]
> {
  return siteConfig.pageBindings
    .filter((binding) => binding.slug !== null)
    .map((binding) => ({
      locale: binding.locale,
      item: binding.region,
      slug: binding.slug as string,
    }));
}

export async function generateMetadata({ params }: RegionalPageProps): Promise<Metadata> {
  const { locale, item, slug } = await params;
  const content = await pageContentRepository.findBySlug(slug, locale);
  if (!content) return {};

  // hreflang only for genuinely existing (locale, region, page) combinations.
  const alternates = buildRegionalLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: localeCodes,
    defaultLocale: siteConfig.defaultLocale,
    entries: siteConfig.pageBindings,
    region: item,
    slug,
  });

  return {
    title: content.title,
    alternates: {
      canonical: `${siteConfig.url}/${regionalPath(locale, item, slug)}`,
      languages: Object.keys(alternates).length > 0 ? alternates : undefined,
    },
  };
}

export default async function RegionalPage({ params }: RegionalPageProps) {
  const { locale, item, slug } = await params;

  // The URL's region segment (`item`) must reference a configured region for
  // this locale; a page without a binding is never rendered here.
  if (!hasPageEntry(siteConfig.pageBindings, locale, item, slug)) {
    notFound();
  }

  const content = await pageContentRepository.findBySlug(slug, locale);
  if (!content) notFound();

  const context = resolveRegionalPageContext(
    { regions: siteConfig.regions },
    locale,
    item,
    slug,
  );
  if (!context.region) notFound();

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>

      <ResolvedRegionBlock
        region={context.region}
        locale={locale}
        directionLinkResolver={directionLinkResolver}
      />
      <RegionStructuredData region={context.region} />
    </article>
  );
}
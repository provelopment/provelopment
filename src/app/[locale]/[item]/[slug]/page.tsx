import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createDirectionLinkResolver } from "@/adapters/maps";
import { createPageSources } from "@/adapters/content/page-sources";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Section } from "@/components/ui/section";
import { Heading } from "@/components/ui/heading";
import { ResolvedRegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import { siteConfig } from "@/config";
import { resolveRegionalPageContext } from "@/application/page-context";
import { hasPageEntry, regionalPath, buildRegionalLanguageAlternates } from "@/core/regional-pages";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";

const localeCodes = siteConfig.locales.map((locale) => locale.code);

/** The page-source composition — the same one the flat page routes use. */
const pages = createPageSources({
  defaultLocale: siteConfig.defaultLocale,
  locales: localeCodes,
});

// Composition boundary (identical pattern to the app factories): the maps
// factory selects the directions adapter from validated configuration.
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

/**
 * Phase L — regional content page `/{locale}/{region}/{page}`.
 *
 * Only configured `(locale, region, slug)` combinations are generated
 * (`dynamicParams` → unknown combinations are a proper 404). The page body is the
 * locale's page source for `{slug}` (safe Markdown or declarative JSON); the region
 * supplies the complete operational identity
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
    .filter((binding) => binding.slug !== null && binding.slug !== "offerings")
    .map((binding) => ({
      locale: binding.locale,
      item: binding.region,
      slug: binding.slug as string,
    }));
}

export async function generateMetadata({ params }: RegionalPageProps): Promise<Metadata> {
  const { locale, item, slug } = await params;
  if (slug === "offerings") return {};
  const page = await pages.resolve(slug, locale);
  if (!page) return {};

  // hreflang only for genuinely existing (locale, region, page) combinations.
  const alternates = buildRegionalLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: localeCodes,
    defaultLocale: siteConfig.defaultLocale,
    entries: siteConfig.pageBindings,
    region: item,
    slug,
  });

  const title = page.title;
  const description = page.description ?? siteConfig.description;
  const canonical = `${siteConfig.url}${regionalPath(locale, item, slug)}`;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: Object.keys(alternates).length > 0 ? alternates : undefined,
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

export default async function RegionalPage({ params }: RegionalPageProps) {
  const { locale, item, slug } = await params;

  // The URL's region segment (`item`) must reference a configured region for
  // this locale; a page without a binding is never rendered here.
  // "offerings" is handled by the dedicated regional offerings route.
  if (slug === "offerings" || !hasPageEntry(siteConfig.pageBindings, locale, item, slug)) {
    notFound();
  }

  const page = await pages.resolve(slug, locale);
  if (!page) notFound();

  const context = resolveRegionalPageContext(
    { regions: siteConfig.regions },
    locale,
    item,
    slug,
  );
  if (!context.region) notFound();

  return (
    <Section as="article">
      <Heading level={1} tone="title">{page.title}</Heading>
      <div className="mt-6">
        <SafeMarkdownContent markdown={page.body} />
      </div>

      <ResolvedRegionBlock
        region={context.region}
        locale={locale}
        directionLinkResolver={directionLinkResolver}
      />
      <RegionStructuredData
        region={context.region}
        canonicalUrl={`${siteConfig.url}/${regionalPath(locale, item, slug)}`}
      />
    </Section>
  );
}




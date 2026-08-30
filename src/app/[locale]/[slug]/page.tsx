import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createDirectionLinkResolver } from "@/adapters/maps";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { MarkdownContent } from "@/components/site/markdown-content";
import { ResolvedRegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import { siteConfig } from "@/config";
import { resolvePageContext } from "@/application/page-context";

const pageContentRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
});

// Composition boundary (identical pattern to the app factories): the maps
// factory selects the directions adapter from validated configuration.
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

/**
 * Content slugs that are served by their own static routes and therefore must
 * never be re-generated here (`about`, `contact`, `resources`). New static
 * page routes, when added, must be listed here too so there is exactly one
 * page architecture: static routes keep precedence; `[slug]` serves the rest.
 */
const STATIC_ROUTE_SLUGS: ReadonlySet<string> = new Set(["about", "contact", "resources"]);

/**
 * Phase K — dynamic content page with an optional operating region.
 *
 * Route ownership: page existence is content-driven (`content/pages/<locale>/<slug>.md`)
 * exactly like the static pages; `business.pages` adds an optional region to a
 * page. A regional page renders its region's complete operational identity
 * (address/contact/timezone/hours/holidays/status/directions/JSON-LD); a
 * non-regional page renders none and never invents one. Pages can therefore
 * exist in one locale without an equivalent in another, and one locale can
 * host several regional pages.
 */
export const dynamicParams = false;

interface RegionalPageProps {
  readonly params: Promise<{ readonly locale: string; readonly slug: string }>;
}

export async function generateStaticParams(): Promise<
  { locale: string; slug: string }[]
> {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of siteConfig.locales) {
    const slugs = await pageContentRepository.listSlugs(locale.code);
    for (const slug of slugs) {
      if (STATIC_ROUTE_SLUGS.has(slug)) continue;
      params.push({ locale: locale.code, slug });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: RegionalPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await pageContentRepository.findBySlug(slug, locale);
  if (!content) return {};

  // hreflang alternates only for locales that actually expose this slug as a
  // regional page (a 404 must never be advertised as an alternate).
  const languages: Record<string, string> = {};
  for (const binding of siteConfig.pageBindings) {
    if (binding.slug === slug) {
      languages[binding.locale] = `${siteConfig.url}/${binding.locale}/${slug}`;
    }
  }
  if (siteConfig.pageBindings.some((b) => b.slug === slug && b.locale === siteConfig.defaultLocale)) {
    languages["x-default"] = `${siteConfig.url}/${siteConfig.defaultLocale}/${slug}`;
  }

  return {
    title: content.title,
    alternates: {
      canonical: `${siteConfig.url}/${locale}/${slug}`,
      languages: Object.keys(languages).length > 0 ? languages : undefined,
    },
  };
}

export default async function RegionalPage({ params }: RegionalPageProps) {
  const { locale, slug } = await params;
  const content = await pageContentRepository.findBySlug(slug, locale);
  if (!content) notFound();

  const { region } = resolvePageContext(
    { regions: siteConfig.regions, pageBindings: siteConfig.pageBindings },
    locale,
    slug,
  );

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
      </div>

      {region ? (
        <>
          <ResolvedRegionBlock
            region={region}
            locale={locale}
            directionLinkResolver={directionLinkResolver}
          />
          <RegionStructuredData region={region} />
        </>
      ) : null}
    </article>
  );
}
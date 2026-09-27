import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createPageSources } from "@/adapters/content/page-sources";
import { createDirectionLinkResolver } from "@/adapters/maps";
import { PageDocumentContent } from "@/components/site/page-document-content";
import { ResolvedRegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { resolveRegionalPageContext } from "@/application/page-context";
import { buildLanguageAlternates } from "@/core/locale";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { pageRoutePath, pageRoutePathSegments } from "@/core/page-route-path";
import {
  buildRegionalLanguageAlternates,
  hasPageEntry,
  regionalPath,
  regionsForLocale,
} from "@/core/regional-pages";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";

/**
 * THE ONE PAGE ROUTE (FOUNDATION-PAGES-A1E)
 * =========================================
 *
 * A page's URL is built from the folders it is authored in, so ONE catch-all route
 * serves every page that is not owned by a dedicated route file:
 *
 *   content/pages/markdown/en/about.md                    → /en/about
 *   content/pages/markdown/en/offerings.md                → /en/offerings
 *   content/pages/markdown/en/offerings/website-design.md → /en/offerings/website-design
 *   content/pages/markdown/en/blog/choosing-a-domain.md   → /en/blog/choosing-a-domain
 *
 * There is no separate route, reader or storage model per kind of content: an
 * offering, an article, a case study, a policy document and an "About" page are all
 * PAGES, resolved by the SAME page-source composition
 * (`@/adapters/content/page-sources`) in the SAME declared order
 * (`@/core/page-source`). The route decides nothing about where a page comes from —
 * it asks, and renders what answered. The home page stays at the locale root
 * (`/{locale}`, see `../page.tsx`), and `/connect` + `/contact` keep their own route
 * files because they carry specialised chrome.
 *
 * WHY `dynamicParams = false`: only routes the build DISCOVERED are served, so an
 * unknown path is a proper 404 rather than a page rendered on demand. Route discovery
 * (`@/core/page-route-path` + the authoring tree) is the one inventory, and the
 * sitemap the routes share.
 *
 * REGIONAL PAGES ARE STILL REGIONAL: when the first segment is a region configured for
 * this locale, the URL keeps the meaning it always had — `/{locale}/{region}` is the
 * landing and `/{locale}/{region}/{page}` a configured regional page — and the
 * region's operational identity (address, hours, status, directions, JSON-LD) is
 * composed exactly as before. Nothing else in a region namespace is served, so a
 * regional URL can never render without its region.
 */
const localeCodes = siteConfig.locales.map((locale) => locale.code);

/** The ONE page-source composition — the same one the home page and the sitemap use. */
const pages = createPageSources({
  defaultLocale: siteConfig.defaultLocale,
  locales: localeCodes,
});

// Composition boundary (identical pattern to the app factories): the maps
// factory selects the directions adapter from validated configuration.
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

/**
 * URL segments owned by their OWN route file. `/connect` and `/contact` carry
 * specialised chrome (the connectivity inventory and the contact form), so this route
 * never generates them — exactly one route owns each URL. Nested pages BELOW them
 * (`/connect/team`) are ordinary pages and are served here.
 */
const DEDICATED_ROUTE_SEGMENTS: ReadonlySet<string> = new Set(["connect", "contact"]);

/** First segments that are never a page route of their own (the home slug). */
const RESERVED_FIRST_SEGMENTS: ReadonlySet<string> = new Set([HOME_CONTENT_SLUG]);

/**
 * Only the routes the build DISCOVERED are served: an unknown path is a proper 404
 * rather than a page rendered on demand, and route discovery stays the one inventory.
 */
export const dynamicParams = false;

/** Whether `segment` is a region landing configured for this locale. */
function isRegionalLanding(locale: string, segment: string): boolean {
  return regionsForLocale(siteConfig.pageBindings, locale).includes(segment);
}

interface PageRouteProps {
  readonly params: Promise<{
    readonly locale: string;
    readonly path: string[];
  }>;
}

/** The canonical route path this URL names, or `null` when it names no page. */
function resolveRoute(path: readonly string[]): string | null {
  return pageRoutePath(...path);
}

/** Every kind of page route this route serves, from the ONE discovered inventory. */
export async function generateStaticParams(): Promise<{ locale: string; path: string[] }[]> {
  const params: { locale: string; path: string[] }[] = [];
  const seen = new Set<string>();
  const add = (locale: string, path: readonly string[]): void => {
    const key = `${locale}/${path.join("/")}`;
    if (seen.has(key)) return;
    seen.add(key);
    params.push({ locale, path: [...path] });
  };

  for (const { code } of siteConfig.locales) {
    const regionalLandings = regionsForLocale(siteConfig.pageBindings, code);

    for (const routePath of await pages.listRoutes(code)) {
      const segments = pageRoutePathSegments(routePath);
      if (segments.length === 0) continue;
      const first = segments[0] as string;
      // The home page is served at the locale root, never at `/{locale}/home`.
      if (segments.length === 1 && RESERVED_FIRST_SEGMENTS.has(first)) continue;
      // A region's landing and pages are generated below, with their region.
      if (segments.length === 1 && regionalLandings.includes(first)) continue;
      // A dedicated route file owns this URL.
      if (segments.length === 1 && DEDICATED_ROUTE_SEGMENTS.has(first)) continue;
      add(code, segments);
    }

    // Regional landings `/{locale}/{region}` (only where configured for this locale).
    for (const region of regionalLandings) add(code, [region]);
    // Regional pages `/{locale}/{region}/{page}` (only configured combinations).
    for (const binding of siteConfig.pageBindings) {
      if (binding.locale === code && binding.slug !== null) {
        add(code, [binding.region, binding.slug]);
      }
    }
  }

  return params;
}

export async function generateMetadata({ params }: PageRouteProps): Promise<Metadata> {
  const { locale, path } = await params;
  const routePath = resolveRoute(path);
  if (routePath === null) return {};

  const page = await pages.resolve(routePath, locale);
  if (!page) return {};

  const title = page.title;
  // An authored page may carry its own summary; a page without one keeps the site's
  // configured description, exactly as every page did before.
  const description = page.description ?? siteConfig.description;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);
  const first = path[0] as string;
  const second = path[1] as string | undefined;

  const regionalLanding = path.length === 1 && isRegionalLanding(locale, first);
  const regionalPage =
    path.length === 2 && hasPageEntry(siteConfig.pageBindings, locale, first, second as string);

  // hreflang only for genuinely existing (locale, region, page) combinations.
  const canonical =
    regionalLanding || regionalPage
      ? `${siteConfig.url}${regionalPath(locale, first, regionalPage ? (second as string) : null)}`
      : `${siteConfig.url}/${locale}/${routePath}`;
  const alternates =
    regionalLanding || regionalPage
      ? buildRegionalLanguageAlternates({
          baseUrl: siteConfig.url,
          locales: localeCodes,
          defaultLocale: siteConfig.defaultLocale,
          entries: siteConfig.pageBindings,
          region: first,
          slug: regionalPage ? (second as string) : null,
        })
      : buildLanguageAlternates({
          baseUrl: siteConfig.url,
          locales: localeCodes,
          defaultLocale: siteConfig.defaultLocale,
          // Content falls back to the default locale, so every configured locale that
          // renders this route path is a valid alternate.
          path: `/${routePath}`,
        });

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

export default async function PageRoute({ params }: PageRouteProps) {
  const { locale, path } = await params;

  // The URL must name a real page route: a traversal attempt, an empty segment, a
  // path that is too deep or a reserved segment resolves to nothing.
  const routePath = resolveRoute(path);
  if (routePath === null) notFound();
  if (path.length === 1 && RESERVED_FIRST_SEGMENTS.has(path[0] as string)) notFound();

  const first = path[0] as string;
  const second = path[1] as string | undefined;
  const regionalLanding = path.length === 1 && isRegionalLanding(locale, first);
  const regionalPage =
    path.length === 2 && hasPageEntry(siteConfig.pageBindings, locale, first, second as string);

  // A URL inside a region's namespace is either the landing or a configured regional
  // page: anything else must not render a page without its region's identity.
  if (isRegionalLanding(locale, first) && !regionalLanding && !regionalPage) notFound();

  const page = await pages.resolve(routePath, locale);
  if (!page) notFound();

  const context = resolveRegionalPageContext(
    { regions: siteConfig.regions },
    locale,
    regionalLanding || regionalPage ? first : null,
    regionalPage ? (second as string) : null,
  );

  return (
    <Section as="article">
      {page.kind === "markdown" ? (
        <>
          <Heading level={1} tone="title">
            {page.title}
          </Heading>
          <div className="mt-6">
            <SafeMarkdownContent markdown={page.body} />
          </div>
        </>
      ) : (
        // The JSON authoring mode's ONE render entry: a validated declarative document
        // becomes a page through the composer, which owns the h1 and the section
        // vocabulary. The route never switches on a section type itself.
        <PageDocumentContent document={page.document} locale={locale} />
      )}

      {context.region ? (
        <>
          <ResolvedRegionBlock
            region={context.region}
            locale={locale}
            directionLinkResolver={directionLinkResolver}
          />
          <RegionStructuredData
            region={context.region}
            canonicalUrl={`${siteConfig.url}${regionalPath(
              locale,
              first,
              regionalPage ? (second as string) : null,
            )}`}
          />
        </>
      ) : null}
    </Section>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createPageSources, type ResolvedPage } from "@/adapters/content/page-sources";
import { createDirectionLinkResolver } from "@/adapters/maps";
import { resolveRegionalPageContext } from "@/application/page-context";
import { PageDocumentContent } from "@/components/site/page-document-content";
import { ResolvedRegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { buildLanguageAlternates } from "@/core/locale";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { pageRoutePathSegments } from "@/core/page-route-path";
import {
  bindingsForSite,
  buildRegionalLanguageAlternates,
  hasPageEntry,
  regionalPath,
  regionsForLocale,
} from "@/core/regional-pages";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";
import {
  resolveSiteRequest,
  sitePath,
  sitePrefixPath,
  siteSetOf,
  type ResolvedSite,
  type SiteRequest,
} from "@/core/site";
import { ConnectPageContent, ContactPageContent, StarterHome } from "./dedicated-pages";

/**
 * THE ONE PAGE ROUTE (FOUNDATION-PAGES-A1E, SITE-SCOPED BY S1)
 * ==========================================================
 *
 * A page's identity is `site + locale + routePath`, and its PUBLIC URL is the content path
 * itself — the site CODE first, then the locale path key:
 *
 *   content/pages/markdown/ca/en/about.md  → /ca/en/about
 *   content/pages/markdown/ca/fr/about.md  → /ca/fr/about
 *   content/pages/markdown/fr/fr/about.md  → /fr/fr/about
 *
 * ONE route serves every page of every site: the URL is resolved to exactly ONE site context
 * (`@/core/site`) and the page composition is then asked for that site alone. There is no route
 * per site, no route per language and no second inventory — an offering, an article, a policy
 * document, an "About" page and a regional (location) page are all PAGES, resolved by the SAME
 * composition in the SAME declared order with the SAME JSON-over-Markdown precedence.
 *
 * WHY `dynamicParams = false`: only the routes the build DISCOVERED are served, so an unknown
 * path, site or locale is a proper 404 rather than a page rendered on demand. Route discovery
 * (the authoring trees + the site configuration) is the one inventory, and the sitemap the
 * routes share.
 *
 * REGIONS (LOCATIONS) KEEP THEIR MEANING and belong to a site: when the first segment is a
 * region configured for this locale IN THIS SITE, `/{locale}/{region}` is the landing and
 * `/{locale}/{region}/{page}` a configured regional page, with the region's operational identity
 * composed exactly as before. Nothing else inside a region namespace is served, and a region's
 * pages still share the site's page tree — which is the point of locations: several offices,
 * ONE page tree.
 */

const routes = createPageSources({ sites: siteConfig.sites });
const siteSet = siteSetOf(siteConfig.sites, siteConfig.defaultSite);
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

/** URLs whose chrome is specialised (`./dedicated-pages`). */
const CONNECT_ROUTE_PATH = "connect";
const CONTACT_ROUTE_PATH = "contact";

interface PageRouteProps {
  readonly params: Promise<{ readonly segments?: string[] }>;
}

/** The site context this URL names, or `null` when it names no site at all. */
function requestOf(segments: readonly string[] | undefined): SiteRequest | null {
  return resolveSiteRequest(siteSet, segments ?? []);
}

/** The region namespace this route path enters, with its page slug, or `null`. */
function regionContextOf(
  site: ResolvedSite,
  locale: string,
  routePath: string,
): { readonly region: string; readonly slug: string | null } | null {
  const bindings = bindingsForSite(siteConfig.pageBindings, site.code);
  const segments = pageRoutePathSegments(routePath);
  const first = segments[0];
  if (first === undefined || !regionsForLocale(bindings, locale).includes(first)) return null;

  if (segments.length === 1) return { region: first, slug: null };
  if (segments.length === 2 && hasPageEntry(bindings, locale, first, segments[1] as string)) {
    return { region: first, slug: segments[1] as string };
  }
  return null;
}

/** Whether the route path ENTERS a region namespace (which must then resolve completely). */
function entersRegionNamespace(site: ResolvedSite, locale: string, routePath: string): boolean {
  const bindings = bindingsForSite(siteConfig.pageBindings, site.code);
  const first = pageRoutePathSegments(routePath)[0];
  return first !== undefined && regionsForLocale(bindings, locale).includes(first);
}


/**
 * Every (site, locale, route) the build discovered, as ONE static-parameter list — the same
 * inventory the sitemap uses, so the two cannot disagree about what exists.
 */
export async function generateStaticParams(): Promise<{ segments: string[] }[]> {
  const params: { segments: string[] }[] = [];
  const seen = new Set<string>();
  const add = (segments: readonly string[]): void => {
    const key = segments.join("/");
    if (seen.has(key)) return;
    seen.add(key);
    params.push({ segments: [...segments] });
  };

  for (const site of siteConfig.sites) {
    // The site CODE is the URL's first segment, always — there is no hidden default site.
    const scope = [site.code];
    const bindings = bindingsForSite(siteConfig.pageBindings, site.code);

    for (const locale of site.locales.map((entry) => entry.path)) {
      // The locale root is always generated: a site either authored its home page or keeps the
      // generic starter homepage, so that URL exists either way.
      add([...scope, locale]);

      const regionalLandings = regionsForLocale(bindings, locale);
      for (const routePath of await routes.listRoutes(site.code, locale)) {
        const segments = pageRoutePathSegments(routePath);
        if (segments.length === 0) continue;
        const first = segments[0] as string;
        // The home page is served at the locale root, never at `/{locale}/home`.
        if (segments.length === 1 && first === HOME_CONTENT_SLUG) continue;
        // A region's landing and pages are generated below, with their region.
        if (segments.length === 1 && regionalLandings.includes(first)) continue;
        add([...scope, locale, ...segments]);
      }

      for (const region of regionalLandings) add([...scope, locale, region]);
      for (const binding of bindings) {
        if (binding.locale === locale && binding.slug !== null) {
          add([...scope, locale, binding.region, binding.slug]);
        }
      }
    }
  }

  return params;
}

/** The site's locales, as an hreflang alternates map for one route path. */
function siteAlternates(site: ResolvedSite, path = ""): Record<string, string> {
  return buildLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: site.locales.map((entry) => entry.path),
    defaultLocale: site.defaultLocale,
    path,
    sitePrefix: sitePrefixPath(site),
  });
}

export async function generateMetadata({ params }: PageRouteProps): Promise<Metadata> {
  const request = requestOf((await params).segments);
  if (request === null) return {};

  const { site, localePath: locale, routePath } = request;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);
  // The OG alternate locales are STANDARDS tags (`fr-CA`), unlike the URL segment.
  const alternateLocales = site.locales
    .filter((entry) => entry.path !== locale)
    .map((entry) => entry.canonical);

  // The locale root: the site's own name and description, whatever answers the page itself.
  if (routePath === "") {
    const canonical = sitePath(site, locale) as string;
    return {
      description: siteConfig.description,
      alternates: { canonical, languages: siteAlternates(site) },
      openGraph: buildOpenGraphData({
        baseUrl: siteConfig.url,
        siteName: siteConfig.name,
        locale,
        title: siteConfig.name,
        fallbackDescription: siteConfig.description,
        url: canonical,
        imageUrl: ogImage,
        alternateLocales,
      }),
      twitter: buildTwitterData({
        title: siteConfig.name,
        fallbackDescription: siteConfig.description,
        imageUrl: ogImage,
      }),
    };
  }

  // A page: its OWN title and (optional) summary decide the metadata.
  const page = await routes.resolve(site.code, routePath, locale);
  if (!page) return {};

  const regional = regionContextOf(site, locale, routePath);
  const canonical = regional
    ? `${siteConfig.url}${regionalPath(locale, regional.region, regional.slug, sitePrefixPath(site))}`
    : `${siteConfig.url}${sitePath(site, locale, routePath) as string}`;
  const alternates = regional
    ? buildRegionalLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: site.locales.map((entry) => entry.path),
        defaultLocale: site.defaultLocale,
        entries: bindingsForSite(siteConfig.pageBindings, site.code),
        region: regional.region,
        slug: regional.slug,
        sitePrefix: sitePrefixPath(site),
      })
    : siteAlternates(site, `/${routePath}`);

  return {
    title: page.title,
    description: page.description ?? siteConfig.description,
    alternates: {
      canonical,
      languages: Object.keys(alternates).length > 0 ? alternates : undefined,
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale,
      title: page.title,
      fallbackDescription: siteConfig.description,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales,
    }),
    twitter: buildTwitterData({
      title: page.title,
      fallbackDescription: siteConfig.description,
      imageUrl: ogImage,
    }),
  };
}


/** The authored page's frame: a Markdown body under its title, or a declarative document. */
function authoredContent(page: ResolvedPage, locale: string) {
  return page.kind === "markdown" ? (
    <>
      <Heading level={1} tone="title">
        {page.title}
      </Heading>
      <div className="mt-6">
        <SafeMarkdownContent markdown={page.body} />
      </div>
    </>
  ) : (
    // The JSON authoring mode's ONE render entry: a validated declarative document becomes a
    // page through the composer, which owns the h1 and the section vocabulary. The route never
    // switches on a section type itself.
    <PageDocumentContent document={page.document} locale={locale} />
  );
}

export default async function PageRoute({ params }: PageRouteProps) {
  const request = requestOf((await params).segments);
  // A path that names no site (or a locale that site does not serve) is not a page: the ONE
  // resolver answers `null`, so the request becomes a 404 — never a guess, never another site.
  if (request === null) notFound();

  const { site, localePath: locale, routePath } = request;

  // A URL inside a region's namespace is either the landing or a configured regional page:
  // anything else must not render a page without its region's identity.
  const regional = regionContextOf(site, locale, routePath);
  if (entersRegionNamespace(site, locale, routePath) && regional === null) notFound();

  // The locale root: an authored home page (either mode) or the generic starter homepage.
  if (routePath === "") {
    const authoredHome = await routes.resolve(site.code, HOME_CONTENT_SLUG, locale);
    return authoredHome ? (
      <Section as="article">{authoredContent(authoredHome, locale)}</Section>
    ) : (
      <StarterHome locale={locale} />
    );
  }

  const page = await routes.resolve(site.code, routePath, locale);
  if (!page) notFound();

  // The two URLs with specialised chrome; their SOURCE is an ordinary page.
  if (routePath === CONNECT_ROUTE_PATH) return <ConnectPageContent locale={locale} page={page} />;
  if (routePath === CONTACT_ROUTE_PATH) return <ContactPageContent locale={locale} page={page} />;

  const context = resolveRegionalPageContext(
    { regions: siteConfig.regions },
    locale,
    regional?.region ?? null,
    regional?.slug ?? null,
  );

  return (
    <Section as="article">
      {authoredContent(page, locale)}

      {context.region && regional ? (
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
              regional.region,
              regional.slug,
              sitePrefixPath(site),
            )}`}
          />
        </>
      ) : null}
    </Section>
  );
}


import { createDirectionLinkResolver } from "@/adapters/maps";
import { createAnalyticsProvider } from "@/adapters/analytics";
import { createPageAvailability } from "@/adapters/content/page-availability";
import { siteSwitchOptions } from "@/application/site-switch";
import { ErrorMessagesProvider } from "@/components/site/error-messages-context";
import { StatusGraphicProvider } from "@/components/site/status-graphic-context";
import { StructuredData } from "@/components/site/structured-data";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config";
import { siteDescriptionForLocale } from "@/config/site-metadata";
import {
  assertConfiguredIconAssetsExist,
  availableBackgroundMap,
  availableBannerPath,
  availableStatusGraphicPath,
  readImageDimensions,
  resolveIconControlUrl,
  runtimeAssetUrl,
} from "@/config/assets";
import { getDictionary } from "@/config/i18n";
import { effectiveSitePageConfig } from "@/config/site-page-config";
import { buildLanguageAlternates } from "@/core/locale";
import {
  DEFAULT_SIDEBAR_CLOSE_ICON,
  DEFAULT_SIDEBAR_OPEN_ICON,
  bottomBarCompositions,
  layoutDataAttributes,
  mobileDisclosureCompositions,
  presentationDataAttributes,
  radiusDataAttribute,
  railCompositions,
  resolveUiConfig,
} from "@/core/ui";
import { pathContextOr, siteHref, sitePrefixPath, siteSetOf } from "@/core/site";
import { ShellEngine } from "@/components/shell";
import { SidebarPreferenceBoot } from "@/components/ui/sidebar-preference-boot";
import { ContextNavLinks } from "@/components/site/context-nav-links";
import { getSiteNavLinks, withSidebarNavIcons } from "@/components/site/nav-links";
import { PageBanner } from "@/components/site/page-banner";
import { PageBackground } from "@/components/site/page-background";
import { configuredRegionIds } from "@/core/regional-pages";
import "../globals.css";

// P6-2D — brand typography (content/assets/branding/branding-schema.md): the brand's primary
// heading/body typeface family is Inter, Plus Jakarta Sans, or Geist Sans;
// Plus Jakarta Sans is the sanctioned brand choice here (the one code-surface
// change CUSTOMIZING.md documents for re-branding fonts). Monospace stays
// Geist Mono — the spec makes no monospace statement.
const brandSans = Plus_Jakarta_Sans({
  variable: "--font-brand-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteSet = siteSetOf(siteConfig.sites, siteConfig.defaultSite);

// UI-04/UI-05/UI-06: the single resolved UI configuration (UI-02) drives the
// shell. The values come from the Foundation canonical presentation defaults
// (`@/core/ui` FOUNDATION_UI_DEFAULTS) plus the site's own explicit config
// leaves — a collapsible sidebar ≥md, a collapsed rail on tablet, a bottom bar
// <md. There is no presentation/profile selection key and no default to inject.
const resolvedUi = resolveUiConfig(siteConfig.ui ?? {});
// P6-1 — every configured UI icon leaf must be backed by a real
// `public/assets/` file (or deliberately ""). Loud at build time (server-only
// layout), so a missing icon can never become a broken-image placeholder on
// the page — and node:fs stays out of the client chunk graph.
assertConfiguredIconAssetsExist(siteConfig);
// UI-07: CTA label/href flow from the resolved contract (adopter-owned;
// `href` added at UI-07 D1). The demo declares label but no href, so the
// engine's existing invariant keeps rendering no CTA (byte-identical demo).

// Phase K: when operating regions are configured, the legacy global business
// block is NOT merged into rendered pages. The layout suppresses the global
// footer NAP + JSON-LD; regional pages render their own region's identity.
const hasRegions = Object.keys(siteConfig.regions).length > 0;

// Composition boundary (the ONLY place providers become concrete): the factories
// select adapters from validated configuration; the layout below renders the
// already-composed integrations without any provider-specific conditional.
const analytics = createAnalyticsProvider(siteConfig.analytics);
const directionLinkResolver = createDirectionLinkResolver(siteConfig.mapsFeature);

/**
 * S1 — the ROOT layout of a SITE-SCOPED URL space: `/{locale}/...` for the default site and
 * `/{sitePrefix}/{locale}/...` for every other site. The layout resolves the request's site
 * and locale from the whole path (the same ONE resolver the page uses), so the document's
 * `lang`, the dictionary, the navigation, the footer and every internal URL belong to ONE
 * site. The path belongs to the page below: an unknown path resolves here to the default
 * site (deterministic, never a guess about another site) and the page decides the 404.
 *
 * Unknown SITES and LOCALES are not rendered on demand: only the (site, locale) combinations
 * the configuration declares are generated, which is what `dynamicParams = false` enforces.
 */
export const dynamicParams = false;

/**
 * Mobile-browser chrome theme colors, mirroring the semantic `--background`
 * token for each scheme (Phase D). Keep in step with the token section of
 * globals.css when re-theming.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { segments } = await params;
  const request = pathContextOr(
    siteSet,
    siteConfig.pageBindings,
    `/${(segments ?? []).join("/")}`,
    siteConfig.defaultSite.defaultLocale,
  );

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: siteConfig.name,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteDescriptionForLocale(siteConfig, request.localePath),
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      ...(siteConfig.assets?.ogImage ? { images: [{ url: siteConfig.assets.ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(siteConfig.assets?.ogImage ? { images: [siteConfig.assets.ogImage] } : {}),
    },
    icons: {
      // P6-3B — SINGLE authoritative favicon declaration. `runtimeAssetUrl`
      // re-derives the same-origin URL of the RUNTIME NAMESPACE that holds the
      // file, so the tab icon always fetches from the current origin (an
      // absolute `site.url` placeholder/mismatch can never 404 the icon) AND a
      // Spoke's own replaceable favicon is served from that Spoke's namespace
      // (S3F1) instead of a platform path that no longer holds it. There is no
      // competing file-based icon route.
      icon: runtimeAssetUrl(siteConfig.assets?.favicon),
    },
    alternates: {
      // S1 — alternates cover THIS site's locales, under the site's own public prefix, so an
      // hreflang link can never point at another site's tree.
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: request.site.locales,
        defaultLocale: request.site.defaultLocale,
        sitePrefix: sitePrefixPath(request.site),
      }),
    },
  };
}

interface LocaleLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly segments?: string[] }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { segments } = await params;
  // The URL decides the site and the locale; an unknown path falls back to the DEFAULT site
  // deterministically (the page below turns it into a 404, so the status page still renders
  // inside the site chrome).
  const request = pathContextOr(
    siteSet,
    siteConfig.pageBindings,
    `/${(segments ?? []).join("/")}`,
    siteConfig.defaultSite.defaultLocale,
  );
  const site = request.site;
  // The chrome works in the locale PATH KEY: it names the content directory (`ca/fr`), the
  // dictionary entry and every URL this layout builds.
  const locale = request.localePath;
  // S1E3 — the shell CTA's DESTINATION belongs to the active site's page tree (a site may point it
  // at its own page), while its presentation stays shared `ui.cta` configuration. An internal
  // destination resolves inside the site+locale exactly like any other navigation href, so a
  // shared `/contact` can never link into another site or 404 on its own site.
  const pageConfig = effectiveSitePageConfig(siteConfig, site.code);
  const ctaHrefSource = pageConfig.ctaHref;
  const ctaHref = ctaHrefSource === undefined ? undefined : siteHref(site, locale, ctaHrefSource);

  // S1E2 — the STANDARDS-FACING tag for the same locale (`fr-CA` for `/ca/fr`): the document's
  // `lang` and every hreflang alternate identify the language, while the URL stays lowercase.
  const localeTag = request.locale;
  const dictionary = getDictionary(locale, site.code);
  const navLinks = getSiteNavLinks(locale, site.code);

  // S1E2 — the Site selector's destinations, resolved ONCE per request by the application rule
  // (same route when the target serves it, else the target's home). A deployment with a single
  // site renders no selector and pays nothing.
  const siteSwitch =
    siteConfig.sites.length > 1
      ? await siteSwitchOptions(
          {
            site,
            localePath: request.localePath,
            // The FULL route path: a region's namespace stays part of the page's path.
            routePath: [request.region, request.routePath].filter(Boolean).join("/"),
          },
          {
            sites: siteConfig.sites,
            bindings: siteConfig.pageBindings,
            availability: createPageAvailability({ sites: siteConfig.sites }),
          },
        )
      : undefined;
  // P5-5 — `navigation.sidebar.mode: "closed"` means the persistent aside rail
  // is not composed (the responsive disclosure/`Show navigation` control remains
  // the way navigation is reached). Distinct from `compact` (rail present,
  // icon-only) and `open`.
  const sidebarClosed = resolvedUi.navigation.sidebar.mode === "closed";
  const sidebarCompact = resolvedUi.navigation.sidebar.mode === "compact";
  // NAV1A — "is a rail composed?" and "is a bottom bar composed?" are properties of EVERY
  // composed layout, not of the default one. A site whose visitor may choose the sidebar
  // layout must compose that layout's rail (≥md) and its mobile drawer (<md) even when the
  // configured default is the menu bar — and vice versa for the sticky bar. The rail/bar
  // structure is then exposed by the stylesheet for the ACTIVE layout only, so exactly one
  // navigation is ever present.
  const usesAside =
    !sidebarClosed &&
    (railCompositions(resolvedUi, "desktop").length > 0 ||
      railCompositions(resolvedUi, "tablet").length > 0);
  const usesBottomBar = bottomBarCompositions(resolvedUi).length > 0;
  // P6-3B/P6-3C — the per-page banner map (page slug → composable banner asset).
  // Only entries whose file actually exists under `public/assets/` survive, so a
  // stale/typo'd banner URL renders NO banner (never a placeholder or a 404).
  // P6-3C — the graphic's INTRINSIC size is read here (server-only) so the
  // renderer can enforce `displayWidth = min(availableWidth, 1.5 × naturalWidth)`
  // without client measurement, upscaling flash, or layout shift.
  const bannerMap = Object.fromEntries(
    Object.entries(siteConfig.assets?.banners ?? {}).flatMap(([page, url]) => {
      const path = availableBannerPath(url);
      if (!path) return [];
      const size = readImageDimensions(path);
      return [[page, { src: path, width: size?.width, height: size?.height }]];
    }),
  );
  const regionIds = configuredRegionIds(siteConfig.regions);
  // P12-BG — the per-page-role background map (page role → resolved decorative
  // graphic). Same availability rule as the banner role: only entries whose file
  // actually exists under `public/assets/` survive, so a CONFIGURED-but-missing
  // background is indistinguishable from an ABSENT one. That is exactly what
  // drives the documented `background-<page>` → `background-all` → none
  // fallback at render time (a missing page-specific graphic falls through to
  // the global one; a missing global one renders no graphic at all). The `all`
  // key is the reserved GLOBAL role.
  // No intrinsic size is read here: the layer is a CSS `background-image` with
  // `cover`, so — unlike a page banner — it needs no dimension/upscale contract.
  const backgroundMap = availableBackgroundMap(siteConfig.assets?.backgrounds);

  // P12-SG — the optional decorative STATUS graphic (`site.assets.statusGraphic`,
  // the `status-graphic` role): ONE global role shared by BOTH status surfaces
  // (`[locale]/error.tsx` and `[locale]/not-found.tsx`). The audit proved those
  // two files render the SAME status frame, so ONE replaceable graphic serves
  // both truthfully — there is deliberately no per-surface variant.
  //
  // Resolved here (server-only) for the same reason the banner map is: the
  // availability read touches `node:fs`, and `[locale]/error.tsx` is a CLIENT
  // component that can never import the resolver. The value is handed to both
  // surfaces through `StatusGraphicProvider`, the same transport the error copy
  // uses. Same availability rule as every other graphic role, so a
  // CONFIGURED-but-missing status graphic is indistinguishable from an ABSENT
  // one → both status pages render no graphic at all.
  //
  // The INTRINSIC size is read here (server-only, cached) so the renderer can
  // emit real `width`/`height` attributes: the browser then reserves the correct
  // aspect-ratio box before the file loads, so the decoration can never cause a
  // layout shift. Undecodable → no attributes; the CSS still never upscales or
  // overflows.
  const statusGraphicPath = availableStatusGraphicPath(siteConfig.assets?.statusGraphic);
  const statusGraphicDimensions = readImageDimensions(statusGraphicPath);
  const statusGraphic = statusGraphicPath
    ? {
        src: statusGraphicPath,
        width: statusGraphicDimensions?.width,
        height: statusGraphicDimensions?.height,
      }
    : undefined;

  // NAV1B — the sidebar's navigation LIST is needed wherever a sidebar composition presents it:
  // the rail (≥md) AND that composition's constrained-width disclosure. `usesAside` still gates the
  // RAIL itself (and its pre-paint preference bridge), so `navigation.sidebar.mode: "closed"`
  // continues to mean "no persistent rail — the disclosure is how navigation is reached", exactly
  // as that leaf documents.
  const sidebarNavContent =
    usesAside || mobileDisclosureCompositions(resolvedUi).length > 0 ? (
      <ContextNavLinks
        locale={locale}
        // P6-3B — every SIDEBAR item gets an expanded/collapsed icon pair (the
        // configured `iconOpen`/`iconClosed`, else the shipped dot/plus defaults).
        links={withSidebarNavIcons(navLinks)}
        className={`space-y-2 ${sidebarCompact ? "ui-nav-mode-compact" : ""}`}
        linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
        // P5-5 — the aside rail orders by configured region (top → middle →
        // bottom), stable within each group; labels stay readable.
        sortByRegion
      />
    ) : undefined;

  const bottomNav = usesBottomBar
    ? {
        label: dictionary.navigation.primaryLabel,
        moreLabel: dictionary.navigation.moreMenu,
        links: navLinks,
        // P6-1 — one vocabulary: the disclosure close control says "Hide navigation".
        closeLabel: dictionary.navigation.hideSidebar,
        // P5-5 — the bottom navigation shares the same three-state menu
        // contract (open | compact | closed) as the top/sidebar menus.
        mode: resolvedUi.navigation.bottom.mode,
        sidebarClose: {
          // P6-1 — icon resolved to the runtime namespace that holds it, or to
          // the shipped default role (never a broken image).
          icon: resolveIconControlUrl(
            resolvedUi.navigation.sidebar.close.icon,
            DEFAULT_SIDEBAR_CLOSE_ICON,
          ),
          text: resolvedUi.navigation.sidebar.close.text,
        },
      }
    : undefined;

  // UI1-A2 — THE PRE-PAINT SIDEBAR BRIDGE, and the ONE hydration tolerance it needs.
  //
  // The rail's open/closed state is the visitor's browser-local preference, so a STATICALLY GENERATED
  // document cannot know it: the server renders the canonical CLOSED rail (which is exactly what keeps
  // every page prerendered — no cookie, session, request-time rendering or middleware enters this), and
  // the browser has to apply the visitor's OPEN preference BEFORE that canonical geometry is painted,
  // otherwise the visitor sees the sidebar appear closed and expand after hydration.
  //
  // So the layout emits one synchronous script — `SidebarPreferenceBoot`, the FIRST element of `<body>`,
  // before any shell markup exists — which reads the SAME contract the runtime reads
  // (`@/components/ui/sidebar-contract`) and marks `<html>` with the visitor's OPEN preference for the boot
  // interval. The
  // stylesheet presents the canonical rail as the OPEN one while that marker is present, and the runtime
  // relinquishes it as soon as a rail represents the resolved preference (see `./sidebar`), so nothing
  // about toggling, navigation or later lifetimes changes.
  //
  // `suppressHydrationWarning` is required, deliberately, and only on `<html>`: the marker is DOM state
  // written between the server's markup and hydration, which is precisely the case React's escape hatch
  // exists for. It is scoped to the `<html>` element itself (React applies it one level deep), so every
  // descendant — the rails included — keeps React's strict hydration comparison; and it is emitted ONLY
  // where a rail is actually composed, so a deployment without one ships no bridge and no tolerance.
  const sidebarPreferenceBridge = usesAside;

  // FS-5 — the configured page/background color flows into the EXISTING
  // design-token system: when `ui.theme.background` is set, we override the
  // `--background` CSS variable on `<html>` (components consume the token via
  // `bg-background`/token utilities; no inline component styles). Absent → the
  // canonical `:root`/dark `--background` tokens render unchanged.
  const htmlStyle = resolvedUi.theme.background
    ? ({ "--background": resolvedUi.theme.background } as React.CSSProperties)
    : undefined;

  // P5-3 — the RESOLVED presentation intent flows into the shared renderer as
  // inert `data-ui-*` attributes on `<html>` (see globals.css — P5-3
  // presentation tokens). These are generalized vocabulary values (never
  // presentation names), so the CSS token layer implements presentation without
  // any identity coupling. Static SSR strings; no hydration risk.
  // P5-5 — the resolved control/menu modes join the same `data-ui-*` surface
  // for the same reason (single observability + test hook, no presentation CSS).
  const htmlPresentationAttrs = {
    ...presentationDataAttributes(resolvedUi.presentation),
    ...radiusDataAttribute(resolvedUi.theme.radius),
    // N2 — the ACTIVE shell layout presentation. Emitted ONLY when the adopter enables
    // the switcher, so a site without it produces byte-identical markup; the client
    // control changes this one attribute (see globals.css — shell layout presentation).
    ...layoutDataAttributes(resolvedUi),
    "data-ui-sidebar-mode": resolvedUi.navigation.sidebar.mode,
    "data-ui-top-mode": resolvedUi.navigation.top.mode,
    "data-ui-bottom-mode": resolvedUi.navigation.bottom.mode,
    "data-ui-cta-state": resolvedUi.cta.state,
  };

  return (
    <html
      lang={localeTag}
      className={`${brandSans.variable} ${geistMono.variable} h-full antialiased`}
      style={htmlStyle}
      suppressHydrationWarning={sidebarPreferenceBridge}
      {...htmlPresentationAttrs}
    >
      <body className="min-h-full flex flex-col">
        {sidebarPreferenceBridge ? <SidebarPreferenceBoot /> : null}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
        >
          {dictionary.a11y.skipToContent}
        </a>
        <PageBackground backgrounds={backgroundMap} regionIds={regionIds} />
        <PageBanner banners={bannerMap} regionIds={regionIds} />
        <ShellEngine
          resolved={resolvedUi}
          header={<SiteHeader locale={locale} resolved={resolvedUi} siteId={site.code} siteSwitch={siteSwitch} />}
          main={
            <ErrorMessagesProvider messages={dictionary.error}>
              <StatusGraphicProvider asset={statusGraphic}>{children}</StatusGraphicProvider>
            </ErrorMessagesProvider>
          }
          footer={<SiteFooter locale={locale} siteId={site.code} directionLinkResolver={directionLinkResolver} />}
          mainId="main"
          mainClassName="flex-1"
          navigationLabel={dictionary.navigation.primaryLabel}
          // P6-1 — the rail disclosure uses the ONE Show/Hide navigation vocabulary
          // (same as the mobile trigger/close); represented by the localized
          // labels + the configured open/close control content (icon screened
          // against public/assets by the framework layer below).
          sidebarLabels={{
            show: dictionary.navigation.showSidebar,
            hide: dictionary.navigation.hideSidebar,
          }}
          sidebarOpen={{
            icon: resolveIconControlUrl(
              resolvedUi.navigation.sidebar.open.icon,
              DEFAULT_SIDEBAR_OPEN_ICON,
            ),
            text: resolvedUi.navigation.sidebar.open.text,
          }}
          sidebarClose={{
            icon: resolveIconControlUrl(
              resolvedUi.navigation.sidebar.close.icon,
              DEFAULT_SIDEBAR_CLOSE_ICON,
            ),
            text: resolvedUi.navigation.sidebar.close.text,
          }}
          asideContent={sidebarNavContent}
          bottomNav={bottomNav}
          locale={locale}
          pageBindings={siteConfig.pageBindings}
          siteSet={siteSet}
          ctaLabel={resolvedUi.cta.label}
          ctaHref={ctaHref}
        />
        {hasRegions ? null : <StructuredData locale={locale} />}
        {analytics}
      </body>
    </html>
  );
}
import { createDirectionLinkResolver } from "@/adapters/maps";
import { createAnalyticsProvider } from "@/adapters/analytics";
import { ErrorMessagesProvider } from "@/components/site/error-messages-context";
import { StructuredData } from "@/components/site/structured-data";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config";
import { assertConfiguredIconAssetsExist, availableIconName } from "@/config/assets";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import {
  presentationDataAttributes,
  radiusDataAttribute,
  resolveShellPattern,
  resolveUiConfig,
} from "@/core/ui";
import { ShellEngine } from "@/components/shell";
import { ContextNavLinks } from "@/components/site/context-nav-links";
import { getSiteNavLinks } from "@/components/site/nav-links";
import { TitleBar } from "@/components/site/title-bar";
import "../globals.css";

// P6-2D — brand typography (branding/branding-schema.md): the brand's primary
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

const localeCodes = siteConfig.locales.map((locale) => locale.code);

// UI-04/UI-05/UI-06: the single resolved UI configuration (UI-02) drives the
// shell. The SHIPPED demo config explicitly selects the classic preset (UI-06)
// and keeps its explicit classic leaves (which repeat the profile), so the
// effective composition stays top-bar ≥md + drawer <md — byte-identical to the
// pre-UI-06 demo. `resolved.preset` == "classic" (truthful personality).
const resolvedUi = resolveUiConfig(siteConfig.ui ?? {});
// P6-1 — every configured UI icon leaf must be backed by a real
// `public/assets/` file (or deliberately ""). Loud at build time (server-only
// layout), so a missing icon can never become a broken-image placeholder on
// the page — and node:fs stays out of the client chunk graph.
assertConfiguredIconAssetsExist(siteConfig);
const shellDecision = resolveShellPattern(resolvedUi);
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

export function generateStaticParams() {
  return siteConfig.locales.map((locale) => ({ locale: locale.code }));
}

/** Unknown locales render the 404 instead of being rendered on demand. */
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

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: siteConfig.name,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.description,
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
      icon: siteConfig.assets?.favicon,
    },
    alternates: {
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
      }),
    },
  };
}

interface LocaleLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const navLinks = getSiteNavLinks(locale);
  // P5-5 — `navigation.sidebar.mode: "closed"` means the persistent aside rail
  // is not composed (the responsive disclosure/`Show Sidebar` control remains
  // the way navigation is reached). Distinct from `compact` (rail present,
  // icon-only) and `open`.
  const sidebarClosed = resolvedUi.navigation.sidebar.mode === "closed";
  const sidebarCompact = resolvedUi.navigation.sidebar.mode === "compact";
  const usesAside =
    !sidebarClosed &&
    (shellDecision.desktop.slot === "aside" || shellDecision.tablet.slot === "aside");
  const usesBottomBar = shellDecision.mobile.primitiveKind === "bottom-bar";

  const asideContent = usesAside ? (
    <ContextNavLinks
      locale={locale}
      links={navLinks}
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
        // P6-1 — one vocabulary: the disclosure close control says "Hide Sidebar".
        closeLabel: dictionary.navigation.hideSidebar,
        // P5-5 — the bottom navigation shares the same three-state menu
        // contract (open | compact | closed) as the top/sidebar menus.
        mode: resolvedUi.navigation.bottom.mode,
        sidebarClose: {
          // P6-1 — icon screened against public/assets (never a broken image).
          icon: availableIconName(resolvedUi.navigation.sidebar.close.icon),
          text: resolvedUi.navigation.sidebar.close.text,
        },
      }
    : undefined;

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
  // preset names), so the CSS token layer implements presentation without any
  // preset identity. Static SSR strings; no hydration risk.
  // P5-5 — the resolved control/menu modes join the same `data-ui-*` surface
  // for the same reason (single observability + test hook, no preset CSS).
  const htmlPresentationAttrs = {
    ...presentationDataAttributes(resolvedUi.presentation),
    ...radiusDataAttribute(resolvedUi.theme.radius),
    "data-ui-sidebar-mode": resolvedUi.navigation.sidebar.mode,
    "data-ui-top-mode": resolvedUi.navigation.top.mode,
    "data-ui-bottom-mode": resolvedUi.navigation.bottom.mode,
    "data-ui-cta-state": resolvedUi.cta.state,
  };

  return (
    <html
      lang={locale}
      className={`${brandSans.variable} ${geistMono.variable} h-full antialiased`}
      style={htmlStyle}
      {...htmlPresentationAttrs}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
        >
          {dictionary.a11y.skipToContent}
        </a>
        <TitleBar />
        <ShellEngine
          resolved={resolvedUi}
          header={<SiteHeader locale={locale} resolved={resolvedUi} />}
          main={
            <ErrorMessagesProvider messages={dictionary.error}>
              {children}
            </ErrorMessagesProvider>
          }
          footer={<SiteFooter locale={locale} directionLinkResolver={directionLinkResolver} />}
          mainId="main"
          mainClassName="flex-1"
          navigationLabel={dictionary.navigation.primaryLabel}
          // P6-1 — the rail disclosure uses the ONE Show/Hide Sidebar vocabulary
          // (same as the mobile trigger/close); represented by the localized
          // labels + the configured open/close control content (icon screened
          // against public/assets by the framework layer below).
          sidebarLabels={{
            show: dictionary.navigation.showSidebar,
            hide: dictionary.navigation.hideSidebar,
          }}
          sidebarOpen={{
            icon: availableIconName(resolvedUi.navigation.sidebar.open.icon),
            text: resolvedUi.navigation.sidebar.open.text,
          }}
          sidebarClose={{
            icon: availableIconName(resolvedUi.navigation.sidebar.close.icon),
            text: resolvedUi.navigation.sidebar.close.text,
          }}
          asideContent={asideContent}
          bottomNav={bottomNav}
          locale={locale}
          pageBindings={siteConfig.pageBindings}
          ctaLabel={resolvedUi.cta.label}
          ctaHref={resolvedUi.cta.href}
        />
        {hasRegions ? null : <StructuredData locale={locale} />}
        {analytics}
      </body>
    </html>
  );
}
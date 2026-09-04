import { createDirectionLinkResolver } from "@/adapters/maps";
import { createAnalyticsProvider } from "@/adapters/analytics";
import { ErrorMessagesProvider } from "@/components/site/error-messages-context";
import { StructuredData } from "@/components/site/structured-data";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import { resolveShellPattern, resolveUiConfig } from "@/core/ui";
import { ShellEngine } from "@/components/shell";
import { ContextNavLinks } from "@/components/site/context-nav-links";
import { getSiteNavLinks } from "@/components/site/nav-links";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
    },
    twitter: {
      card: "summary_large_image",
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
  const usesAside =
    shellDecision.desktop.slot === "aside" || shellDecision.tablet.slot === "aside";
  const usesBottomBar = shellDecision.mobile.primitiveKind === "bottom-bar";

  const asideContent = usesAside ? (
    <ContextNavLinks
      locale={locale}
      links={navLinks}
      className="space-y-2"
      linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
    />
  ) : undefined;

  const bottomNav = usesBottomBar
    ? {
        label: dictionary.navigation.primaryLabel,
        moreLabel: dictionary.navigation.moreMenu,
        links: navLinks,
      }
    : undefined;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
        >
          {dictionary.a11y.skipToContent}
        </a>
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
          sidebarToggleLabel={dictionary.navigation.sidebarToggle}
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
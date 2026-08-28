import { VercelAnalytics } from "@/adapters/analytics/vercel-analytics";
import { ErrorMessagesProvider } from "@/components/site/error-messages-context";
import { StructuredData } from "@/components/site/structured-data";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
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

export function generateStaticParams() {
  return siteConfig.locales.map((locale) => ({ locale: locale.code }));
}

/** Unknown locales render the 404 instead of being rendered on demand. */
export const dynamicParams = false;

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
        <SiteHeader locale={locale} />
        <main id="main" className="flex-1">
          <ErrorMessagesProvider messages={dictionary.error}>
            {children}
          </ErrorMessagesProvider>
        </main>
        <SiteFooter locale={locale} />
        <StructuredData />
        {siteConfig.analytics?.provider === "vercel" ? (
          <VercelAnalytics />
        ) : null}
      </body>
    </html>
  );
}
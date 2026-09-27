import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createPageSources } from "@/adapters/content/page-sources";
import { ContactForm } from "@/components/site/contact-form";
import { Section } from "@/components/ui/section";
import { Heading } from "@/components/ui/heading";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";

const localeCodes = siteConfig.locales.map((locale) => locale.code);

/**
 * THE PAGE-SOURCE COMPOSITION for this route's page. `/contact` owns its URL, but its
 * SOURCE is authored like every other page: safe Markdown under
 * `content/pages/markdown/<locale>/contact.md`, or declarative JSON under
 * `content/pages/json/<locale>/contact.json`.
 */
const pages = createPageSources({
  defaultLocale: siteConfig.defaultLocale,
  locales: localeCodes,
});

interface ContactPageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

function languageAlternates(): Record<string, string> {
  return buildLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: localeCodes,
    defaultLocale: siteConfig.defaultLocale,
    path: "/contact",
  });
}

export async function generateMetadata({ params }: ContactPageProps): Promise<Metadata> {
  const { locale } = await params;
  const page = await pages.resolve("contact", locale);

  const title = page?.title ?? "Contact";
  const canonical = `${siteConfig.url}/${locale}/contact`;
  const ogImage = resolveOgImageUrl(siteConfig.assets?.ogImage, siteConfig.url, locale);

  return {
    title,
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: languageAlternates(),
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

/**
 * `/contact` (Phase B). Content-driven like other pages — the intro body is an
 * ordinary page source (`content/pages/markdown/<locale>/contact.md` or its JSON
 * counterpart, so the sitemap picks the route up automatically) — and the form is
 * config-driven via `features.contact`.
 */
export default async function ContactPage({ params }: ContactPageProps) {
  const { locale } = await params;
  const page = await pages.resolve("contact", locale);
  if (!page) notFound();

  const dictionary = getDictionary(locale);
  const config = siteConfig.contactFeature;
  const demoMode = config?.provider === "stub";

  return (
    <Section as="article">
      <Heading level={1} tone="title">
        {dictionary.contact.heading}
      </Heading>

      {demoMode ? (
        <p className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          {dictionary.contact.demoNotice}
        </p>
      ) : null}

      <div className="mt-6">
        <SafeMarkdownContent markdown={page.body} />
      </div>
      <div className="mt-8">
        <ContactForm
          config={config}
          locale={locale}
          dict={dictionary.contact}
        />
      </div>
    </Section>
  );
}




import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { ContactForm } from "@/components/site/contact-form";
import { Section } from "@/components/ui/section";
import { MarkdownContent } from "@/components/site/markdown-content";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const pageContentRepository = createFileSystemPageContentRepository({
  defaultLocale: siteConfig.defaultLocale,
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

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
  const content = await pageContentRepository.findBySlug("contact", locale);

  const title = content?.title ?? "Contact";
  const canonical = `${siteConfig.url}/${locale}/contact`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

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
 * `/contact` (Phase B). Content-driven like other pages (the intro body comes
 * from `content/pages/<locale>/contact.md`, so the sitemap picks the route up
 * automatically); the form is config-driven via `features.contact`.
 */
export default async function ContactPage({ params }: ContactPageProps) {
  const { locale } = await params;
  const content = await pageContentRepository.findBySlug("contact", locale);

  if (!content) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const config = siteConfig.contactFeature;
  const demoMode = config?.provider === "stub";

  return (
    <Section as="article">
      <h1 className="text-3xl font-bold tracking-tight">
        {dictionary.contact.heading}
      </h1>

      {demoMode ? (
        <p className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          {dictionary.contact.demoNotice}
        </p>
      ) : null}

      <div className="mt-6">
        <MarkdownContent markdown={content.body} />
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

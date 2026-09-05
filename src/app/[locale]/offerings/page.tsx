import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { OfferingList } from "@/components/site/offering-list";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import type { OfferingsContent } from "@/core/offerings";
import { resolveOfferingPrice, sortOfferings } from "@/core/offerings";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const offeringsRepository = createFileSystemPageContentRepository<OfferingsContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "offerings",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface OfferingsPageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

export async function generateMetadata({ params }: OfferingsPageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = getDictionary(locale).offerings.heading;
  const canonical = `${siteConfig.url}/${locale}/offerings`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

  return {
    title,
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: "/offerings",
      }),
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
 * `/offerings` (Phase C). Three independent concerns:
 *  - content (`content/offerings/`) determines which offerings exist;
 *  - `features.offerings` enables/disables the routes (disabled → 404);
 *  - `navigation[]` determines discoverability (config-authoritative).
 */
export default async function OfferingsPage({ params }: OfferingsPageProps) {
  const { locale } = await params;

  // Feature disabled → the offering catalog is not exposed at all. Strongest
  // "capability not enabled" semantics: no placeholder page.
  if (!siteConfig.offeringsFeature) {
    notFound();
  }

  const dictionary = getDictionary(locale);

  // The canonical offering set is the default-locale slugs.
  const canonicalSlugs = await offeringsRepository.listSlugs(siteConfig.defaultLocale);

  if (canonicalSlugs.length === 0) {
    return (
      <Section as="article">
        <h1 className="text-3xl font-bold tracking-tight">
          {dictionary.offerings.heading}
        </h1>
        <p className="mt-4 text-muted-foreground">{dictionary.offerings.emptyState}</p>
      </Section>
    );
  }

  const items = new Array<OfferingsContent>();
  for (const slug of canonicalSlugs) {
    const content = await offeringsRepository.findBySlug(slug, locale);
    if (content) {
      items.push(content);
    }
  }

  const sorted = sortOfferings(items);
  const itemsWithPrices = sorted.map((item) => ({
    ...item,
    price: resolveOfferingPrice(item, null),
  }));

  return (
    <Section as="article">
      <h1 className="text-3xl font-bold tracking-tight">
        {dictionary.offerings.heading}
      </h1>

      <aside
        aria-label={dictionary.offerings.disclaimerTitle}
        className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground"
      >
        <p className="font-semibold text-foreground">{dictionary.offerings.disclaimerTitle}</p>
        <p className="mt-1">{dictionary.offerings.disclaimerBody}</p>
        <p className="mt-2 text-xs text-muted-foreground/90">
          {dictionary.offerings.currencyNotice.replace("{currency}", "USD").replace("{symbol}", "$")}
        </p>
      </aside>

      <OfferingList
        offerings={itemsWithPrices}
        baseHref={`/${locale}/offerings`}
        featuredLabel={dictionary.offerings.featured}
      />
    </Section>
  );
}

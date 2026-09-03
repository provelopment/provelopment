import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { OfferingList } from "@/components/site/offering-list";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { regionDisplayName } from "@/core/display-labels";
import { buildRegionalLanguageAlternates, hasPageEntry } from "@/core/regional-pages";
import type { OfferingsContent } from "@/core/offerings";
import { resolveOfferingPrice, sortOfferings } from "@/core/offerings";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const offeringsRepository = createFileSystemPageContentRepository<OfferingsContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "offerings",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface RegionalOfferingsPageProps {
  readonly params: Promise<{ readonly locale: string; readonly item: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams(): Promise<
  { locale: string; item: string }[]
> {
  if (!siteConfig.offeringsFeature) return [];

  return siteConfig.pageBindings
    .filter((binding) => binding.slug === "offerings")
    .map((binding) => ({
      locale: binding.locale,
      item: binding.region,
    }));
}

export async function generateMetadata({
  params,
}: RegionalOfferingsPageProps): Promise<Metadata> {
  const { locale, item } = await params;
  const region = siteConfig.regions[item];

  if (!region || !hasPageEntry(siteConfig.pageBindings, locale, item, "offerings")) {
    return {};
  }

  const dictionary = getDictionary(locale);
  const regionLabel = regionDisplayName(locale, region);
  const title = `${dictionary.offerings.heading} — ${regionLabel}`;
  const canonical = `${siteConfig.url}/${locale}/${item}/offerings`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

  const alternates = buildRegionalLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: localeCodes,
    defaultLocale: siteConfig.defaultLocale,
    entries: siteConfig.pageBindings,
    region: item,
    slug: "offerings",
  });

  return {
    title,
    description: siteConfig.description,
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

export default async function RegionalOfferingsPage({
  params,
}: RegionalOfferingsPageProps) {
  const { locale, item } = await params;

  if (!siteConfig.offeringsFeature) {
    notFound();
  }

  if (!hasPageEntry(siteConfig.pageBindings, locale, item, "offerings")) {
    notFound();
  }

  const region = siteConfig.regions[item];
  if (!region) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const regionLabel = regionDisplayName(locale, region);

  const canonicalSlugs = await offeringsRepository.listSlugs(siteConfig.defaultLocale);

  if (canonicalSlugs.length === 0) {
    return (
      <article className="mx-auto max-w-page px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">
          {dictionary.offerings.heading}
        </h1>
        <p className="mt-1 text-lg text-muted-foreground">{regionLabel}</p>
        <p className="mt-4 text-muted-foreground">{dictionary.offerings.emptyState}</p>
      </article>
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
  const itemsWithPrices = sorted.map((offering) => ({
    ...offering,
    price: resolveOfferingPrice(offering, region),
  }));

  const currencyCode = region.currency ?? "USD";
  const currencySymbol = region.currencySymbol ?? "$";

  return (
    <article className="mx-auto max-w-page px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        {dictionary.offerings.heading}
      </h1>
      <p className="mt-1 text-lg text-muted-foreground">{regionLabel}</p>

      <aside
        aria-label={dictionary.offerings.disclaimerTitle}
        className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground"
      >
        <p className="font-semibold text-foreground">{dictionary.offerings.disclaimerTitle}</p>
        <p className="mt-1">{dictionary.offerings.disclaimerBody}</p>
        <p className="mt-2 text-xs font-medium text-foreground">
          {dictionary.offerings.currencyNotice
            .replace("{currency}", currencyCode)
            .replace("{symbol}", currencySymbol)}
        </p>
      </aside>

      <OfferingList
        offerings={itemsWithPrices}
        baseHref={`/${locale}/${item}/offerings`}
        featuredLabel={dictionary.offerings.featured}
      />

      <p className="mt-8">
        <Link
          href={`/${locale}/${item}`}
          className="text-sm text-primary hover:underline"
        >
          &larr; {regionLabel}
        </Link>
      </p>
    </article>
  );
}

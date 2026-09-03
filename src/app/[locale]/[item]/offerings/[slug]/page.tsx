import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createBookingActionResolver } from "@/adapters/booking";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { OfferingDetail } from "@/components/site/offering-detail";
import { offeringActionLabel } from "@/components/site/offering-action-label";
import { OfferingStructuredData } from "@/components/site/offering-structured-data";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { resolveBusinessForLocale } from "@/core/business";
import { regionDisplayName } from "@/core/display-labels";
import { buildRegionalLanguageAlternates, hasPageEntry } from "@/core/regional-pages";
import type { OfferingsContent } from "@/core/offerings";
import { isCanonicalOffering, resolveOfferingAction, resolveOfferingPrice } from "@/core/offerings";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const offeringsRepository = createFileSystemPageContentRepository<OfferingsContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "offerings",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

const bookingActionResolver = createBookingActionResolver(siteConfig.bookingFeature);

interface RegionalOfferingsDetailPageProps {
  readonly params: Promise<{ readonly locale: string; readonly item: string; readonly slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams(): Promise<
  { locale: string; item: string; slug: string }[]
> {
  if (!siteConfig.offeringsFeature) return [];

  const canonicalSlugs = await offeringsRepository.listSlugs(siteConfig.defaultLocale);
  const regionalOfferings = siteConfig.pageBindings.filter(
    (binding) => binding.slug === "offerings",
  );

  return regionalOfferings.flatMap((binding) =>
    canonicalSlugs.map((slug) => ({
      locale: binding.locale,
      item: binding.region,
      slug,
    })),
  );
}

async function findCanonicalOffering(
  slug: string,
  locale: string,
): Promise<OfferingsContent | null> {
  if (!siteConfig.offeringsFeature) return null;

  const canonicalSlugs = await offeringsRepository.listSlugs(siteConfig.defaultLocale);
  if (!isCanonicalOffering(slug, canonicalSlugs)) return null;

  return offeringsRepository.findBySlug(slug, locale);
}

export async function generateMetadata({
  params,
}: RegionalOfferingsDetailPageProps): Promise<Metadata> {
  const { locale, item, slug } = await params;
  const region = siteConfig.regions[item];

  if (!region || !hasPageEntry(siteConfig.pageBindings, locale, item, "offerings")) {
    return {};
  }

  const content = await findCanonicalOffering(slug, locale);
  if (!content) return {};

  const regionLabel = regionDisplayName(locale, region);
  const title = `${content.title} — ${regionLabel}`;
  const canonical = `${siteConfig.url}/${locale}/${item}/offerings/${slug}`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

  const alternates = buildRegionalLanguageAlternates({
    baseUrl: siteConfig.url,
    locales: localeCodes,
    defaultLocale: siteConfig.defaultLocale,
    entries: siteConfig.pageBindings,
    region: item,
    slug: `offerings/${slug}`,
  });

  return {
    title,
    description: content.blurb,
    alternates: {
      canonical,
      languages: Object.keys(alternates).length > 0 ? alternates : undefined,
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale,
      title,
      description: content.blurb,
      fallbackDescription: siteConfig.description,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales: localeCodes.filter((code) => code !== locale),
    }),
    twitter: buildTwitterData({
      title,
      description: content.blurb,
      fallbackDescription: siteConfig.description,
      imageUrl: ogImage,
    }),
  };
}

export default async function RegionalOfferingsDetailPage({
  params,
}: RegionalOfferingsDetailPageProps) {
  const { locale, item, slug } = await params;

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

  const content = await findCanonicalOffering(slug, locale);
  if (!content) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const regionLabel = regionDisplayName(locale, region);

  const bookingAction = bookingActionResolver.resolve({ locale });
  const bookingHref = bookingAction.kind === "link" ? bookingAction.href : null;

  const resolvedAction = resolveOfferingAction(content.action, {
    bookingHref,
    contactHref: `/${locale}/${item}/connect`,
  });

  const actionLabel =
    resolvedAction.kind === "link" && content.action
      ? content.action.label?.trim() || offeringActionLabel(content.action.intent, dictionary)
      : null;

  const business = resolveBusinessForLocale(siteConfig.business, locale);

  const offeringWithPrice = {
    ...content,
    price: resolveOfferingPrice(content, region),
  };

  return (
    <>
      <OfferingDetail
        offering={offeringWithPrice}
        action={resolvedAction}
        backHref={`/${locale}/${item}/offerings`}
        labels={{
          deliverablesHeading: dictionary.offerings.deliverables,
          faqHeading: dictionary.offerings.faq,
          featuredBadge: dictionary.offerings.featured,
          actionLabel,
          backToListing: `${dictionary.offerings.backToOfferings} (${regionLabel})`,
          disclaimerTitle: dictionary.offerings.disclaimerTitle,
          disclaimerBody: dictionary.offerings.disclaimerBody,
        }}
      />
      <OfferingStructuredData
        offering={content}
        canonicalUrl={`${siteConfig.url}/${locale}/${item}/offerings/${content.slug}`}
        providerName={region.name ?? business.name ?? siteConfig.name}
        providerType={business.type ?? "Organization"}
      />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createBookingActionResolver } from "@/adapters/booking";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { OfferingDetail } from "@/components/site/offering-detail";
import { offeringActionLabel } from "@/components/site/offering-action-label";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import type { OfferingsContent } from "@/core/offerings";
import { isCanonicalOffering, resolveOfferingAction } from "@/core/offerings";

const offeringsRepository = createFileSystemPageContentRepository<OfferingsContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "offerings",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

// Composition boundary (identical pattern to the home page): the booking
// factory selects the booking adapter from validated configuration.
const bookingActionResolver = createBookingActionResolver(siteConfig.bookingFeature);

interface OfferingsDetailPageProps {
  readonly params: Promise<{ readonly locale: string; readonly slug: string }>;
}

/**
 * Statically generates every canonical offering detail page (each locale ×
 * canonical slug). Non-canonical slugs return a 404 via `dynamicParams`.
 */
export async function generateStaticParams(): Promise<
  { locale: string; slug: string }[]
> {
  if (!siteConfig.offeringsFeature) return [];

  const canonicalSlugs = await offeringsRepository.listSlugs(siteConfig.defaultLocale);
  return localeCodes.flatMap((locale) =>
    canonicalSlugs.map((slug) => ({ locale, slug })),
  );
}

/** Unknown slugs render the 404 instead of being rendered on demand. */
export const dynamicParams = false;

/** Canonical offering content for `slug`, or null when it should be a 404. */
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
}: OfferingsDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await findCanonicalOffering(slug, locale);

  if (!content) return {};

  return {
    title: content.title,
    description: content.blurb,
    alternates: {
      canonical: `${siteConfig.url}/${locale}/offerings/${slug}`,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: `/offerings/${slug}`,
      }),
    },
  };
}

/**
 * `/offerings/[slug]` (Phase C). A requested slug is valid only when it is a
 * canonical (default-locale) offering; a locale-only slug (present in a
 * non-default locale but not in the default) is deliberately NOT rendered —
 * otherwise the slug/content relationship would be ambiguous, silently falling
 * back to English for a page that was never canonical. Disabled feature and
 * missing content both yield a proper 404.
 */
export default async function OfferingsDetailPage({
  params,
}: OfferingsDetailPageProps) {
  const { locale, slug } = await params;
  const content = await findCanonicalOffering(slug, locale);

  if (!content) {
    notFound();
  }

  const dictionary = getDictionary(locale);

  // Composition boundary: resolve the booking seam + the localized internal
  // contact destination, then run the pure core resolver. Core never sees the
  // locale or the booking provider.
  const bookingAction = bookingActionResolver.resolve({ locale });
  const bookingHref = bookingAction.kind === "link" ? bookingAction.href : null;

  const resolvedAction = resolveOfferingAction(content.action, {
    bookingHref,
    contactHref: `/${locale}/contact`,
  });

  // The CTA label is localized at the boundary: an explicit `action.label`
  // override wins, otherwise the intent's dictionary default.
  const actionLabel =
    resolvedAction.kind === "link" && content.action
      ? content.action.label?.trim() || offeringActionLabel(content.action.intent, dictionary)
      : null;

  return (
    <OfferingDetail
      offering={content}
      action={resolvedAction}
      backHref={`/${locale}/offerings`}
      labels={{
        deliverablesHeading: dictionary.offerings.deliverables,
        faqHeading: dictionary.offerings.faq,
        featuredBadge: dictionary.offerings.featured,
        actionLabel,
        backToListing: dictionary.offerings.backToOfferings,
      }}
    />
  );
}
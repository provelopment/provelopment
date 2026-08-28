import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import type { OfferingsContent } from "@/core/offerings";
import { sortOfferings } from "@/core/offerings";

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

  return {
    title: getDictionary(locale).offerings.heading,
    alternates: {
      canonical: `${siteConfig.url}/${locale}/offerings`,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: "/offerings",
      }),
    },
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
      <article className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">
          {dictionary.offerings.heading}
        </h1>
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

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        {dictionary.offerings.heading}
      </h1>

      <ul className="mt-8 grid gap-6 sm:grid-cols-2">
        {sorted.map((offering) => (
          <li key={offering.slug}>
            <Link
              href={`/${locale}/offerings/${offering.slug}`}
              className="block rounded-lg border border-border bg-accent p-6 transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {offering.image ? (
                <div className="relative mb-4 h-40 w-full overflow-hidden rounded">
                  <Image
                    src={offering.image}
                    alt={offering.title}
                    fill
                    sizes="(max-width: 640px) 100vw, 320px"
                    className="object-cover"
                  />
                </div>
              ) : null}
              <h2 className="text-xl font-semibold">{offering.title}</h2>
              <p className="mt-2 text-muted-foreground">{offering.blurb}</p>
              {offering.price ? (
                <p className="mt-3 text-sm font-medium text-foreground">{offering.price}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
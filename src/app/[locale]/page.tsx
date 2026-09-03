import type { Metadata } from "next";

import { createBookingActionResolver } from "@/adapters/booking";
import { BookingAction } from "@/components/site/booking-action";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const localeCodes = siteConfig.locales.map((locale) => locale.code);

// Composition boundary: the factory selects the booking adapter from validated
// configuration. A disabled (or absent) booking feature resolves to `none` and
// the CTA simply does not render.
const bookingActionResolver = createBookingActionResolver(siteConfig.bookingFeature);

interface HomePageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale } = await params;

  const canonical = `${siteConfig.url}/${locale}`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;
  const title = siteConfig.name;

  return {
    // No explicit `title`: the layout default/template renders the site name
    // alone (never "Name | Name").
    description: siteConfig.description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
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

export default async function HomePage({
  params,
}: HomePageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  return (
    <>
      <header className="mx-auto max-w-page px-4 pt-16 pb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          {siteConfig.name}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {dictionary.home.tagline}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {dictionary.home.description}
        </p>
        <div className="mt-6">
          {dictionary.booking?.book ? (
            <BookingAction
              action={bookingActionResolver.resolve({ locale })}
              label={dictionary.booking.book}
            />
          ) : null}
        </div>
      </header>

      <section
        aria-labelledby="home-about-heading"
        className="mx-auto max-w-page px-4 pb-16"
      >
        <div className="rounded-lg border border-border bg-muted p-6">
          <h2 id="home-about-heading" className="text-xl font-semibold">
            {dictionary.sections.about}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {dictionary.home.description}
          </p>
        </div>
      </section>
    </>
  );
}
import type { Metadata } from "next";

import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface HomePageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale } = await params;

  return {
    alternates: {
      canonical: `${siteConfig.url}/${locale}`,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
      }),
    },
  };
}

export default async function HomePage({
  params,
}: HomePageProps) {
  const { locale } = await params;
  const dictionary = getDictionary(locale);

  return (
    <>
      <header className="mx-auto max-w-4xl px-4 pt-16 pb-10">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          {siteConfig.name}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {dictionary.home.tagline}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {dictionary.home.description}
        </p>
      </header>

      <section
        aria-labelledby="home-about-heading"
        className="mx-auto max-w-4xl px-4 pb-16"
      >
        <div className="rounded-lg border border-border bg-accent p-6">
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
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { TestimonialList } from "@/components/site/testimonial-list";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";
import type { TestimonialContent } from "@/core/testimonials";
import { sortTestimonials } from "@/core/testimonials";

const testimonialsRepository = createFileSystemPageContentRepository<TestimonialContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "testimonials",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface TestimonialsPageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

export async function generateMetadata({ params }: TestimonialsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const title = dictionary.testimonials?.heading ?? "Testimonials";
  const canonical = `${siteConfig.url}/${locale}/testimonials`;
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
        path: "/testimonials",
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
 * `/testimonials` (Phase T). Content existence (`content/testimonials/`),
 * exposure toggle (`features.testimonials`), and discoverability
 * (`navigation[]`) are separate concerns, exactly like offerings.
 */
export default async function TestimonialsPage({ params }: TestimonialsPageProps) {
  const { locale } = await params;

  if (!siteConfig.testimonialsFeature) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const chrome = dictionary.testimonials;
  if (!chrome) notFound();

  // The canonical testimonial set is the default-locale slugs.
  const canonicalSlugs = await testimonialsRepository.listSlugs(siteConfig.defaultLocale);

  const items = new Array<TestimonialContent>();
  for (const slug of canonicalSlugs) {
    const content = await testimonialsRepository.findBySlug(slug, locale);
    if (content) {
      items.push(content);
    }
  }

  const sorted = sortTestimonials(items);

  return (
    <Section as="article">
      <h1 className="text-3xl font-bold tracking-tight">{chrome.heading}</h1>
      <div className="mt-8">
        <TestimonialList
          testimonials={sorted}
          emptyLabel={chrome.emptyState}
          featuredLabel={chrome.featured}
          ratingAriaTemplate={chrome.ratingAria}
        />
      </div>
    </Section>
  );
}

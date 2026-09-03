import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { PostDetail } from "@/components/site/post-detail";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import {
  interpolateCount,
  isCanonicalPost,
  isDraft,
  readingTimeMinutes,
} from "@/core/posts";
import type { PostContent } from "@/core/posts";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const postsRepository = createFileSystemPageContentRepository<PostContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "posts",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface BlogPostPageProps {
  readonly params: Promise<{ readonly locale: string; readonly slug: string }>;
}

/** Only PUBLISHED canonical posts are generated — drafts never get a route. */
export async function generateStaticParams(): Promise<{ locale: string; slug: string }[]> {
  if (!siteConfig.blogFeature) return [];
  const canonicalSlugs = await postsRepository.listSlugs(siteConfig.defaultLocale);
  const published = new Array<string>();
  for (const slug of canonicalSlugs) {
    const post = await postsRepository.findBySlug(slug, siteConfig.defaultLocale);
    if (post && !isDraft(post)) {
      published.push(slug);
    }
  }
  return localeCodes.flatMap((locale) => published.map((slug) => ({ locale, slug })));
}

export const dynamicParams = false;

/** Canonical published post for `slug`, or null when it should be a 404. */
async function findPublishedCanonicalPost(
  slug: string,
  locale: string,
): Promise<PostContent | null> {
  if (!siteConfig.blogFeature) return null;
  const canonicalSlugs = await postsRepository.listSlugs(siteConfig.defaultLocale);
  if (!isCanonicalPost(slug, canonicalSlugs)) return null;
  const content = await postsRepository.findBySlug(slug, locale);
  if (!content || isDraft(content)) return null;
  return content;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await findPublishedCanonicalPost(slug, locale);
  if (!content) return {};

  const title = content.title;
  const canonical = `${siteConfig.url}/${locale}/blog/${slug}`;
  const ogImage = `${siteConfig.url}/${locale}/opengraph-image`;

  return {
    title,
    description: content.excerpt,
    alternates: {
      canonical,
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: localeCodes,
        defaultLocale: siteConfig.defaultLocale,
        path: `/blog/${slug}`,
      }),
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale,
      title,
      description: content.excerpt,
      fallbackDescription: siteConfig.description,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales: localeCodes.filter((code) => code !== locale),
    }),
    twitter: buildTwitterData({
      title,
      description: content.excerpt,
      fallbackDescription: siteConfig.description,
      imageUrl: ogImage,
    }),
  };
}

/**
 * `/blog/[slug]` (Phase T). Canonical-slug enforcement matches offerings;
 * drafts are additionally excluded and return the 404.
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { locale, slug } = await params;
  const content = await findPublishedCanonicalPost(slug, locale);
  if (!content) notFound();

  const dictionary = getDictionary(locale);
  const chrome = dictionary.blog;
  if (!chrome) notFound();

  return (
    <PostDetail
      post={content}
      backHref={`/${locale}/blog`}
      backLabel={chrome.backToBlog}
      readingTimeLabel={interpolateCount(
        chrome.readingTime,
        readingTimeMinutes(content.body),
      )}
    />
  );
}
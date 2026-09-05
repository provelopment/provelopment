import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { PostList } from "@/components/site/post-list";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { buildLanguageAlternates } from "@/core/locale";
import { interpolateCount, isDraft, readingTimeMinutes, sortPosts } from "@/core/posts";
import type { PostContent } from "@/core/posts";
import { buildOpenGraphData, buildTwitterData } from "@/core/seo-metadata";

const postsRepository = createFileSystemPageContentRepository<PostContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "posts",
});

const localeCodes = siteConfig.locales.map((locale) => locale.code);

interface BlogPageProps {
  readonly params: Promise<{ readonly locale: string }>;
}

export async function generateMetadata({ params }: BlogPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(locale);
  const title = dictionary.blog?.heading ?? "Blog";
  const canonical = `${siteConfig.url}/${locale}/blog`;
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
        path: "/blog",
      }),
      types: {
        "application/rss+xml": `${siteConfig.url}/${locale}/blog/rss.xml`,
      },
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
 * `/blog` (Phase T). Lists PUBLISHED canonical posts (drafts are excluded),
 * date-descending. Content existence/exposure/discoverability stay separate.
 */
export default async function BlogPage({ params }: BlogPageProps) {
  const { locale } = await params;

  if (!siteConfig.blogFeature) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const chrome = dictionary.blog;
  if (!chrome) notFound();

  const canonicalSlugs = await postsRepository.listSlugs(siteConfig.defaultLocale);

  const posts = new Array<PostContent>();
  for (const slug of canonicalSlugs) {
    const content = await postsRepository.findBySlug(slug, locale);
    if (content && !isDraft(content)) {
      posts.push(content);
    }
  }

  const sorted = sortPosts(posts);

  return (
    <Section as="article">
      <h1 className="text-3xl font-bold tracking-tight">{chrome.heading}</h1>
      <div className="mt-8">
        <PostList
          posts={sorted}
          baseHref={`/${locale}/blog`}
          emptyLabel={chrome.emptyState}
          readingTimeLabelFor={(post) =>
            interpolateCount(chrome.readingTime, readingTimeMinutes(post.body))
          }
        />
      </div>
    </Section>
  );
}

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { siteConfig } from "@/config";
import { buildRssXml, isDraft, sortPosts } from "@/core/posts";
import type { PostContent } from "@/core/posts";

const postsRepository = createFileSystemPageContentRepository<PostContent>({
  defaultLocale: siteConfig.defaultLocale,
  collection: "posts",
});

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return siteConfig.locales.map(({ code }) => ({ locale: code }));
}

interface RssRouteContext {
  readonly params: Promise<{ readonly locale: string }>;
}

/**
 * Per-locale static RSS feed (Phase T). PUBLISHED posts only, fully escaped,
 * deterministic (`buildRssXml`). Statically generated at build time — no
 * request-dependent APIs — so a real `rss.xml` artifact is emitted per locale.
 */
export async function GET(_request: Request, context: RssRouteContext) {
  const { locale } = await context.params;

  const canonicalSlugs = await postsRepository.listSlugs(siteConfig.defaultLocale);
  const posts = new Array<PostContent>();
  for (const slug of canonicalSlugs) {
    const content = await postsRepository.findBySlug(slug, locale);
    if (content && !isDraft(content)) {
      posts.push(content);
    }
  }

  const sorted = sortPosts(posts);

  const xml = buildRssXml({
    feedUrl: `${siteConfig.url}/${locale}/blog/rss.xml`,
    siteUrl: siteConfig.url,
    siteName: siteConfig.name,
    description: siteConfig.description,
    language: locale,
    posts: sorted.map((post) => ({
      title: post.title,
      url: `${siteConfig.url}/${locale}/blog/${post.slug}`,
      description: post.excerpt,
      date: post.date,
      tags: post.tags,
    })),
  });

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
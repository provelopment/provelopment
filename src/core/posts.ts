/**
 * Filesystem blog content model (Phase T, Tier 1).
 *
 * Framework-free and i18n-free. Posts live at `content/posts/<locale>/<slug>.md`;
 * the canonical set is the default-locale slugs. `date` is REQUIRED ISO
 * frontmatter (`YYYY-MM-DD`). `draft: true` posts are excluded COMPLETELY from
 * routes, sitemap, and RSS. Reading time is a pure deterministic heuristic
 * (CJK characters count as one token each; latin words split on whitespace).
 * RSS feed generation is pure XML (`buildRssXml`) so the static per-locale
 * `/blog/rss.xml` route is fully unit-testable.
 */

import type { PageContent } from "./page-content";

/** Latin words per minute used by the reading-time heuristic. */
export const READING_WORDS_PER_MINUTE = 200;

/** ISO date frontmatter pattern (`YYYY-MM-DD`). */
export const POST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PostContent extends PageContent {
  /** Short description shown on cards and in the RSS `<description>`. */
  readonly excerpt: string;
  /** Required ISO date `YYYY-MM-DD` (canonical, presentational formatting is a UI concern). */
  readonly date: string;
  /** Display-only tags (no tag-index routes). */
  readonly tags?: readonly string[];
  /** Site-root-relative asset path under `public/`. */
  readonly image?: string;
  /** When true the post is excluded from routes, sitemap, and RSS. */
  readonly draft?: boolean;
}

export function isDraft(post: Pick<PostContent, "draft">): boolean {
  return post.draft === true;
}

export function isPublishedPost(post: PostContent): boolean {
  return !isDraft(post);
}

export interface SortablePost {
  readonly date: string;
  readonly slug: string;
}

/** Deterministic published order: date descending (newest first), then slug. */
export function comparePosts(a: SortablePost, b: SortablePost): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.slug.localeCompare(b.slug);
}

export function sortPosts<T extends SortablePost>(items: readonly T[]): T[] {
  return [...items].sort(comparePosts);
}

export function isCanonicalPost(slug: string, canonicalSlugs: readonly string[]): boolean {
  return canonicalSlugs.includes(slug);
}

/**
 * Deterministic reading-time heuristic. CJK characters
 * (`[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]`) count as one token
 * each; remaining latin text splits on whitespace. Returns at least 1 minute.
 */
export function readingTimeMinutes(body: string): number {
  const cjkCount = (body.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? [])
    .length;
  const wordCount = body
    .replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const tokens = cjkCount + wordCount;
  return Math.max(1, Math.round(tokens / READING_WORDS_PER_MINUTE));
}

/** Substitutes `{count}` in the localized reading-time template. */
export function interpolateCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

/** Escapes the five XML-significant characters. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 `pubDate` from an ISO `YYYY-MM-DD` date (deterministic). */
export function toRfc822Date(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

export interface RssPostItem {
  readonly title: string;
  readonly url: string;
  readonly description: string;
  readonly date: string;
  readonly tags?: readonly string[];
}

export interface RssFeedOptions {
  readonly feedUrl: string;
  readonly siteUrl: string;
  readonly siteName: string;
  readonly description: string;
  readonly language: string;
  readonly posts: readonly RssPostItem[];
}

function buildRssItemXml(item: RssPostItem): string {
  const tags =
    item.tags && item.tags.length > 0 ? `<category>${escapeXml(item.tags[0])}</category>` : "";
  return [
    "    <item>",
    `      <title>${escapeXml(item.title)}</title>`,
    `      <link>${escapeXml(item.url)}</link>`,
    `      <guid>${escapeXml(item.url)}</guid>`,
    `      <pubDate>${toRfc822Date(item.date)}</pubDate>`,
    `      <description>${escapeXml(item.description)}</description>`,
    tags,
    "    </item>",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Builds a complete RSS 2.0 document deterministically. The caller supplies
 * only PUBLISHED posts; this builder never filters (filters-as-data keeps the
 * pure contract single-purpose). `lastBuildDate` derives from the newest post's
 * date so the output is fully deterministic. Description is the excerpt only —
 * no full HTML bodies. No CMS/SEO architecture: RSS is part of the publishing
 * primitive.
 */
export function buildRssXml(options: RssFeedOptions): string {
  const items = options.posts.map(buildRssItemXml).join("\n");
  const newestDate = options.posts.reduce<string | null>((newest, post) => {
    if (newest === null || post.date > newest) return post.date;
    return newest;
  }, null);
  const lastBuildDate = newestDate ? toRfc822Date(newestDate) : toRfc822Date("2026-01-01");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(options.siteName)}</title>`,
    `    <link>${escapeXml(options.siteUrl)}</link>`,
    `    <description>${escapeXml(options.description)}</description>`,
    `    <language>${escapeXml(options.language)}</language>`,
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
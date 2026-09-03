import { describe, expect, it } from "vitest";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { parsePostFile } from "@/adapters/content/frontmatter";
import { siteConfig } from "@/config";
import {
  buildRssXml,
  escapeXml,
  isCanonicalPost,
  isDraft,
  interpolateCount,
  readingTimeMinutes,
  sortPosts,
  toRfc822Date,
} from "@/core/posts";
import type { PostContent } from "@/core/posts";

const defaultLocale = siteConfig.defaultLocale;

const repository = createFileSystemPageContentRepository<PostContent>({
  defaultLocale,
  collection: "posts",
});

function postFile(overrides: Record<string, unknown> = {}) {
  const base = {
    title: '"Demo post"',
    excerpt: '"A demo excerpt."',
    date: '"2026-08-20"',
  };
  const frontmatter = Object.entries({ ...base, ...overrides })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${frontmatter}\n---\nBody.\n`;
}

describe("parsePostFile (Phase T)", () => {
  it("parses a valid published post", () => {
    const content = parsePostFile(
      [
        "---",
        'title: "Demo post"',
        'excerpt: "A demo excerpt."',
        'date: "2026-08-20"',
        "tags:",
        '  - "Launch"',
        "draft: false",
        'image: "/x.jpg"',
        "---",
        "Body.",
      ].join("\n"),
      "launch-checklist",
      "en",
    );
    expect(content.title).toBe("Demo post");
    expect(content.excerpt).toBe("A demo excerpt.");
    expect(content.date).toBe("2026-08-20");
    expect(content.tags).toEqual(["Launch"]);
    expect(content.draft).toBe(false);
    expect(content.image).toBe("/x.jpg");
  });

  it("requires title, excerpt, and an ISO date", () => {
    expect(() => parsePostFile(postFile({ title: undefined }), "x", "en")).toThrow(/title/);
    expect(() => parsePostFile(postFile({ excerpt: undefined }), "x", "en")).toThrow(/excerpt/);
    expect(() => parsePostFile(postFile({ date: '"2026/08/20"' }), "x", "en")).toThrow(/date/);
    expect(() => parsePostFile(postFile({ date: undefined }), "x", "en")).toThrow(/date/);
  });
});

describe("post core helpers (Phase T)", () => {
  it("sorts published posts date-descending, then slug", () => {
    const sorted = sortPosts([
      { date: "2026-08-15", slug: "getting-started" },
      { date: "2026-08-20", slug: "launch-checklist" },
      { date: "2026-08-20", slug: "another" },
    ]);
    expect(sorted.map((item) => item.slug)).toEqual(["another", "launch-checklist", "getting-started"]);
  });

  it("flags drafts and enforces canonical slugs", () => {
    expect(isDraft({ draft: true })).toBe(true);
    expect(isDraft({ draft: false })).toBe(false);
    expect(isCanonicalPost("getting-started", ["getting-started", "post-draft"])).toBe(true);
    expect(isCanonicalPost("other", ["getting-started"])).toBe(false);
  });

  it("reading time is deterministic and CJK-aware", () => {
    // ~400 latin words → ~2 minutes; never below 1.
    expect(readingTimeMinutes("word ".repeat(400))).toBe(2);
    expect(readingTimeMinutes("a short line")).toBe(1);
    // 400 CJK characters count as 400 tokens → ~2 minutes.
    expect(readingTimeMinutes("日".repeat(400))).toBe(2);
  });

  it("interpolates the localized count template", () => {
    expect(interpolateCount("{count} min read", 2)).toBe("2 min read");
  });

  it("renders RFC 822 dates deterministically", () => {
    expect(toRfc822Date("2026-08-20")).toBe("Thu, 20 Aug 2026 00:00:00 GMT");
  });
});

describe("demo inventory (locked: 3 canonical files, 2 published)", () => {
  it("lists exactly the locked canonical slugs", async () => {
    const slugs = await repository.listSlugs(defaultLocale);
    expect(slugs.sort()).toEqual(["getting-started", "launch-checklist", "post-draft"]);
  });

  it("marks the draft and serves the localized ja post", async () => {
    const draft = await repository.findBySlug("post-draft", defaultLocale);
    expect(draft?.draft).toBe(true);

    const ja = await repository.findBySlug("getting-started", "ja");
    expect(ja?.locale).toBe("ja");
  });
});
describe("RSS XML (Phase T)", () => {
  const feedOptions = {
    feedUrl: "https://example.com/en/blog/rss.xml",
    siteUrl: "https://example.com",
    siteName: "Your Business Site",
    description: "The site description",
    language: "en",
  };

  it("escapes the five XML-significant characters", () => {
    expect(escapeXml(`<a href="x" & 'y'>`)).toBe("&lt;a href=&quot;x&quot; &amp; &apos;y&apos;&gt;");
  });

  it("builds a well-formed feed with published posts only, ordered newest-first", () => {
    const xml = buildRssXml({
      ...feedOptions,
      posts: [
        {
          title: "A launch checklist for your new site",
          url: "https://example.com/en/blog/launch-checklist",
          description: "The excerpt",
          date: "2026-08-20",
        },
        {
          title: "Getting started with the Foundation template",
          url: "https://example.com/en/blog/getting-started",
          description: "Another excerpt",
          date: "2026-08-15",
        },
      ],
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<language>en</language>");
    const first = xml.indexOf("launch-checklist");
    const second = xml.indexOf("getting-started");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first); // newest first
    expect(xml).toContain("<pubDate>Thu, 20 Aug 2026 00:00:00 GMT</pubDate>");
    // Description is the excerpt, never the full body.
    expect(xml).not.toContain("<description>Body");
  });

  it("escapes titles/descriptions so content can never break XML", () => {
    const xml = buildRssXml({
      ...feedOptions,
      siteName: "A & B",
      description: "Quotes \" and apostrophes '",
      posts: [
        {
          title: "5 < 6 & \"fun\"",
          url: "https://example.com/en/blog/x",
          description: "It's here",
          date: "2026-08-20",
        },
      ],
    });
    expect(xml).toContain("A &amp; B");
    expect(xml).toContain("5 &lt; 6 &amp; &quot;fun&quot;");
  });

  it("derives a deterministic lastBuildDate from the newest post", () => {
    const xml = buildRssXml({
      ...feedOptions,
      language: "en",
      posts: [
        { title: "y", url: "https://example.com/en/blog/y", description: "d", date: "2026-08-15" },
        { title: "x", url: "https://example.com/en/blog/x", description: "d", date: "2026-08-20" },
      ],
    });
    expect(xml).toContain("<lastBuildDate>Thu, 20 Aug 2026 00:00:00 GMT</lastBuildDate>");
  });
});
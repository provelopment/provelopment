import { describe, expect, it } from "vitest";

import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { parsePortfolioFile } from "@/adapters/content/frontmatter";
import { siteConfig } from "@/config";
import { sortPortfolio, isCanonicalPortfolioItem } from "@/core/portfolio";
import type { PortfolioItem } from "@/core/portfolio";

const defaultLocale = siteConfig.defaultLocale;

const repository = createFileSystemPageContentRepository<PortfolioItem>({
  defaultLocale,
  collection: "portfolio",
});

function portfolioFile(overrides: Record<string, unknown> = {}) {
  const base = {
    title: '"Demo project"',
    summary: '"A template summary."',
  };
  const frontmatter = Object.entries({ ...base, ...overrides })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${frontmatter}\n---\nBody.\n`;
}

describe("parsePortfolioFile (Phase T)", () => {
  it("parses a valid item including a tags list", () => {
    const content = parsePortfolioFile(
      [
        "---",
        'title: "Demo project"',
        'summary: "A template summary."',
        "year: 2026",
        "featured: true",
        "order: 1",
        'image: "/images/portfolio/x.jpg"',
        "tags:",
        '  - "Branding"',
        '  - "Web"',
        "---",
        "Body.",
      ].join("\n"),
      "brand-refresh",
      "en",
    );

    expect(content.title).toBe("Demo project");
    expect(content.summary).toBe("A template summary.");
    expect(content.year).toBe(2026);
    expect(content.featured).toBe(true);
    expect(content.order).toBe(1);
    expect(content.image).toBe("/images/portfolio/x.jpg");
    expect(content.tags).toEqual(["Branding", "Web"]);
    expect(content.body).toBe("Body.");
  });

  it("requires title and summary", () => {
    expect(() => parsePortfolioFile(portfolioFile({ title: undefined }), "x", "en")).toThrow(
      /title/,
    );
    expect(() => parsePortfolioFile(portfolioFile({ summary: undefined }), "x", "en")).toThrow(
      /summary/,
    );
  });

  it("rejects a malformed tags list loudly", () => {
    expect(() => parsePortfolioFile(portfolioFile({ tags: ["ok", ""] }), "x", "en")).toThrow(
      /tags/,
    );
  });
});

describe("portfolio core helpers (Phase T)", () => {
  it("sorts by order ascending then slug", () => {
    const sorted = sortPortfolio([
      { slug: "z", order: 1 },
      { slug: "a", order: 2 },
      { slug: "b" },
    ]);
    expect(sorted.map((item) => item.slug)).toEqual(["z", "a", "b"]);
  });

  it("enforces canonical slugs", () => {
    expect(isCanonicalPortfolioItem("brand-refresh", ["brand-refresh", "digital-presence"])).toBe(
      true,
    );
    expect(isCanonicalPortfolioItem("other", ["brand-refresh"])).toBe(false);
  });
});

describe("demo inventory (locked: 2 canonical portfolio items)", () => {
  it("lists exactly the locked canonical slugs", async () => {
    const slugs = await repository.listSlugs(defaultLocale);
    expect(slugs.sort()).toEqual(["brand-refresh", "digital-presence"]);
  });

  it("serves the localized featured variant in ja and falls back to en elsewhere", async () => {
    const ja = await repository.findBySlug("brand-refresh", "ja");
    expect(ja?.locale).toBe("ja");

    const es = await repository.findBySlug("brand-refresh", "es");
    expect(es?.locale).toBe(defaultLocale);
  });
});
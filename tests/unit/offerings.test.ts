import { describe, expect, it } from "vitest";

import {
  createFileSystemPageContentRepository,
} from "@/adapters/content/fs-page-content-repository";
import { parseOfferingsFile, parsePageFile } from "@/adapters/content/frontmatter";
import { buildSitemapRoutes } from "@/application/route-discovery";
import {
  isCanonicalOffering,
  sortOfferings,
  type OfferingsListItem,
} from "@/core/offerings";

describe("parseOfferingsFile (frontmatter contract)", () => {
  const raw = `---
title: "Web design"
blurb: "A short one-liner."
order: 1
price: "From $180"
featured: true
image: "/images/offerings/web-design.jpg"
---
Body here.
`;

  it("parses title, blurb and optional presentation fields", () => {
    const parsed = parseOfferingsFile(raw, "web-design", "en");
    expect(parsed).toMatchObject({
      slug: "web-design",
      locale: "en",
      title: "Web design",
      blurb: "A short one-liner.",
      order: 1,
      price: "From $180",
      featured: true,
      image: "/images/offerings/web-design.jpg",
      body: "Body here.\n",
    });
  });

  it("treats price strictly as a display-only string (no currency semantics)", () => {
    const parsed = parseOfferingsFile(raw, "web-design", "en");
    expect(typeof parsed.price).toBe("string");
    expect(parsed.price).toBe("From $180");
  });

  it("requires title and blurb (fail-fast)", () => {
    expect(() =>
      parseOfferingsFile("---\ntitle: Only a title\n---\n", "x", "en"),
    ).toThrow(/blurb/);
    expect(() =>
      parseOfferingsFile("---\nblurb: Only a blurb\n---\n", "x", "en"),
    ).toThrow(/title/);
  });

  it("leaves optional fields undefined when omitted", () => {
    const parsed = parseOfferingsFile(
      "---\ntitle: Plain\nblurb: Just this\n---\nBody\n",
      "plain",
      "en",
    );
    expect(parsed.order).toBeUndefined();
    expect(parsed.price).toBeUndefined();
    expect(parsed.featured).toBeUndefined();
    expect(parsed.image).toBeUndefined();
  });
});

describe("sortOfferings (listing order)", () => {
  const item = (overrides: Partial<OfferingsListItem>): OfferingsListItem => ({
    slug: "x",
    title: "X",
    blurb: "…",
    ...overrides,
  });

  it("puts featured first, then order ascending, then slug tiebreak", () => {
    const sorted = sortOfferings([
      item({ slug: "b", order: 1 }),
      item({ slug: "a", order: 1 }),
      item({ slug: "feat", featured: true, order: 5 }),
      item({ slug: "nolimit" }),
    ]);

    expect(sorted.map((i) => i.slug)).toEqual(["feat", "a", "b", "nolimit"]);
  });

  it("handles an empty list and is stable", () => {
    expect(sortOfferings([])).toEqual([]);
  });
});

describe("isCanonicalOffering (default-locale slug membership)", () => {
  const canonical = ["consultation", "gift-card", "starter-package"];

  it("accepts a canonical slug", () => {
    expect(isCanonicalOffering("consultation", canonical)).toBe(true);
  });

  it("rejects a locale-only / unknown slug", () => {
    expect(isCanonicalOffering("ghost", canonical)).toBe(false);
  });
});

describe("offerings repository (reuses PageContentRepository + fs adapter)", () => {
  const repository = createFileSystemPageContentRepository({
    defaultLocale: "en",
    collection: "offerings",
  });

  it("lists the canonical (default-locale) offering slugs", async () => {
    const slugs = await repository.listSlugs("en");
    expect(slugs).toEqual(["consultation", "gift-card", "starter-package"]);
  });

  it("finds a default-locale offering with its offering fields", async () => {
    const content = await repository.findBySlug("consultation", "en");
    expect(content?.title).toBe("Consultation");
    expect((content as { blurb?: string } | null)?.blurb).toBeTruthy();
  });

  it("falls back to the default locale content when a translation is missing", async () => {
    const content = await repository.findBySlug("consultation", "fr");
    expect(content?.locale).toBe("en");
    expect(content?.title).toBe("Consultation");
  });

  it("returns null for unknown slugs", async () => {
    expect(await repository.findBySlug("does-not-exist", "en")).toBeNull();
  });
});

describe("buildSitemapRoutes (content-driven, feature-gated)", () => {
  const pages = ["about", "contact", "resources"];
  const canonicalOfferings = ["consultation", "gift-card", "starter-package"];

  it("includes page routes and, when enabled, the offerings listing + details", () => {
    const routes = buildSitemapRoutes({ offeringsEnabled: true, pages, canonicalOfferings });
    expect(routes).toEqual([
      "",
      "/about",
      "/contact",
      "/resources",
      "/offerings",
      "/offerings/consultation",
      "/offerings/gift-card",
      "/offerings/starter-package",
    ]);
  });

  it("omits offering routes entirely when the feature is disabled", () => {
    const routes = buildSitemapRoutes({ offeringsEnabled: false, pages, canonicalOfferings });
    expect(routes).not.toContain("/offerings");
    expect(routes).toEqual(["", "/about", "/contact", "/resources"]);
  });

  it("still includes the empty listing route when enabled with no offerings", () => {
    const routes = buildSitemapRoutes({ offeringsEnabled: true, pages, canonicalOfferings: [] });
    expect(routes).toContain("/offerings");
    expect(routes).not.toContain("/offerings/");
  });
});

// Safety: the shared frontmatter path still parses plain pages (title-only).
describe("parsePageFile (unchanged page contract)", () => {
  it("parses a title-only page", () => {
    const page = parsePageFile("---\ntitle: About Us\n---\nBody\n", "about-us", "en");
    expect(page).toMatchObject({ slug: "about-us", title: "About Us", body: "Body\n" });
  });
});
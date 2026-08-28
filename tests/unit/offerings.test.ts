import { describe, expect, it } from "vitest";

import {
  createFileSystemPageContentRepository,
} from "@/adapters/content/fs-page-content-repository";
import { parseOfferingsFile, parsePageFile } from "@/adapters/content/frontmatter";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import {
  isCanonicalOffering,
  sortOfferings,
  type OfferingsListItem,
} from "@/core/offerings";

const defaultLocale = siteConfig.defaultLocale;

/** A locale code guaranteed not to be configured (exercises documented fallback). */
const unconfiguredLocale = "zz";

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
  const repository = createFileSystemPageContentRepository<{
    slug: string;
    locale: string;
    title: string;
    body: string;
    blurb?: string;
    price?: string;
    order?: number;
    featured?: boolean;
    image?: string;
  }>({
    defaultLocale,
    collection: "offerings",
  });

  it("lists the canonical (default-locale) offering slugs", async () => {
    const slugs = await repository.listSlugs(defaultLocale);
    expect(slugs).toEqual(["consultation", "gift-card", "starter-package"]);
  });

  it("finds a default-locale offering with its offering fields", async () => {
    const content = await repository.findBySlug("consultation", defaultLocale);
    expect(content?.title).toBe("Consultation");
    expect((content as { blurb?: string } | null)?.blurb).toBeTruthy();
  });

  it("falls back to the default locale content when a translation is missing", async () => {
    // A locale with no localization (e.g. an adopter locale) still resolves
    // via the repository's locale → default fallback; the canonical offering
    // is served.
    const content = await repository.findBySlug("consultation", unconfiguredLocale);
    expect(content?.locale).toBe(defaultLocale);
    expect(content?.title).toBe("Consultation");
  });

  it("serves the localized offering when the locale file exists", async () => {
    // Expected localized titles per locale (French legitimately uses
    // "Consultation", the same word — body/blurb still localized).
    const localizedTitles: Record<string, Record<string, string>> = {
      es: { consultation: "Consulta", "gift-card": "Tarjeta de regalo", "starter-package": "Paquete inicial" },
      fr: { consultation: "Consultation", "gift-card": "Carte cadeau", "starter-package": "Pack de démarrage" },
      de: { consultation: "Beratung", "gift-card": "Geschenkgutschein", "starter-package": "Startpaket" },
      ja: { consultation: "相談", "gift-card": "ギフトカード", "starter-package": "スタートパッケージ" },
      zh: { consultation: "咨询", "gift-card": "礼品卡", "starter-package": "入门套餐" },
      ko: { consultation: "상담", "gift-card": "선물 카드", "starter-package": "스타터 패키지" },
      id: { consultation: "Konsultasi", "gift-card": "Kartu hadiah", "starter-package": "Paket pemula" },
    };

    for (const [locale, titlesBySlug] of Object.entries(localizedTitles)) {
      for (const [slug, expectedTitle] of Object.entries(titlesBySlug)) {
        const content = await repository.findBySlug(slug, locale);
        expect(content).not.toBeNull();
        // The locale-specific file wins over the default-locale fallback.
        expect(content?.locale).toBe(locale);
        expect(content?.title).toBe(expectedTitle);
        // A localized blurb is present, too.
        expect((content as { blurb?: string } | null)?.blurb).toBeTruthy();
      }
    }
  });

  it("returns null for unknown slugs", async () => {
    expect(await repository.findBySlug("does-not-exist", defaultLocale)).toBeNull();
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
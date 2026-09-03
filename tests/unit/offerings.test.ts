import { describe, expect, it } from "vitest";

import {
  createFileSystemPageContentRepository,
} from "@/adapters/content/fs-page-content-repository";
import { parseOfferingsFile, parsePageFile } from "@/adapters/content/frontmatter";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import {
  isCanonicalOffering,
  parseDisplayPrice,
  resolveOfferingAction,
  resolveOfferingPrice,
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

  it("parses Phase C structured fields (deliverables, faq, action)", () => {
    const raw = `---
title: "Starter"
blurb: "A blurb."
deliverables:
  - "One"
  - "Two"
faq:
  - question: "Q1?"
    answer: "A1."
  - question: "Q2?"
    answer: "A2."
action:
  intent: external
  label: "View details"
  href: "https://example.com/offerings/starter"
---
Body
`;
    const parsed = parseOfferingsFile(raw, "starter", "en");
    expect(parsed.deliverables).toEqual(["One", "Two"]);
    expect(parsed.faq).toEqual([
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
    ]);
    expect(parsed.action).toEqual({
      intent: "external",
      label: "View details",
      href: "https://example.com/offerings/starter",
    });
    expect(parsed.body).toBe("Body\n");
  });

  it("keeps book/contact actions shallow (no href allowed)", () => {
    const parsed = parseOfferingsFile(
      "---\ntitle: X\nblurb: Y\naction:\n  intent: book\n---\nB\n",
      "x",
      "en",
    );
    expect(parsed.action).toEqual({ intent: "book" });
  });

  it("rejects external actions without a href", () => {
    expect(() =>
      parseOfferingsFile(
        "---\ntitle: X\nblurb: Y\naction:\n  intent: external\n---\nB\n",
        "x",
        "en",
      ),
    ).toThrow(/href/);
  });

  it("rejects an action href on book/contact intents (platform resolves those)", () => {
    expect(() =>
      parseOfferingsFile(
        "---\ntitle: X\nblurb: Y\naction:\n  intent: contact\n  href: \"https://example.com\"\n---\nB\n",
        "x",
        "en",
      ),
    ).toThrow(/must not define its own href/);
  });

  it("rejects unsupported action intents", () => {
    expect(() =>
      parseOfferingsFile(
        "---\ntitle: X\nblurb: Y\naction:\n  intent: buy\n---\nB\n",
        "x",
        "en",
      ),
    ).toThrow(/intent/);
  });

  it("rejects empty or malformed deliverables/faq blocks", () => {
    expect(() =>
      parseOfferingsFile("---\ntitle: X\nblurb: Y\ndeliverables:\n  - \"\"\n---\nB\n", "x", "en"),
    ).toThrow(/deliverables/);
    expect(() =>
      parseOfferingsFile("---\ntitle: X\nblurb: Y\nfaq:\n  - question: \"Q?\"\n---\nB\n", "x", "en"),
    ).toThrow(/answer/);
    expect(() =>
      parseOfferingsFile("---\ntitle: X\nblurb: Y\nfaq: not-a-list\n---\nB\n", "x", "en"),
    ).toThrow(/faq/);
  });

  it("rejects mixed list item styles (string + keyed)", () => {
    expect(() =>
      parseOfferingsFile(
        "---\ntitle: X\nblurb: Y\ndeliverables:\n  - \"One\"\n  - two: three\n---\nB\n",
        "x",
        "en",
      ),
    ).toThrow(/mixed/);
  });
});

describe("parseDisplayPrice — Phase S conservative display-price rule", () => {
  it("extracts a bare numeric price (optionally stripping ONE leading currency symbol)", () => {
    expect(parseDisplayPrice("150")).toBe("150");
    expect(parseDisplayPrice("$150")).toBe("150");
    expect(parseDisplayPrice("€40")).toBe("40");
    expect(parseDisplayPrice("1,200.50")).toBe("1,200.50");
    expect(parseDisplayPrice("  99 ")).toBe("99");
  });

  it("never guesses: returns null for ranges, suffixed text, words, or blank", () => {
    expect(parseDisplayPrice("From $150")).toBeNull();
    expect(parseDisplayPrice("$2,500 / month")).toBeNull();
    expect(parseDisplayPrice("150 USD")).toBeNull();
    expect(parseDisplayPrice("Custom Quote")).toBeNull();
    expect(parseDisplayPrice("150$")).toBeNull(); // trailing symbol is not a bare number
  });

  it("returns null when the price is absent", () => {
    expect(parseDisplayPrice(undefined)).toBeNull();
    expect(parseDisplayPrice("")).toBeNull();
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

describe("resolveOfferingAction (pure core resolver, provider- and i18n-neutral)", () => {
  const bookingHref = "https://cal.example.com/book";
  const contactHref = "/en/contact";

  it("resolves book → external link when the booking seam is available", () => {
    expect(resolveOfferingAction({ intent: "book" }, { bookingHref, contactHref })).toEqual({
      kind: "link",
      href: bookingHref,
      external: true,
    });
  });

  it("resolves book → none when the booking seam is unavailable (never a broken link)", () => {
    expect(resolveOfferingAction({ intent: "book" }, { bookingHref: null, contactHref })).toEqual({
      kind: "none",
    });
  });

  it("resolves contact → internal link to the boundary-supplied contact route", () => {
    expect(resolveOfferingAction({ intent: "contact" }, { bookingHref, contactHref })).toEqual({
      kind: "link",
      href: contactHref,
      external: false,
    });
  });

  it("resolves external → the literal deep link", () => {
    expect(
      resolveOfferingAction(
        { intent: "external", href: "viber://chat?number=%2B1" },
        { bookingHref, contactHref },
      ),
    ).toEqual({ kind: "link", href: "viber://chat?number=%2B1", external: true });
  });

  it("resolves an explicit label override through unchanged", () => {
    expect(
      resolveOfferingAction(
        { intent: "external", label: "Open", href: "https://example.com/x" },
        { bookingHref, contactHref },
      ),
    ).toEqual({ kind: "link", href: "https://example.com/x", external: true });
  });

  it("resolves no action → none", () => {
    expect(resolveOfferingAction(undefined, { bookingHref, contactHref })).toEqual({ kind: "none" });
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
  const trustContentDisabled = {
    testimonialsEnabled: false,
    portfolioEnabled: false,
    canonicalPortfolio: [] as readonly string[],
    blogEnabled: false,
    publishedBlogSlugs: [] as readonly string[],
  };

  it("includes page routes and, when enabled, the offerings listing + details", () => {
    const routes = buildSitemapRoutes({
      offeringsEnabled: true,
      pages,
      canonicalOfferings,
      ...trustContentDisabled,
    });
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
    const routes = buildSitemapRoutes({
      offeringsEnabled: false,
      pages,
      canonicalOfferings,
      ...trustContentDisabled,
    });
    expect(routes).not.toContain("/offerings");
    expect(routes).toEqual(["", "/about", "/contact", "/resources"]);
  });

  it("still includes the empty listing route when enabled with no offerings", () => {
    const routes = buildSitemapRoutes({
      offeringsEnabled: true,
      pages,
      canonicalOfferings: [],
      ...trustContentDisabled,
    });
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

describe("resolveOfferingPrice (regional currency presentation)", () => {
  const starter = { slug: "starter-package", price: "From $150" };
  const consultation = { slug: "consultation", price: "From $40" };
  const giftCard = { slug: "gift-card", price: "$25 - $200" };

  it("returns base price when region is unspecified/null", () => {
    expect(resolveOfferingPrice(starter, null)).toBe("From $150");
    expect(resolveOfferingPrice(consultation, null)).toBe("From $40");
    expect(resolveOfferingPrice(giftCard, null)).toBe("$25 - $200");
  });

  it("resolves Australian Dollars (A$) for Sydney", () => {
    const sydney = siteConfig.regions["sydney"];
    expect(resolveOfferingPrice(starter, sydney)).toBe("From A$150");
    expect(resolveOfferingPrice(consultation, sydney)).toBe("From A$40");
    expect(resolveOfferingPrice(giftCard, sydney)).toBe("A$25 - A$200");
  });

  it("resolves British Pounds (£) for London", () => {
    const london = siteConfig.regions["london"];
    expect(resolveOfferingPrice(starter, london)).toBe("From £150");
    expect(resolveOfferingPrice(consultation, london)).toBe("From £40");
    expect(resolveOfferingPrice(giftCard, london)).toBe("£25 - £200");
  });

  it("resolves Euros (€) for Berlin, Paris, and Madrid", () => {
    const berlin = siteConfig.regions["berlin"];
    const paris = siteConfig.regions["paris"];
    const madrid = siteConfig.regions["madrid"];
    expect(resolveOfferingPrice(starter, berlin)).toBe("From €150");
    expect(resolveOfferingPrice(consultation, paris)).toBe("From €40");
    expect(resolveOfferingPrice(giftCard, madrid)).toBe("€25 - €200");
  });

  it("resolves Japanese Yen (¥) for Tokyo with realistic tier", () => {
    const tokyo = siteConfig.regions["tokyo"];
    expect(resolveOfferingPrice(starter, tokyo)).toBe("From ¥15,000");
    expect(resolveOfferingPrice(consultation, tokyo)).toBe("From ¥4,000");
    expect(resolveOfferingPrice(giftCard, tokyo)).toBe("¥2,500 - ¥20,000");
  });

  it("resolves Canadian Dollars (CA$) for Toronto", () => {
    const toronto = siteConfig.regions["toronto"];
    expect(resolveOfferingPrice(starter, toronto)).toBe("From CA$150");
    expect(resolveOfferingPrice(consultation, toronto)).toBe("From CA$40");
    expect(resolveOfferingPrice(giftCard, toronto)).toBe("CA$25 - CA$200");
  });

  it("resolves Indonesian Rupiah (Rp) for Jakarta with realistic tier", () => {
    const jakarta = siteConfig.regions["jakarta"];
    expect(resolveOfferingPrice(starter, jakarta)).toBe("From Rp 1.500.000");
    expect(resolveOfferingPrice(consultation, jakarta)).toBe("From Rp 400.000");
    expect(resolveOfferingPrice(giftCard, jakarta)).toBe("Rp 250.000 - Rp 2.000.000");
  });

  it("resolves Russian Rubles (₽) for Moscow with realistic tier", () => {
    const moscow = siteConfig.regions["moscow"];
    expect(resolveOfferingPrice(starter, moscow)).toBe("From 15 000 ₽");
    expect(resolveOfferingPrice(consultation, moscow)).toBe("From 4 000 ₽");
    expect(resolveOfferingPrice(giftCard, moscow)).toBe("2 500 ₽ - 20 000 ₽");
  });

  it("resolves Korean Won (₩) for Seoul with realistic tier", () => {
    const seoul = siteConfig.regions["seoul"];
    expect(resolveOfferingPrice(starter, seoul)).toBe("From ₩150,000");
    expect(resolveOfferingPrice(consultation, seoul)).toBe("From ₩40,000");
    expect(resolveOfferingPrice(giftCard, seoul)).toBe("₩25,000 - ₩200,000");
  });

  it("resolves Chinese Yuan (¥) for Shanghai with realistic tier", () => {
    const shanghai = siteConfig.regions["shanghai"];
    expect(resolveOfferingPrice(starter, shanghai)).toBe("From ¥1,000");
    expect(resolveOfferingPrice(consultation, shanghai)).toBe("From ¥300");
    expect(resolveOfferingPrice(giftCard, shanghai)).toBe("¥200 - ¥1,500");
  });

  it("honors explicit regionalPrices and pricesByCurrency overrides", () => {
    const custom = {
      price: "$100",
      regionalPrices: { sydney: "A$199 Special" },
      pricesByCurrency: { EUR: "€89 Promo" },
    };
    const sydney = siteConfig.regions["sydney"];
    const berlin = siteConfig.regions["berlin"];
    expect(resolveOfferingPrice(custom, sydney)).toBe("A$199 Special");
    expect(resolveOfferingPrice(custom, berlin)).toBe("€89 Promo");
  });

  it("dynamically replaces currency symbol when no explicit mapping exists", () => {
    const genericOffering = { price: "$99" };
    const london = siteConfig.regions["london"];
    expect(resolveOfferingPrice(genericOffering, london)).toBe("£99");
  });
});
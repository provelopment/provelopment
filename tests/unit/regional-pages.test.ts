import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import type { PageRegionBinding } from "@/core/region";
import {
  buildRegionalLanguageAlternates,
  hasPageEntry,
  pagesForRegion,
  parseRegionalPath,
  regionalPath,
  regionsForLocale,
  resolveLocaleDestination,
  resolveLocationDestination,
} from "@/core/regional-pages";

const fixture: readonly PageRegionBinding[] = [
  { locale: "en", region: "toronto", slug: null },
  { locale: "en", region: "toronto", slug: "about" },
  { locale: "en", region: "toronto", slug: "contact" },
  { locale: "en", region: "vancouver", slug: null },
  { locale: "en", region: "vancouver", slug: "about" },
  { locale: "fr", region: "toronto", slug: null },
  { locale: "fr", region: "toronto", slug: "about" },
  { locale: "fr", region: "montreal", slug: null },
  { locale: "fr", region: "montreal", slug: "about" },
  { locale: "fr", region: "montreal", slug: "resources" },
  { locale: "de", region: "berlin", slug: null },
];

describe("Phase L - region availability", () => {
  it("lists only regions with a landing for the locale, in configuration order", () => {
    expect(regionsForLocale(fixture, "en")).toEqual(["toronto", "vancouver"]);
    expect(regionsForLocale(fixture, "fr")).toEqual(["toronto", "montreal"]);
    expect(regionsForLocale(fixture, "de")).toEqual(["berlin"]);
  });

  it("returns an empty list for a locale with no regional pages", () => {
    expect(regionsForLocale(fixture, "ja")).toEqual([]);
  });
});

describe("Phase L - pagesForRegion inventory", () => {
  it("lists the landing then page slugs in configuration order", () => {
    expect(pagesForRegion(fixture, "en", "toronto")).toEqual([null, "about", "contact"]);
    expect(pagesForRegion(fixture, "en", "vancouver")).toEqual([null, "about"]);
    expect(pagesForRegion(fixture, "de", "berlin")).toEqual([null]);
  });

  it("supports a region with no pages beyond the landing", () => {
    expect(hasPageEntry(fixture, "de", "berlin", null)).toBe(true);
    expect(hasPageEntry(fixture, "de", "berlin", "about")).toBe(false);
  });
});

describe("Phase L - switching location preserves locale", () => {
  it("preserves the current page when the target region has it", () => {
    expect(resolveLocationDestination(fixture, "en", "vancouver", "about")).toEqual({
      region: "vancouver",
      slug: "about",
    });
  });

  it("falls back to the target region landing when the page is missing", () => {
    expect(resolveLocationDestination(fixture, "en", "vancouver", "contact")).toEqual({
      region: "vancouver",
      slug: null,
    });
  });

  it("keeps the same-region page and falls back per rule for a different page", () => {
    expect(resolveLocationDestination(fixture, "fr", "montreal", "resources")).toEqual({
      region: "montreal",
      slug: "resources",
    });
    expect(resolveLocationDestination(fixture, "fr", "toronto", "resources")).toEqual({
      region: "toronto",
      slug: null,
    });
  });

  it("returns null only when the target region has nothing for the locale", () => {
    expect(resolveLocationDestination(fixture, "en", "montreal", null)).toBeNull();
    expect(resolveLocationDestination(fixture, "ja", "toronto", null)).toBeNull();
  });

  it("never changes the locale", () => {
    const d = resolveLocationDestination(fixture, "en", "toronto", "contact")!;
    expect(regionalPath("en", d.region, d.slug)).toBe("/en/toronto/contact");
  });
});

describe("Phase L - switching language preserves region", () => {
  it("preserves the same (region, page) when the target locale has it", () => {
    expect(resolveLocaleDestination(fixture, "fr", "toronto", "about")).toEqual({
      region: "toronto",
      slug: "about",
    });
  });

  it("falls back to the region landing when the target locale lacks the page", () => {
    expect(resolveLocaleDestination(fixture, "fr", "toronto", "contact")).toEqual({
      region: "toronto",
      slug: null,
    });
  });

  it("falls back to the regional landing when the target locale lacks the page", () => {
    expect(resolveLocaleDestination(fixture, "fr", "montreal", "contact")).toEqual({
      region: "montreal",
      slug: null,
    });
  });

  it("returns null only when the target locale has no page for the region", () => {
    expect(resolveLocaleDestination(fixture, "de", "toronto", "about")).toBeNull();
    expect(resolveLocaleDestination(fixture, "en", "berlin", null)).toBeNull();
  });
});

describe("Phase L - regionalPath + parseRegionalPath", () => {
  it("builds landing and page URLs", () => {
    expect(regionalPath("en", "toronto", null)).toBe("/en/toronto");
    expect(regionalPath("en", "toronto", "about")).toBe("/en/toronto/about");
  });

  it("parses regional and flat routes", () => {
    expect(parseRegionalPath(fixture, "/en/toronto")).toEqual({
      locale: "en", region: "toronto", slug: null,
    });
    expect(parseRegionalPath(fixture, "/en/toronto/about")).toEqual({
      locale: "en", region: "toronto", slug: "about",
    });
    expect(parseRegionalPath(fixture, "/en/offerings")).toEqual({
      locale: "en", region: null, slug: "offerings",
    });
    expect(parseRegionalPath(fixture, "/en")).toEqual({
      locale: "en", region: null, slug: null,
    });
  });
});

describe("Phase L - hreflang alternates for real combinations only", () => {
  const locales = ["en", "de", "fr", "es", "id", "ja", "ko", "zh"];

  it("emits only genuinely existing (locale, region, page) combinations", () => {
    const a = buildRegionalLanguageAlternates({
      baseUrl: "https://example.com", locales, defaultLocale: "en",
      entries: fixture, region: "toronto", slug: "about",
    });
    expect(a).toEqual({
      en: "https://example.com/en/toronto/about",
      fr: "https://example.com/fr/toronto/about",
      "x-default": "https://example.com/en/toronto/about",
    });
    expect(a.de).toBeUndefined();
    expect(a.es).toBeUndefined();
    expect(a.ja).toBeUndefined();
  });

  it("emits a locale fallback target when the exact page does not exist", () => {
    const a = buildRegionalLanguageAlternates({
      baseUrl: "https://example.com", locales, defaultLocale: "en",
      entries: fixture, region: "toronto", slug: "contact",
    });
    expect(a.en).toBe("https://example.com/en/toronto/contact");
    expect(a.fr).toBe("https://example.com/fr/toronto");
    expect(a["x-default"]).toBe("https://example.com/en/toronto/contact");
  });

  it("omits x-default when the default locale has no destination for the region", () => {
    const a = buildRegionalLanguageAlternates({
      baseUrl: "https://example.com", locales, defaultLocale: "en",
      entries: fixture, region: "berlin", slug: null,
    });
    expect(a).toEqual({ de: "https://example.com/de/berlin" });
    expect(a["x-default"]).toBeUndefined();
  });
});

describe("Phase L - live demo config smoke", () => {
  it("resolves the demo inventory the same way the routes do", () => {
    const entries = siteConfig.pageBindings;
    expect(regionsForLocale(entries, "en")).toEqual(["toronto", "vancouver"]);
    expect(regionsForLocale(entries, "fr")).toEqual(["toronto", "montreal"]);
    expect(regionsForLocale(entries, "de")).toEqual(["berlin"]);
    expect(resolveLocationDestination(entries, "en", "vancouver", "contact")).toEqual({
      region: "vancouver", slug: null,
    });
    expect(resolveLocaleDestination(entries, "fr", "toronto", "contact")).toEqual({
      region: "toronto", slug: null,
    });
  });
});
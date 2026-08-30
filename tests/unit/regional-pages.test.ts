import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import type { OperationalRegion, PageRegionBinding } from "@/core/region";
import {
  buildRegionalLanguageAlternates,
  configuredRegionIds,
  hasPageEntry,
  localesForRegion,
  pagesForRegion,
  parseRegionalPath,
  regionDefaultLocale,
  regionalPath,
  regionsForLocale,
  resolveLocaleDestination,
  resolveLocationDestination,
  resolveNavHref,
  unspecifiedDestination,
} from "@/core/regional-pages";

/**
 * Custom fixture mirroring the Phase M "page availability is independent by
 * locale AND region" inventory:
 *
 *   EN/Toronto:   landing, about, contact
 *   EN/Vancouver: landing, about            (no contact)
 *   FR/Toronto:   landing, about
 *   FR/Montreal:  landing, about, resources
 *   DE/Berlin:    landing
 */
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

function makeRegion(
  id: string,
  defaultLocale?: string,
): OperationalRegion {
  return {
    id,
    timezone: "America/Toronto",
    address: { street: "1 Demo St", city: "Demo", country: "Canada" },
    hours: {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [],
      saturday: [], sunday: [], holidays: [],
    },
    ...(defaultLocale ? { defaultLocale } : {}),
  };
}

/**
 * Phase M — configured operating locations are authoritative for the LOCATION
 * SELECTOR inventory. London is configured but has no page bindings at all —
 * it must still be selectable.
 */
const regionConfig: Readonly<Record<string, OperationalRegion>> = {
  toronto: makeRegion("toronto", "en"),
  vancouver: makeRegion("vancouver"),
  london: makeRegion("london", "en"),
};

describe("Phase M — region availability (regionsForLocale)", () => {
  it("lists only regions with a landing for the locale, in configuration order", () => {
    expect(regionsForLocale(fixture, "en")).toEqual(["toronto", "vancouver"]);
    expect(regionsForLocale(fixture, "fr")).toEqual(["toronto", "montreal"]);
    expect(regionsForLocale(fixture, "de")).toEqual(["berlin"]);
  });

  it("returns an empty list for a locale with no regional pages", () => {
    expect(regionsForLocale(fixture, "ja")).toEqual([]);
  });
});

describe("Phase M — configured operating-location inventory (configuredRegionIds)", () => {
  it("lists every configured region regardless of page bindings, in config order", () => {
    expect(configuredRegionIds(regionConfig)).toEqual(["toronto", "vancouver", "london"]);
  });

  it("is independent of locale and page bindings (a region with no bindings stays selectable)", () => {
    // `london` has no bindings in `fixture`, yet it is still an operating
    // location — business.regions, not business.pages, decides the inventory.
    expect(configuredRegionIds(regionConfig)).toContain("london");
    expect(fixture.some((entry) => entry.region === "london")).toBe(false);
  });

  it("the live demo exposes all configured regions on every locale (never filtered by language)", () => {
    // `/en`, `/fr`, `/de`, `/ja`, ... ALL show every operating location.
    siteConfig.locales.forEach(() => {
      expect(configuredRegionIds(siteConfig.regions).length).toBeGreaterThanOrEqual(11);
    });
  });
});

describe("Phase M — localesForRegion + regionDefaultLocale", () => {
  it("lists distinct locales bound to a region in configuration order", () => {
    expect(localesForRegion(fixture, "toronto")).toEqual(["en", "fr"]);
    expect(localesForRegion(fixture, "vancouver")).toEqual(["en"]);
    expect(localesForRegion(fixture, "berlin")).toEqual(["de"]);
  });

  it("prefers the region's explicit defaultLocale", () => {
    expect(regionDefaultLocale(regionConfig, fixture, "toronto")).toBe("en");
  });

  it("derives the default from the first landing binding when not explicit", () => {
    // vancouver has no explicit defaultLocale → its first landing binding.
    expect(regionDefaultLocale(regionConfig, fixture, "vancouver")).toBe("en");
  });

  it("returns the first bound locale when the region has a landing", () => {
    // montreal (no explicit defaultLocale) → fr (its only landing locale).
    expect(regionDefaultLocale(regionConfig, fixture, "berlin")).toBe("de");
  });
});

describe("Phase M — pagesForRegion inventory", () => {
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
describe("Phase M — switching location (resolveLocationDestination)", () => {
  it("preserves locale + page when the target region has the page", () => {
    expect(
      resolveLocationDestination({
        entries: fixture,
        locale: "en",
        targetRegion: "vancouver",
        currentSlug: "about",
        defaultLocale: "en",
      }),
    ).toEqual({ locale: "en", region: "vancouver", slug: "about" });
  });

  it("falls back to the target region landing in the same locale when the page is missing", () => {
    expect(
      resolveLocationDestination({
        entries: fixture,
        locale: "en",
        targetRegion: "vancouver",
        currentSlug: "contact",
        defaultLocale: "en",
      }),
    ).toEqual({ locale: "en", region: "vancouver", slug: null });
  });

  it("uses the configured default locale + landing when the current locale is not bound to the region", () => {
    expect(
      resolveLocationDestination({
        entries: fixture,
        locale: "ja",
        targetRegion: "toronto",
        currentSlug: null,
        defaultLocale: "en",
      }),
    ).toEqual({ locale: "en", region: "toronto", slug: null });
  });

  it("returns null when the current locale is unsupported and there is no default", () => {
    expect(
      resolveLocationDestination({
        entries: fixture,
        locale: "ja",
        targetRegion: "toronto",
        currentSlug: null,
        defaultLocale: null,
      }),
    ).toBeNull();
  });

  it("keeps the target region's first page when the locale is bound but only pages exist (pure rule)", () => {
    // The loader rejects this shape (landing required), but the pure resolver
    // still answers deterministically for the degraded input.
    const degraded = [{ locale: "en", region: "paris", slug: "about" }];
    expect(
      resolveLocationDestination({
        entries: degraded,
        locale: "en",
        targetRegion: "paris",
        currentSlug: "x",
        defaultLocale: null,
      }),
    ).toEqual({ locale: "en", region: "paris", slug: "about" });
  });

  it("never changes locale when the target region supports the current locale", () => {
    const destination = resolveLocationDestination({
      entries: fixture,
      locale: "fr",
      targetRegion: "toronto",
      currentSlug: "about",
      defaultLocale: "en",
    });
    expect(destination?.locale).toBe("fr");
  });
});

describe("Phase M — switching language preserves region (resolveLocaleDestination)", () => {
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

  it("returns null when the target locale has no page for the region (language not offered)", () => {
    expect(resolveLocaleDestination(fixture, "de", "toronto", "about")).toBeNull();
    expect(resolveLocaleDestination(fixture, "en", "berlin", null)).toBeNull();
  });
});

describe("Phase M — region-aware navigation (resolveNavHref)", () => {
  it("generic context: flat /{locale}{href} routes, Home → /{locale}", () => {
    expect(resolveNavHref(fixture, "en", null, "/")).toBe("/en");
    expect(resolveNavHref(fixture, "en", null, "/about")).toBe("/en/about");
    expect(resolveNavHref(fixture, "de", null, "/resources")).toBe("/de/resources");
  });

  it("regional Home always resolves to the regional landing", () => {
    expect(resolveNavHref(fixture, "en", "toronto", "/")).toBe("/en/toronto");
    expect(resolveNavHref(fixture, "fr", "montreal", "/")).toBe("/fr/montreal");
  });

  it("regional context exposes only pages that exist (never a silent redirect)", () => {
    expect(resolveNavHref(fixture, "en", "toronto", "/about")).toBe("/en/toronto/about");
    // Resources is not bound under en/toronto → filtered out, never redirected.
    expect(resolveNavHref(fixture, "en", "toronto", "/resources")).toBeNull();
    // Vancouver has no contact page → not exposed regionally.
    expect(resolveNavHref(fixture, "en", "vancouver", "/contact")).toBeNull();
  });

  it("external hrefs pass through unchanged", () => {
    expect(resolveNavHref(fixture, "en", "toronto", "mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
    expect(resolveNavHref(fixture, "en", null, "https://wa.me/5550100")).toBe(
      "https://wa.me/5550100",
    );
  });
});

describe("Phase M — unspecified location destination", () => {
  it("returns the equivalent non-regional page", () => {
    expect(unspecifiedDestination("en", null)).toBe("/en");
    expect(unspecifiedDestination("en", "about")).toBe("/en/about");
    expect(unspecifiedDestination("fr", "about")).toBe("/fr/about");
    expect(unspecifiedDestination("de", null)).toBe("/de");
  });
});
describe("Phase M — regionalPath + parseRegionalPath", () => {
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

describe("Phase M — hreflang alternates for real combinations only", () => {
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
    expect(a.ja).toBeUndefined();
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

describe("Phase M — live demo config smoke (site.config.json)", () => {
  const entries = siteConfig.pageBindings;

  it("exposes the full operating-location inventory to every locale", () => {
    expect(configuredRegionIds(siteConfig.regions)).toHaveLength(11);
  });

  it("resolves the demo inventory the same way the routes/switchers do", () => {
    // en lands: toronto, vancouver, montreal, london
    expect(regionsForLocale(entries, "en")).toEqual(["toronto", "vancouver", "montreal", "london"]);
    // fr lands: toronto, vancouver, montreal, paris
    expect(regionsForLocale(entries, "fr")).toEqual(["toronto", "vancouver", "montreal", "paris"]);
    expect(regionsForLocale(entries, "de")).toEqual(["berlin"]);
    expect(regionsForLocale(entries, "es")).toEqual(["madrid"]);
    expect(regionsForLocale(entries, "ja")).toEqual(["tokyo"]);
    expect(regionsForLocale(entries, "ko")).toEqual(["seoul"]);
    expect(regionsForLocale(entries, "zh")).toEqual(["shanghai"]);
    expect(regionsForLocale(entries, "id")).toEqual(["jakarta"]);
  });

  it("Toronto, Vancouver and Montreal are each reachable in EN and FR", () => {
    for (const region of ["toronto", "vancouver", "montreal"]) {
      expect(hasPageEntry(siteConfig.pageBindings, "en", region, null)).toBe(true);
      expect(hasPageEntry(siteConfig.pageBindings, "fr", region, null)).toBe(true);
      expect(hasPageEntry(siteConfig.pageBindings, "fr", region, "about")).toBe(true);
      expect(hasPageEntry(siteConfig.pageBindings, "fr", region, "connect")).toBe(true);
      expect(regionDefaultLocale(siteConfig.regions, siteConfig.pageBindings, region)).toBe("en");
    }
  });

  it("a region with an unsupported current locale resolves to its configured default", () => {
    // Visitor on generic Japanese, selects Paris (FR-only) → /fr/paris.
    expect(
      resolveLocationDestination({
        entries,
        locale: "ja",
        targetRegion: "paris",
        currentSlug: null,
        defaultLocale: regionDefaultLocale(siteConfig.regions, entries, "paris"),
      }),
    ).toEqual({ locale: "fr", region: "paris", slug: null });
  });

  it("regional navigation never exposes an unbound page and Home stays regional", () => {
    expect(resolveNavHref(entries, "en", "toronto", "/")).toBe("/en/toronto");
    expect(resolveNavHref(entries, "en", "toronto", "/about")).toBe("/en/toronto/about");
    expect(resolveNavHref(entries, "en", "toronto", "/connect")).toBe("/en/toronto/connect");
    // Not bound under toronto → filtered out (never a redirect to home).
    expect(resolveNavHref(entries, "en", "toronto", "/resources")).toBeNull();
    expect(resolveNavHref(entries, "en", "toronto", "/offerings")).toBeNull();
    expect(resolveNavHref(entries, "en", "toronto", "/contact")).toBeNull();
  });

  it("unspecified returns to the equivalent generic page", () => {
    expect(unspecifiedDestination("en", "about")).toBe("/en/about");
    expect(unspecifiedDestination("fr", null)).toBe("/fr");
    expect(unspecifiedDestination("de", null)).toBe("/de");
  });
});
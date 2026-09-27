/**
 * FOUNDATION-S1E2 — SITE SWITCHING, SITE-SCOPED DESTINATIONS AND CANONICAL TAGS.
 *
 * The locale a switch chooses is a CORE rule (`siteSwitchLocalePath`), whether the target can serve
 * the current route is an APPLICATION decision over the page composition, and the URL is built by
 * the ONE site path builder. A site-relative destination is resolved inside the active site; the
 * standards-facing tag identifies the locale the lowercase URL path key addresses.
 */
import { describe, expect, it } from "vitest";

import {
  regionalRouteAvailable,
  resolveSiteSwitchHref,
  siteSwitchOptions,
  type SiteSwitchOptions,
} from "@/application/site-switch";
import { buildLanguageAlternates, languageAlternate } from "@/core/locale";
import type { PageRegionBinding } from "@/core/region";
import { resolveSites, siteHref, siteSwitchDestination, siteSwitchLocalePath } from "@/core/site";

/** The deployment: Canada (en/fr), France (fr), and a Worldwide site (fr only). */
const { sites } = resolveSites({
  input: [
    { code: "ca", label: "Canada", locales: ["en", "fr"], defaultLocale: "en" },
    { code: "fr", label: "France", locales: ["fr"], defaultLocale: "fr" },
    { code: "ww", label: "Worldwide", locales: ["fr"], defaultLocale: "fr" },
  ],
  defaultLocale: "en",
  locales: ["en", "fr"],
});

const canada = sites[0]!;
const france = sites[1]!;
const worldwide = sites[2]!;

/** Which (site, route, locale) combinations exist — the page composition's word, stubbed. */
function switchOptions(pages: readonly string[], bindings: readonly PageRegionBinding[] = []) {
  const options: SiteSwitchOptions = {
    sites,
    bindings,
    availability: {
      hasPage: async (siteCode, routePath, localePath) =>
        pages.includes(`${siteCode}|${routePath}|${localePath}`),
    },
  };
  return options;
}

describe("siteSwitchLocalePath (the ONE locale choice)", () => {
  it("keeps the same locale path key when the target serves it", () => {
    expect(siteSwitchLocalePath(france, "fr")).toBe("fr");
  });

  it("uses a unique same-language candidate when the exact key is not served", () => {
    expect(siteSwitchLocalePath(worldwide, "fr-ca")).toBe("fr");
  });

  it("does NOT guess between two same-language variants", () => {
    const target = {
      ...france,
      locales: [
        { path: "fr-ca", canonical: "fr-CA" },
        { path: "fr-fr", canonical: "fr-FR" },
      ],
      defaultLocale: "fr-fr",
    };
    expect(siteSwitchLocalePath(target, "fr")).toBe("fr-fr");
  });

  it("falls back to the target's default locale when nothing matches", () => {
    expect(siteSwitchLocalePath(canada, "de")).toBe("en");
  });
});

describe("siteSwitchDestination (route kept, else the target's home)", () => {
  it("keeps the route when the target serves it", () => {
    expect(
      siteSwitchDestination({
        target: france,
        localePath: "fr",
        routePath: "about",
        routeExists: true,
      }),
    ).toBe("/fr/fr/about");
  });

  it("lands on the target's home when it does not", () => {
    expect(
      siteSwitchDestination({
        target: france,
        localePath: "fr",
        routePath: "about",
        routeExists: false,
      }),
    ).toBe("/fr/fr");
  });
});

describe("resolveSiteSwitchHref and siteSwitchOptions", () => {
  it("keeps the route when the target site's own page tree has it", async () => {
    const href = await resolveSiteSwitchHref(
      france,
      { site: canada, localePath: "fr", routePath: "about" },
      switchOptions(["fr|about|fr"]),
    );
    expect(href).toBe("/fr/fr/about");
  });

  it("falls back to the target's home when the target has no such page", async () => {
    const href = await resolveSiteSwitchHref(
      france,
      { site: canada, localePath: "fr", routePath: "about" },
      switchOptions([]),
    );
    expect(href).toBe("/fr/fr");
  });

  it("counts a configured REGION of the target as an existing route", () => {
    const bindings: PageRegionBinding[] = [
      { site: "fr", locale: "fr", region: "paris", slug: null },
    ];
    expect(regionalRouteAvailable(bindings, france, "fr", "paris")).toBe(true);
    // …and a region bound to ANOTHER site never makes a route exist here.
    expect(regionalRouteAvailable(bindings, canada, "fr", "paris")).toBe(false);
  });

  it("offers every site, reusing the current path for the current site", async () => {
    const options = await siteSwitchOptions(
      { site: canada, localePath: "fr", routePath: "about" },
      switchOptions(["fr|about|fr"]),
    );

    expect(options).toEqual([
      { code: "ca", label: "Canada", href: "/ca/fr/about" },
      { code: "fr", label: "France", href: "/fr/fr/about" },
      // `ww` cannot serve `about`, so its option lands on its home in `fr`.
      { code: "ww", label: "Worldwide", href: "/ww/fr" },
    ]);
  });
});

describe("siteHref (a configured destination, inside the active site)", () => {
  it("scopes a site-relative destination to the active site+locale", () => {
    expect(siteHref(canada, "fr", "/about")).toBe("/ca/fr/about");
    expect(siteHref(canada, "fr", "/legal/privacy")).toBe("/ca/fr/legal/privacy");
  });

  it("resolves the site root to the locale root", () => {
    expect(siteHref(canada, "fr", "/")).toBe("/ca/fr");
  });

  it("leaves an explicitly site-scoped destination exactly as written", () => {
    expect(siteHref(canada, "fr", "/fr/fr/about")).toBe("/fr/fr/about");
    expect(siteHref(canada, "fr", "/ca/en/about")).toBe("/ca/en/about");
  });

  it("never rewrites an external destination", () => {
    for (const href of ["https://example.com", "mailto:hello@example.com", "#main"]) {
      expect(siteHref(canada, "fr", href)).toBe(href);
    }
  });
});

describe("canonical tags at standards-facing boundaries", () => {
  it("advertises the canonical tag while the URL keeps the locale path key", () => {
    const alternates = buildLanguageAlternates({
      baseUrl: "https://example.com",
      locales: canada.locales,
      defaultLocale: canada.defaultLocale,
      path: "/about",
      sitePrefix: "/ca",
    });

    // `/ca/fr/about` is French (Canada): the URL stays lowercase, the tag identifies the locale.
    expect(alternates["fr-CA"]).toBe("https://example.com/ca/fr/about");
    expect(alternates["en-CA"]).toBe("https://example.com/ca/en/about");
    expect(alternates["x-default"]).toBe("https://example.com/ca/en/about");
    expect(alternates["fr"]).toBeUndefined();
  });

  it("keeps the simple tag for a site that makes no country assumption", () => {
    expect(languageAlternate({ path: "fr", canonical: "fr" })).toEqual({ path: "fr", tag: "fr" });
  });

  it("honours an explicit canonical override (ww/en → en-US)", () => {
    const alternates = buildLanguageAlternates({
      baseUrl: "https://example.com",
      locales: [{ path: "en", canonical: "en-US" }],
      sitePrefix: "/ww",
    });
    expect(alternates["en-US"]).toBe("https://example.com/ww/en");
  });
});

import { describe, expect, it } from "vitest";

import { parseSiteConfig } from "@/config/loader";
import { effectiveSitePageConfig } from "@/config/site-page-config";
import { bindingsForSite } from "@/core/regional-pages";

/**
 * INDEPENDENT SITE CONFIGURATION, THROUGH THE REAL LOADER (FOUNDATION-S1E3A)
 * ========================================================================
 *
 * Independent page trees must not force two countries to expose identical page-facing
 * configuration. This suite configures a deployment where Canada and France genuinely differ,
 * loads it through the REAL loader (`parseSiteConfig`) and asks the REAL effective-config resolver
 * what each site serves — navigation, footer group, legal documents, Connect inventory, the CTA
 * destination and its region bindings — while a third site inherits every shared value.
 */
const canadaNavigation = [
  { label: "Accueil", href: "/" },
  { label: "Emplacements", href: "/locations" },
];
const franceNavigation = [
  { label: "Accueil", href: "/" },
  { label: "Conformité", href: "/conformite" },
];

const regionBase = {
  timezone: "America/Toronto",
  address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
  hours: {},
};

const RAW = {
  site: {
    url: "https://example.com",
    name: "Example",
    tagline: "An example site",
    description: "A site used for testing.",
  },
  i18n: {
    defaultLocale: "fr",
    locales: [
      { code: "fr", label: "Français" },
      { code: "en", label: "English" },
    ],
  },
  sites: [
    {
      code: "ca",
      locales: ["fr", "en"],
      defaultLocale: "fr",
      navigation: canadaNavigation,
      footerNavigation: {
        heading: "En savoir plus",
        items: [{ label: "À propos", href: "/a-propos" }],
      },
      legal: [{ slug: "confidentialite", label: "Confidentialité" }],
      connect: { methods: [{ id: "courriel", label: "Courriel", href: "/contact" }] },
      ctaHref: "/locations",
    },
    {
      code: "fr",
      locales: ["fr"],
      defaultLocale: "fr",
      navigation: franceNavigation,
      legal: [{ slug: "mentions", label: "Mentions légales" }],
      ctaHref: "https://example.fr/rendez-vous",
    },
    // No overrides at all: this site serves every shared value.
    { code: "ww", locales: ["fr"], defaultLocale: "fr" },
  ],
  defaultSite: "ww",
  contact: { email: "hello@example.com" },
  socialLinks: [],
  navigation: [
    { label: "Home", href: "/" },
    { label: "Services", href: "/services" },
  ],
  footerNavigation: { heading: "More", items: [{ label: "About", href: "/about" }] },
  legal: [{ slug: "privacy", label: "Privacy" }],
  ui: { cta: { href: "/contact" } },
  business: {
    regions: { toronto: regionBase },
    pages: [
      { site: "ca", locale: "fr", region: "toronto" },
      { site: "fr", locale: "fr", region: "toronto", slug: "agence" },
    ],
  },
};

const config = parseSiteConfig(RAW);

describe("two sites serve their own page-facing configuration", () => {
  it("gives each site its own navigation", () => {
    expect(effectiveSitePageConfig(config, "ca").navigation).toEqual(canadaNavigation);
    expect(effectiveSitePageConfig(config, "fr").navigation).toEqual(franceNavigation);
    // The two lists are genuinely different: a shared list would have leaked Canada's pages
    // into France's chrome.
    expect(effectiveSitePageConfig(config, "fr").navigation).not.toEqual(canadaNavigation);
  });

  it("gives each site its own footer group, legal documents, Connect inventory and CTA destination", () => {
    const canada = effectiveSitePageConfig(config, "ca");
    const france = effectiveSitePageConfig(config, "fr");

    expect(canada.footerNavigation?.heading).toBe("En savoir plus");
    expect(france.footerNavigation?.heading).toBe("More"); // inherited from the shared value
    expect(canada.legal?.map((entry) => entry.slug)).toEqual(["confidentialite"]);
    expect(france.legal?.map((entry) => entry.slug)).toEqual(["mentions"]);
    expect(canada.connect?.methods?.map((method) => method.id)).toEqual(["courriel"]);
    expect(france.connect).toBeUndefined(); // no shared Connect block, and no override
    expect(canada.ctaHref).toBe("/locations");
    expect(france.ctaHref).toBe("https://example.fr/rendez-vous");
  });
});

describe("shared values still apply where a site says nothing", () => {
  it("inherits every shared page-facing value for a site with no overrides", () => {
    const shared = effectiveSitePageConfig(config, "ww");

    expect(shared.navigation.map((item) => item.href)).toEqual(["/", "/services"]);
    expect(shared.footerNavigation?.heading).toBe("More");
    expect(shared.legal?.map((entry) => entry.slug)).toEqual(["privacy"]);
    // The shared CTA destination is the shared `ui.cta.href` — presentation stays shared.
    expect(shared.ctaHref).toBe("/contact");
  });

  it("never lets one site's override reach another", () => {
    for (const code of ["fr", "ww"]) {
      const other = effectiveSitePageConfig(config, code);
      expect(other.legal?.some((entry) => entry.slug === "confidentialite")).toBe(false);
      expect(other.navigation).not.toEqual(canadaNavigation);
    }
  });
});

describe("region bindings stay inside their own site", () => {
  it("binds a page to the site it names, and to no other", () => {
    const canada = bindingsForSite(config.pageBindings, "ca");
    const france = bindingsForSite(config.pageBindings, "fr");

    expect(canada).toEqual([{ site: "ca", locale: "fr", region: "toronto", slug: null }]);
    expect(france).toEqual([
      { site: "fr", locale: "fr", region: "toronto", slug: "agence" },
    ]);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// DEPLOYMENT SCOPE (B2): asserts the SHIPPED reference deployment; moves to deployment/tests/**.
vi.unmock("@/config");

// The header contains real client controls (Site/Language/Location switches navigate); this suite
// asserts the SERVER-RENDERED composition, so navigation is stubbed exactly as the other
// header-composition suites do.
// The header's client controls read the CURRENT URL to decide what they offer, so the mocked
// pathname is set per render (the same technique the other URL-authoritative component suites use).
let mockPath = "/ww/en";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: () => {} }),
}));

import { createPageAvailability } from "@/adapters/content/page-availability";
import { createPageSources } from "@/adapters/content/page-sources";
import { siteSwitchOptions } from "@/application/site-switch";
import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import {
  bindingsForSite,
  regionalPath,
  regionsForSite,
  resolveLocationDestination,
  unspecifiedDestination,
} from "@/core/regional-pages";
import { resolveUiConfig } from "@/core/ui";

/**
 * FOUNDATION-R1C1A — THE FULL CONTEXT MODEL, SHIPPED
 * ==================================================
 *
 * The reference deployment now demonstrates every visitor dimension at once:
 *
 *     Site → Languages + Locations + independent page tree
 *     Layout = an independent presentation preference
 *
 *   Global  (`ww`)  English + Deutsch, no locations, its own Home/About
 *   Germany (`de`)  Deutsch + English, demonstration Locations Berlin and Frankfurt,
 *                   an INDEPENDENT page tree (never a fallback to Global's pages)
 *
 * This file proves the configuration consequences: which sites exist, which languages and
 * locations each one serves, that the Site selector appears with the configured labels and
 * preserves the route, that a Location stays inside its own site and changes neither the site
 * nor the language, and that the controls are composed in the documented order
 * (Site → Location → Language → Layout).
 *
 * The browser-visible half (real switching, four controls at four widths, sticky navigation) is
 * proved in the `reference-content` scenario against the SHIPPED configuration.
 */
const GLOBAL = "ww";
const GERMANY = "de";
const GERMAN_HOME_TITLE = "Deutschland: eine Website, zwei Sprachen, zwei Standorte.";
const GERMANY_ENGLISH_HOME_TITLE = "Germany: one site, two languages, two locations.";

const pages = () => createPageSources({ sites: siteConfig.sites });
const siteByCode = (code: string) => siteConfig.sites.find((site) => site.code === code)!;
const globalSite = siteByCode(GLOBAL);
const germanySite = siteByCode(GERMANY);

const ui = resolveUiConfig(siteConfig.ui ?? {});

const switchOptionsFor = (site = globalSite, localePath = "en", routePath = "") =>
  siteSwitchOptions(
    { site, localePath, routePath },
    {
      sites: siteConfig.sites,
      bindings: siteConfig.pageBindings,
      availability: createPageAvailability({ sites: siteConfig.sites }),
    },
  );

/** The header as the layout composes it, for one site + locale + route. */
async function headerHtml(options: {
  readonly siteCode: string;
  readonly localePath: string;
  readonly routePath: string;
}): Promise<string> {
  const site = siteByCode(options.siteCode);
  // The header is rendered for the URL the visitor is on: a site's controls offer what THAT site
  // has, so the mocked pathname mirrors the render target.
  mockPath = `/${options.siteCode}/${options.localePath}${options.routePath === "" ? "" : `/${options.routePath}`}`;
  const siteSwitch =
    siteConfig.sites.length > 1
      ? await switchOptionsFor(site, options.localePath, options.routePath)
      : undefined;

  return renderToStaticMarkup(
    SiteHeader({ locale: options.localePath, resolved: ui, siteId: site.code, siteSwitch }),
  );
}

/** The `data-selector` names present in a rendered header, in DOCUMENT order. */
const selectorOrder = (html: string): string[] =>
  [...html.matchAll(/data-selector="([a-z]+)"/g)].map((match) => match[1] as string);

/** The OPTION labels of one selector, exactly as a visitor reads them. */
const selectorOptions = (html: string, name: string): string[] => {
  const select = html.match(new RegExp(`<select[^>]*data-selector="${name}"[^>]*>([\\s\\S]*?)</select>`));
  return [...(select?.[1] ?? "").matchAll(/<option[^>]*>(.*?)<\/option>/g)].map((match) =>
    match[1]!.replace(/<[^>]+>/g, "").trim(),
  );
};

describe("the deployment declares two real sites", () => {
  it("configures Global first as the default site, then Germany", () => {
    expect(siteConfig.sites.map((site) => site.code)).toEqual([GLOBAL, GERMANY]);
    expect(siteConfig.defaultSite.code).toBe(GLOBAL);
    expect(globalSite.label).toBe("Global");
    expect(germanySite.label).toBe("Germany");
  });

  it("keeps Global's languages and its own (absent) location inventory", () => {
    expect(globalSite.locales.map((locale) => locale.path)).toEqual(["en", "de"]);
    expect(globalSite.defaultLocale).toBe("en");
    expect(regionsForSite(siteConfig.pageBindings, GLOBAL)).toEqual([]);
  });

  it("gives Germany its own languages, deriving the country context from simple keys", () => {
    expect(germanySite.locales.map((locale) => locale.path)).toEqual([GERMANY, "en"]);
    // A country site derives its own variant: `/de/de` IS `de-DE` and `/de/en` IS `en-DE`
    // (the path key addresses, the canonical tag identifies) — no explicit form was needed.
    expect(germanySite.locales.map((locale) => locale.canonical)).toEqual(["de-DE", "en-DE"]);
    expect(germanySite.defaultLocale).toBe(GERMANY);
  });

  it("binds exactly two demonstration locations to Germany, and none to Global", () => {
    expect(regionsForSite(siteConfig.pageBindings, GERMANY)).toEqual(["berlin", "frankfurt"]);
    for (const region of ["berlin", "frankfurt"] as const) {
      expect(siteConfig.regions[region]?.timezone).toBe("Europe/Berlin");
      // Demonstration data only: no opening hours are claimed (every day normalises to an empty
      // schedule) and the address is a placeholder.
      const hours = siteConfig.regions[region]?.hours as unknown as Readonly<
        Record<string, readonly unknown[]>
      >;
      for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) {
        expect(hours[day], `${region}.${day}`).toHaveLength(0);
      }
      expect(siteConfig.regions[region]?.address.street).toBe("Example Street 1");
    }
    // Every bound (locale, region) is a landing, for BOTH of Germany's languages.
    const bindings = bindingsForSite(siteConfig.pageBindings, GERMANY);
    expect(bindings.map((binding) => `${binding.locale}/${binding.region}`).sort()).toEqual([
      "de/berlin",
      "de/frankfurt",
      "en/berlin",
      "en/frankfurt",
    ]);
    expect(bindings.every((binding) => binding.slug === null)).toBe(true);
  });
});

describe("each site serves its OWN pages", () => {
  it("resolves Germany's pages from Germany's tree, in both languages", async () => {
    const germanHome = await pages().resolve(GERMANY, HOME_CONTENT_SLUG, GERMANY);
    const englishHome = await pages().resolve(GERMANY, HOME_CONTENT_SLUG, "en");

    expect(germanHome?.title).toBe(GERMAN_HOME_TITLE);
    expect(englishHome?.title).toBe(GERMANY_ENGLISH_HOME_TITLE);
    expect(germanHome?.fallback).toBe(false);
    expect(englishHome?.fallback).toBe(false);
  });

  it("never answers a Germany URL with a Global page (or the reverse)", async () => {
    const globalGermanHome = await pages().resolve(GLOBAL, HOME_CONTENT_SLUG, GERMANY);
    const germanyHome = await pages().resolve(GERMANY, HOME_CONTENT_SLUG, GERMANY);
    const globalAbout = await pages().resolve(GLOBAL, "about", "en");
    const germanyAbout = await pages().resolve(GERMANY, "about", "en");

    expect(globalGermanHome?.title).not.toBe(germanyHome?.title);
    expect(globalAbout?.title).toBe("About this Foundation website");
    expect(germanyAbout?.title).toBe("About the Germany site");
  });

  it("publishes a location landing page inside Germany's tree", async () => {
    const berlin = await pages().resolve(GERMANY, "berlin", GERMANY);
    const frankfurtEnglish = await pages().resolve(GERMANY, "frankfurt", "en");

    expect(berlin?.title).toBe("Berlin");
    expect(frankfurtEnglish?.title).toBe("Frankfurt");
    // A Global context has no such page at all — locations belong to Germany's tree.
    expect(await pages().resolve(GLOBAL, "berlin", GERMANY)).toBeNull();
  });
});

describe("the Site selector appears naturally, with the configured labels", () => {
  it("offers Global and Germany, and reflects the active site", async () => {
    const html = await headerHtml({ siteCode: GLOBAL, localePath: "en", routePath: "about" });

    expect(html).toContain('data-selector="site"');
    expect(html).toContain(">Global<");
    expect(html).toContain(">Germany<");
    expect(html).toContain('aria-label="Site"');
  });

  it("labels the control in the active language", async () => {
    const german = await headerHtml({ siteCode: GERMANY, localePath: GERMANY, routePath: "" });
    expect(german).toContain(`aria-label="${getDictionary(GERMANY).site.label}"`);
  });

  it("preserves the route when the target site serves it, in both directions", async () => {
    const globalGermanAbout = await switchOptionsFor(globalSite, "de", "about");
    const globalEnglishAbout = await switchOptionsFor(globalSite, "en", "about");
    const germanyBackToGlobal = await switchOptionsFor(germanySite, GERMANY, "about");

    expect(globalGermanAbout.map((option) => option.code)).toEqual([GLOBAL, GERMANY]);
    // German About, Global → Germany (which serves `/about` in `de`) → the same page.
    expect(globalGermanAbout.find((option) => option.code === GERMANY)?.href).toBe("/de/de/about");
    // English About, Global → Germany's English exists → the same page in English.
    expect(globalEnglishAbout.find((option) => option.code === GERMANY)?.href).toBe("/de/en/about");
    // …and back: Germany's German → Global, which also serves German.
    expect(germanyBackToGlobal.find((option) => option.code === GLOBAL)?.href).toBe("/ww/de/about");
  });
});

describe("a Location stays inside its own site", () => {
  const germanyBindings = bindingsForSite(siteConfig.pageBindings, GERMANY);

  it("keeps the site and the language, and lands on the location's own page", () => {
    const toBerlin = resolveLocationDestination({
      entries: germanyBindings,
      locale: GERMANY,
      targetRegion: "berlin",
      currentSlug: "about",
    });

    expect(toBerlin).toEqual({ locale: GERMANY, region: "berlin", slug: null });
    // The destination is built with GERMANY's prefix: the visitor never leaves the site, and the
    // language is unchanged — a location is not a language or a site switch.
    expect(regionalPath(toBerlin!.locale, toBerlin!.region, toBerlin!.slug, "/de")).toBe(
      "/de/de/berlin",
    );
  });

  it("offers every location in BOTH of the site's languages", () => {
    for (const region of ["berlin", "frankfurt"] as const) {
      for (const locale of [GERMANY, "en"] as const) {
        expect(
          resolveLocationDestination({
            entries: germanyBindings,
            locale,
            targetRegion: region,
            currentSlug: null,
          }),
          `${locale}/${region}`,
        ).toEqual({ locale, region, slug: null });
      }
    }
  });

  it("returns to the site's own pages through the neutral choice", () => {
    // "All locations" is the site's non-regional page — still inside Germany.
    expect(unspecifiedDestination(GERMANY, null, "/de")).toBe("/de/de");
  });

  it("cannot be reached from Global, which binds no location at all", () => {
    const globalBindings = bindingsForSite(siteConfig.pageBindings, GLOBAL);
    expect(globalBindings).toEqual([]);
    expect(
      resolveLocationDestination({
        entries: globalBindings,
        locale: "en",
        targetRegion: "berlin",
        currentSlug: null,
      }),
    ).toBeNull();
  });
});

describe("the Location control appears exactly where locations exist", () => {
  it("stays absent on Global, which configures none", async () => {
    const english = await headerHtml({ siteCode: GLOBAL, localePath: "en", routePath: "" });
    const german = await headerHtml({ siteCode: GLOBAL, localePath: "de", routePath: "" });

    expect(english).not.toContain('data-selector="location"');
    expect(german).not.toContain('data-selector="location"');
  });

  it("appears on Germany with the neutral choice and both demonstration locations", async () => {
    const english = await headerHtml({ siteCode: GERMANY, localePath: "en", routePath: "" });
    const german = await headerHtml({ siteCode: GERMANY, localePath: "de", routePath: "" });

    // The neutral choice and exactly the two configured locations — never a fabricated one, and
    // never the Site's own vocabulary.
    expect(selectorOptions(english, "location")).toEqual(["All locations", "Berlin", "Frankfurt"]);
    expect(selectorOptions(german, "location")).toEqual(["Alle Standorte", "Berlin", "Frankfurt"]);
    // The neutral option is the dictionary's, so the two concepts stay distinct words.
    expect(getDictionary("en").location.unspecified).toBe("All locations");
    expect(getDictionary(GERMANY).location.unspecified).toBe("Alle Standorte");
    // …and the Site control keeps its own vocabulary beside it.
    expect(selectorOptions(german, "site")).toEqual(["Global", "Germany"]);
  });
});

describe("the controls are composed in the documented order", () => {
  it("renders Site → Language → Layout on a site with no locations", async () => {
    const html = await headerHtml({ siteCode: GLOBAL, localePath: "en", routePath: "" });
    expect(selectorOrder(html)).toEqual(["site", "language", "layout"]);
  });

  it("renders Site → Location → Language → Layout on Germany", async () => {
    const html = await headerHtml({ siteCode: GERMANY, localePath: GERMANY, routePath: "" });
    expect(selectorOrder(html)).toEqual(["site", "location", "language", "layout"]);
  });

  it("keeps every control present at once, once and only once", async () => {
    const html = await headerHtml({ siteCode: GERMANY, localePath: "en", routePath: "about" });
    const order = selectorOrder(html);
    expect(new Set(order).size).toBe(order.length);
    expect(order).toEqual(["site", "location", "language", "layout"]);
  });
});




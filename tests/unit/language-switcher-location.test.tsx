/**
 * THE LANGUAGE SELECTOR IN A LOCATION CONTEXT (FOUNDATION-LOC3)
 * ============================================================
 *
 * THE DEFECT THIS FILE PROVES FIXED. The selector used to offer EVERY language of the Site in every context.
 * In the GLOBAL (Location-less) state that is exactly right — the whole language set is the point of it. In a
 * selected LOCATION it was wrong twice over: a language that Location does not serve was offered, and choosing
 * it did nothing at all (`resolveLocaleDestination` returned `null` and the handler returned), so the visitor
 * met an option that looked functional and silently was not.
 *
 * WHAT THE RULE NOW IS. The option set is the Site's own languages projected through the accepted regional
 * binding + destination rule — `localesAvailableInLocation`, which composes `resolveLocaleDestination` — so:
 *
 *   GLOBAL context   every language the Site serves, unchanged;
 *   LOCATION         only the languages that reach THAT Location, plus the language being read.
 *
 * The fixtures are deliberately SYNTHETIC and small (three languages, four Locations, two regional Sites):
 * a Location whose single language is English, one whose single language is French, one whose single language
 * is Russian, and one — Toronto — that genuinely serves TWO languages. No generic Foundation contract may
 * name a real deployment, and none does.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let currentPath = "/ca/en";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: () => {} }),
}));

import { ClientRoutingProvider } from "@/components/site/client-routing-context";
import { buildClientRoutingContext } from "@/components/site/client-routing";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { parseSiteConfig } from "@/config/loader";
import type { SiteConfig } from "@/config/site-config";
import {
  bindingsForSite,
  localesAvailableInLocation,
  regionalPath,
  resolveLocaleDestination,
} from "@/core/regional-pages";
import { siteSetOf } from "@/core/site";

const REGION_BASE = {
  timezone: "Europe/Paris",
  address: { street: "1 Example Road", city: "Exampleville", country: "France" },
  hours: {},
};

const REGIONS = {
  london: { ...REGION_BASE, label: "London" },
  paris: { ...REGION_BASE, label: "Paris" },
  moscow: { ...REGION_BASE, label: "Moscow" },
  toronto: { ...REGION_BASE, label: "Toronto" },
};

/**
 * `ca` is the Site under test: three languages, four Locations, and one Location (Toronto) that genuinely
 * serves two of them. `ch` has NO Locations at all, so it must keep the Global behaviour untouched.
 */
const config = parseSiteConfig({
  site: {
    url: "https://example.test",
    name: "Example",
    tagline: "An example",
    description: "A deployment used to prove that a Location offers only the languages it serves.",
  },
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English" },
      { code: "fr", label: "Français" },
      { code: "ru", label: "Русский" },
    ],
  },
  defaultSite: "ww",
  contact: { email: "fixture@example.test" },
  socialLinks: [],
  navigation: [{ label: "Home", href: "/" }],
  sites: [
    { code: "ww", label: "Global" },
    { code: "ca", label: "Canada", locales: ["en", "fr", "ru"], defaultLocale: "en" },
    { code: "ch", label: "Switzerland", locales: ["en", "ru"], defaultLocale: "en" },
  ],
  business: {
    regions: REGIONS,
    pages: [
      { site: "ca", locale: "en", region: "london" },
      { site: "ca", locale: "en", region: "toronto" },
      { site: "ca", locale: "fr", region: "toronto" },
      { site: "ca", locale: "fr", region: "paris" },
      { site: "ca", locale: "ru", region: "moscow" },
    ],
  },
});

/** The rendered options of the Language control, in DOM order, as `[value, label]`. */
function languageOptions(
  siteConfig: SiteConfig,
  path: string,
  locale = "en",
): readonly (readonly [string, string])[] {
  currentPath = path;
  const html = renderToStaticMarkup(
    <ClientRoutingProvider routing={ROUTING}>
      <LanguageSwitcher locale={locale} label="Language" />
    </ClientRoutingProvider>,
  );

  return [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(
    (match) => [match[1] as string, match[2] as string] as const,
  );
}

/** The offered language PATH KEYS, in rendered order. */
function offered(siteConfig: SiteConfig, path: string, locale = "en"): readonly string[] {
  return languageOptions(siteConfig, path, locale).map(([value]) => value);
}

/** The client routing projection the component reads — the platform's OWN builder, one authority. */
const ROUTING = buildClientRoutingContext(config, siteSetOf(config.sites, config.defaultSite));

/** This Site's own binding view — exactly the projection the selector reads. */
const siteEntries = bindingsForSite(ROUTING.pageBindings, "ca");

describe("LOC3 — a GLOBAL context offers the Site's whole language set", () => {
  it("offers every language, led by the Site's default language", () => {
    expect(offered(config, "/ca/en", "en")).toEqual(["en", "fr", "ru"]);
  });

  it("still offers the whole set when it is read in another language", () => {
    expect(offered(config, "/ca/fr", "fr")).toEqual(["en", "fr", "ru"]);
    expect(offered(config, "/ca/ru", "ru")).toEqual(["en", "fr", "ru"]);
  });

  it("leaves a Site with NO Locations exactly as it was", () => {
    expect(offered(config, "/ch/en", "en")).toEqual(["en", "ru"]);
  });
});

describe("LOC3 — a LOCATION offers only the languages it actually serves", () => {
  it("Paris offers French only", () => {
    expect(offered(config, "/ca/fr/paris", "fr")).toEqual(["fr"]);
  });

  it("Moscow offers Russian only", () => {
    expect(offered(config, "/ca/ru/moscow", "ru")).toEqual(["ru"]);
  });

  it("London — a single-language Location — offers English only", () => {
    expect(offered(config, "/ca/en/london", "en")).toEqual(["en"]);
  });

  it("Toronto offers English AND French, in the Site's own order", () => {
    expect(offered(config, "/ca/en/toronto", "en")).toEqual(["en", "fr"]);
  });

  it("offers the same set on a page INSIDE the Location, not only on its landing", () => {
    // The page is irrelevant to the offer set: what a Location can reach is a property of the bindings.
    expect(offered(config, "/ca/fr/toronto", "fr")).toEqual(["en", "fr"]);
  });
});

describe("LOC3 — switching works only where a destination really exists", () => {
  it("Toronto's French option reaches Toronto's French landing", () => {
    expect(resolveLocaleDestination(siteEntries, "fr", "toronto", null)).toEqual({
      region: "toronto",
      slug: null,
    });
    expect(regionalPath("fr", "toronto", null, "/ca")).toBe("/ca/fr/toronto");
  });

  it("Toronto's English option reaches Toronto's English landing (both directions)", () => {
    expect(resolveLocaleDestination(siteEntries, "en", "toronto", null)).toEqual({
      region: "toronto",
      slug: null,
    });
    expect(regionalPath("en", "toronto", null, "/ca")).toBe("/ca/en/toronto");
  });

  it("a language with NO destination in this Location is not offered at all", () => {
    // Paris is bound to French only, Moscow to Russian only: every other language has NO destination there.
    expect(resolveLocaleDestination(siteEntries, "en", "paris", null)).toBeNull();
    expect(resolveLocaleDestination(siteEntries, "ru", "paris", null)).toBeNull();
    expect(resolveLocaleDestination(siteEntries, "en", "moscow", null)).toBeNull();
    expect(resolveLocaleDestination(siteEntries, "fr", "moscow", null)).toBeNull();
    expect(offered(config, "/ca/fr/paris", "fr")).not.toContain("en");
    expect(offered(config, "/ca/fr/paris", "fr")).not.toContain("ru");
    expect(offered(config, "/ca/ru/moscow", "ru")).not.toContain("en");
  });

  it("always keeps the language being read, even where the binding view excludes it", () => {
    // The defensive half of the rule: a selector can never drop the language it is displaying.
    expect(
      localesAvailableInLocation({
        entries: siteEntries,
        siteLocalePaths: ["en", "fr", "ru"],
        region: "paris",
        currentSlug: null,
        currentLocalePath: "en",
      }),
    ).toEqual(["en", "fr"]);
  });
});

describe("LOC3 — the offer set is scoped to ONE Site's own Locations", () => {
  it("never offers another Site's languages through this Site's Location", () => {
    // `ch` serves English and Russian and has no Locations, so it is a Global context: the whole of ITS own
    // set, and never the regional Site's French.
    expect(offered(config, "/ch/en", "en")).toEqual(["en", "ru"]);
  });

  it("offers no language a Location does not serve, on ANY of its pages", () => {
    for (const [path, locale] of [
      ["/ca/fr/paris", "fr"],
      ["/ca/ru/moscow", "ru"],
      ["/ca/en/london", "en"],
      ["/ca/en/toronto", "en"],
    ] as const) {
      const values = offered(config, path, locale);
      expect(values.length, path).toBeGreaterThan(0);
      const region = path.split("/")[3] as string;
      for (const value of values) {
        // Every offered language must resolve a destination inside THAT Location — no inert option exists.
        expect(resolveLocaleDestination(siteEntries, value, region, null), `${path} ${value}`).not.toBeNull();
      }
    }
  });
});

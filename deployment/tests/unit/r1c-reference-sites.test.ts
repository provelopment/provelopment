import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.
//
// M18 — THE R1C CONTRACT, IN ITS TWO-SPOKE FORM.
// ==============================================
// R1C proved that ONE Spoke could own TWO Sites (`ww` + `de`) with independent page trees, per-site
// languages, Germany-local Locations and a Site control that preserved the route. M18 moves the Germany
// Site into its OWN Spoke, so the same behavioural contract is now expressed as ONE Site per Spoke:
//
//   Foundation Spoke   Site `ww` (Global)   en + de, NO Locations, its own Home/About tree
//   Germany Spoke      Site `de` (Germany)  de + en, Locations Berlin/Frankfurt, its own page tree
//
// Three consequences follow, and each is asserted below rather than assumed:
//
//   · every fact is asserted PER SPOKE, through the accepted runtime authorities
//     (`./support/spoke-contexts` → `installationRuntimeIndex` + `runtimeContextForSpoke`);
//   · no assertion uses the retired installation-wide compatibility bindings (`@/config`'s `siteConfig`,
//     `deploymentPaths()`'s resource root, the global dictionary access): a multi-Spoke Installation has
//     none, and the authorities refuse that answer loudly;
//   · BOTH Spokes render NO Site control, because each declares exactly ONE Site (§11). M18 invents no
//     cross-Spoke selector to preserve the old one.
//
// The browser-visible half of the same contract lives in `deployment/tests/browser/` and runs against
// both exact hostnames.
let mockPath = "/ww/en";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: () => {} }),
}));

import { createPageSources } from "@/adapters/content/page-sources";
import { SiteHeader } from "@/components/site/site-header";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import {
  dictionaryAccessForRuntimeContext,
  type RuntimeDictionaryAccess,
} from "@/config/runtime-dictionaries";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import {
  bindingsForSite,
  localesForRegion,
  regionalPath,
  regionsForLocale,
  regionsForSite,
  resolveLocaleDestination,
  resolveLocationDestination,
  unspecifiedDestination,
} from "@/core/regional-pages";
import { resolveUiConfig } from "@/core/ui";
import { foundationSpoke, germanySpoke, type DeploymentSpoke } from "../support/spoke-contexts";

/** The two authored coordinates of the reference deployment, and the Spoke each one belongs to. */
const GLOBAL = "ww";
const GERMANY = "de";
const GERMAN_HOME_TITLE = "Deutschland: eine Website, zwei Sprachen, zwei Standorte.";
const GERMANY_ENGLISH_HOME_TITLE = "Germany: one site, two languages, two locations.";
const GERMAN_ABOUT_TITLE = "About the Germany site";
const GLOBAL_ABOUT_TITLE = "About this Foundation website";

const FOUNDATION = foundationSpoke;
const GERMANY_SPOKE = germanySpoke;

/**
 * Each Spoke reads its OWN authored page tree (`roots`): a multi-Spoke Installation has no
 * installation-wide page roots, so a composition that omitted them would be asking for the retired
 * single-Spoke answer.
 */
const pagesFor = (spoke: DeploymentSpoke) =>
  createPageSources({ sites: spoke.config.sites, roots: spoke.resources });

/** The dictionary answers of ONE Spoke, through the accepted context-bound access. */
const dictionariesFor = (spoke: DeploymentSpoke): RuntimeDictionaryAccess =>
  dictionaryAccessForRuntimeContext(spoke.context);

const siteByCode = (spoke: DeploymentSpoke, code: string) =>
  spoke.config.sites.find((site) => site.code === code)!;

/**
 * The header as the layout composes it, for ONE Spoke's site + locale + route.
 *
 * `siteSwitch` is DELIBERATELY absent: every Spoke here declares exactly one Site, so there is nothing
 * to switch between and the control is not offered (§11). Its absence is asserted below, not assumed.
 */
async function headerHtml(
  spoke: DeploymentSpoke,
  options: { readonly siteCode: string; readonly localePath: string; readonly routePath: string },
): Promise<string> {
  const site = siteByCode(spoke, options.siteCode);
  // The header is rendered for the URL the visitor is on: a site's controls offer what THAT site has,
  // so the mocked pathname mirrors the render target.
  mockPath = `/${options.siteCode}/${options.localePath}${
    options.routePath === "" ? "" : `/${options.routePath}`
  }`;

  return renderToStaticMarkup(
    SiteHeader({
      /* M13 — the chrome's Spoke facts travel as explicit inputs: THIS Spoke's own configuration, its own
         dictionary access and its own asset namespaces. Never an installation-wide binding. */
      siteConfig: spoke.config,
      dictionaryAccess: dictionariesFor(spoke),
      assets: createRuntimeAssetOwnershipResolver(spoke.runtimeAssetNamespaces),
      locale: options.localePath,
      resolved: resolveUiConfig(spoke.config.ui ?? {}),
      siteId: site.code,
    }),
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

describe("Foundation Spoke — the `ww` Site alone, with its own page tree", () => {
  it("declares Site `ww` alone, as its default Site", () => {
    expect(FOUNDATION.config.sites.map((site) => site.code)).toEqual([GLOBAL]);
    expect(FOUNDATION.config.defaultSite.code).toBe(GLOBAL);
    expect(siteByCode(FOUNDATION, GLOBAL).label).toBe("Global");
    // The Germany Site is NOT declared here any more (§5): ownership moved to the Germany Spoke.
    expect(FOUNDATION.config.sites.map((site) => site.code)).not.toContain(GERMANY);
  });

  it("keeps that Site's accepted languages, default locale and origin", () => {
    const global = siteByCode(FOUNDATION, GLOBAL);
    expect(global.locales.map((locale) => locale.path)).toEqual(["en", "de"]);
    expect(global.defaultLocale).toBe("en");
    expect(FOUNDATION.config.locales.map((locale) => locale.code)).toEqual(["en", "de"]);
    expect(FOUNDATION.config.defaultLocale).toBe("en");
    expect(FOUNDATION.config.url).toBe("https://foundation-template.provelopment.com");
  });

  it("carries NO Locations, and no Germany-only binding of any kind (§6)", () => {
    expect(regionsForSite(FOUNDATION.config.pageBindings, GLOBAL)).toEqual([]);
    expect(bindingsForSite(FOUNDATION.config.pageBindings, GLOBAL)).toEqual([]);
    expect(FOUNDATION.config.regions).toEqual({});
    expect(FOUNDATION.config.pageBindings).toEqual([]);
  });

  it("resolves its own Home and About in BOTH of its languages, from its OWN roots", async () => {
    const pages = pagesFor(FOUNDATION);
    const englishHome = await pages.resolve(GLOBAL, HOME_CONTENT_SLUG, "en");
    const englishAbout = await pages.resolve(GLOBAL, "about", "en");
    const germanHome = await pages.resolve(GLOBAL, HOME_CONTENT_SLUG, "de");
    const germanAbout = await pages.resolve(GLOBAL, "about", "de");

    expect(englishAbout?.title).toBe(GLOBAL_ABOUT_TITLE);
    // `de` on this Spoke is a LANGUAGE, not a Site: Global's German pages are Global's own, authored in
    // its own tree (foundation/content/pages/**/ww/de/**), and each one answers rather than falling back.
    for (const [label, page] of [
      ["ww/en", englishHome],
      ["ww/en/about", englishAbout],
      ["ww/de", germanHome],
      ["ww/de/about", germanAbout],
    ] as const) {
      expect(page, label).not.toBeNull();
      expect(page?.fallback, `${label} is authored, not a fallback`).toBe(false);
    }
    // …and Global's German About is NOT the Germany Spoke's About page.
    expect(germanAbout?.title).not.toBe(GERMAN_ABOUT_TITLE);
    expect(germanHome?.title).not.toBe(GERMAN_HOME_TITLE);
  });

  it("cannot resolve ANY Germany Spoke coordinate, in either of its languages (§10)", async () => {
    const pages = pagesFor(FOUNDATION);
    for (const locale of [GERMANY, "en"] as const) {
      expect(await pages.resolve(GERMANY, HOME_CONTENT_SLUG, locale), `de/${locale}`).toBeNull();
    }
    // The location landings exist only in Germany's tree.
    expect(await pages.resolve(GLOBAL, "berlin", GERMANY)).toBeNull();
    expect(await pages.resolve(GLOBAL, "frankfurt", GERMANY)).toBeNull();
    expect(await pages.resolve(GLOBAL, "berlin", "en")).toBeNull();
    expect(await pages.resolve(GLOBAL, "frankfurt", "en")).toBeNull();
  });

  it("offers the controls it actually has, in the accepted order — and no Site control (§12)", async () => {
    const english = await headerHtml(FOUNDATION, { siteCode: GLOBAL, localePath: "en", routePath: "" });
    const german = await headerHtml(FOUNDATION, { siteCode: GLOBAL, localePath: "de", routePath: "" });

    expect(selectorOrder(english)).toEqual(["layout", "language"]);
    expect(selectorOrder(german)).toEqual(["layout", "language"]);
    // ONE Site ⇒ nothing to switch between, so no Site control and no cross-Spoke selector is invented.
    expect(english).not.toContain('data-selector="site"');
    expect(german).not.toContain('data-selector="site"');
    // …and NO Location control, because this Spoke binds no location at all.
    expect(english).not.toContain('data-selector="location"');
    expect(german).not.toContain('data-selector="location"');
    // The Language control offers exactly this Site's own languages, and nothing else is named.
    expect(selectorOptions(english, "language").join(" | ")).toContain("English");
    expect(selectorOptions(german, "language").join(" | ")).toContain("Deutsch");
  });

  it("renders its own dictionary wording and its own asset namespace (never the other Spoke's)", async () => {
    const dictionaries = dictionariesFor(FOUNDATION);
    expect(dictionaries.get("en").language.label).toBe("Language");
    expect(dictionaries.get("de").language.label).toBe("Sprache");
    expect(dictionaries.get("en").navigation.items["/about"]).toBe("About");

    const namespaces = createRuntimeAssetOwnershipResolver(FOUNDATION.runtimeAssetNamespaces)
      .namespaces.map((namespace) => namespace.urlBase);
    expect(namespaces).toEqual(["/assets", "/spokes/foundation/assets"]);

    const html = await headerHtml(FOUNDATION, { siteCode: GLOBAL, localePath: "en", routePath: "" });
    expect(html).not.toContain(`/spokes/${GERMANY}/assets/`);
  });
});

describe("Germany Spoke — the `de` Site alone, with its own page tree and Locations", () => {
  it("declares Site `de` alone, as its default Site, on its own origin", () => {
    expect(GERMANY_SPOKE.config.sites.map((site) => site.code)).toEqual([GERMANY]);
    expect(GERMANY_SPOKE.config.defaultSite.code).toBe(GERMANY);
    expect(siteByCode(GERMANY_SPOKE, GERMANY).label).toBe("Germany");
    expect(GERMANY_SPOKE.config.url).toBe("https://foundation-template-germany.provelopment.com");
    expect(GERMANY_SPOKE.config.sites.map((site) => site.code)).not.toContain(GLOBAL);
  });

  it("keeps its languages, its default locale and its country canonical variants (§9)", () => {
    const germany = siteByCode(GERMANY_SPOKE, GERMANY);
    expect(germany.locales.map((locale) => locale.path)).toEqual([GERMANY, "en"]);
    expect(germany.defaultLocale).toBe(GERMANY);
    // A country site derives its own variant: `/de/de` IS `de-DE` and `/de/en` IS `en-DE`.
    expect(germany.locales.map((locale) => locale.canonical)).toEqual(["de-DE", "en-DE"]);
  });

  it("binds exactly Berlin and Frankfurt, with the accepted demonstration data (§9)", () => {
    const bindings = bindingsForSite(GERMANY_SPOKE.config.pageBindings, GERMANY);
    expect(regionsForSite(GERMANY_SPOKE.config.pageBindings, GERMANY)).toEqual(["berlin", "frankfurt"]);
    expect(bindings.map((binding) => `${binding.locale}/${binding.region}`).sort()).toEqual([
      "de/berlin",
      "de/frankfurt",
      "en/berlin",
      "en/frankfurt",
    ]);
    expect(bindings.every((binding) => binding.slug === null)).toBe(true);
    // Both locations are landings in BOTH of this Site's languages.
    expect(regionsForLocale(bindings, GERMANY)).toEqual(["berlin", "frankfurt"]);
    expect(regionsForLocale(bindings, "en")).toEqual(["berlin", "frankfurt"]);
    expect(localesForRegion(bindings, "berlin")).toEqual([GERMANY, "en"]);
    expect(localesForRegion(bindings, "frankfurt")).toEqual([GERMANY, "en"]);

    for (const region of ["berlin", "frankfurt"] as const) {
      expect(GERMANY_SPOKE.config.regions[region]?.timezone).toBe("Europe/Berlin");
      expect(GERMANY_SPOKE.config.regions[region]?.address.street).toBe("Example Street 1");
      const hours = GERMANY_SPOKE.config.regions[region]?.hours as unknown as Readonly<
        Record<string, readonly unknown[]>
      >;
      for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) {
        expect(hours[day], `${region}.${day}`).toHaveLength(0);
      }
    }
  });

  it("resolves EVERY Germany coordinate from its OWN roots (§10)", async () => {
    const pages = pagesFor(GERMANY_SPOKE);
    const expected = [
      [GERMANY, HOME_CONTENT_SLUG, GERMAN_HOME_TITLE],
      [GERMANY, "about", ""],
      [GERMANY, "berlin", "Berlin"],
      [GERMANY, "frankfurt", ""],
      ["en", HOME_CONTENT_SLUG, GERMANY_ENGLISH_HOME_TITLE],
      ["en", "about", GERMAN_ABOUT_TITLE],
      ["en", "berlin", ""],
      ["en", "frankfurt", "Frankfurt"],
    ] as const;

    for (const [locale, slug, title] of expected) {
      const page = await pages.resolve(GERMANY, slug, locale);
      expect(page, `/de/${locale}/${slug}`).not.toBeNull();
      expect(page?.fallback, `/de/${locale}/${slug} is authored`).toBe(false);
      if (title !== "") expect(page?.title, `${locale}/${slug}`).toBe(title);
    }
    // `/de/en` is Germany's OWN English Home, never Global's English Home.
    expect((await pages.resolve(GERMANY, HOME_CONTENT_SLUG, "en"))?.title).toBe(GERMANY_ENGLISH_HOME_TITLE);
  });
});

describe("Germany Spoke — Locations, controls and ownership", () => {
  it("cannot resolve the Foundation Spoke's own coordinates (§10)", async () => {
    const pages = pagesFor(GERMANY_SPOKE);
    expect(await pages.resolve(GLOBAL, HOME_CONTENT_SLUG, "en")).toBeNull();
    expect(await pages.resolve(GLOBAL, "about", "en")).toBeNull();
    expect(await pages.resolve(GLOBAL, HOME_CONTENT_SLUG, GERMANY)).toBeNull();
  });

  it("keeps a Location inside Site `de`, and keeps the active language when it serves it (§14)", () => {
    const bindings = bindingsForSite(GERMANY_SPOKE.config.pageBindings, GERMANY);
    // The neutral choice is the Site's own non-regional page — still inside Site `de`.
    expect(unspecifiedDestination(GERMANY, null, `/${GERMANY}`)).toBe("/de/de");
    expect(
      resolveLocationDestination({ entries: bindings, locale: GERMANY, targetRegion: "berlin", currentSlug: null }),
    ).toEqual({ locale: GERMANY, region: "berlin", slug: null });
    expect(
      resolveLocationDestination({ entries: bindings, locale: "en", targetRegion: "frankfurt", currentSlug: null }),
    ).toEqual({ locale: "en", region: "frankfurt", slug: null });
    // The public route it produces is this Site's own regional route.
    expect(regionalPath(GERMANY, "berlin", null, `/${GERMANY}`)).toBe("/de/de/berlin");
    expect(regionalPath("en", "frankfurt", null, `/${GERMANY}`)).toBe("/de/en/frankfurt");
    // Switching LANGUAGE keeps the location when the target locale serves it.
    expect(resolveLocaleDestination(bindings, "en", "berlin", null)).toEqual({ region: "berlin", slug: null });
    expect(resolveLocaleDestination(bindings, GERMANY, "frankfurt", null)).toEqual({ region: "frankfurt", slug: null });
    // Foundation binds no location, so no destination can resolve there.
    expect(
      resolveLocationDestination({
        entries: bindingsForSite(FOUNDATION.config.pageBindings, GLOBAL),
        locale: "de",
        targetRegion: "berlin",
        currentSlug: null,
      }),
    ).toBeNull();
    expect(regionsForSite(FOUNDATION.config.pageBindings, GERMANY)).toEqual([]);
  });

  it("offers the Location and Language controls, in order, and no Site control (§13)", async () => {
    const english = await headerHtml(GERMANY_SPOKE, { siteCode: GERMANY, localePath: "en", routePath: "" });
    const german = await headerHtml(GERMANY_SPOKE, { siteCode: GERMANY, localePath: GERMANY, routePath: "" });
    expect(selectorOrder(english)).toEqual(["layout", "location", "language"]);
    expect(selectorOrder(german)).toEqual(["layout", "location", "language"]);
    for (const html of [english, german]) {
      const order = selectorOrder(html);
      expect(new Set(order).size, "each control appears once").toBe(order.length);
      expect(html).not.toContain('data-selector="site"');
    }
    expect(selectorOptions(english, "location")).toEqual(["All locations", "Berlin", "Frankfurt"]);
    expect(selectorOptions(german, "location")).toEqual(["Alle Standorte", "Berlin", "Frankfurt"]);
  });

  it("renders its own dictionary wording and its own asset namespace (§15/§16)", async () => {
    const dictionaries = dictionariesFor(GERMANY_SPOKE);
    expect(dictionaries.get(GERMANY).language.label).toBe("Sprache");
    expect(dictionaries.get("en").language.label).toBe("Language");
    expect(dictionaries.get(GERMANY).location.unspecified).toBe("Alle Standorte");
    // Different roots, different access objects: neither Spoke reads the other's dictionary tree.
    expect(GERMANY_SPOKE.resources.dictionaryRoot).not.toBe(FOUNDATION.resources.dictionaryRoot);
    expect(dictionariesFor(FOUNDATION)).not.toBe(dictionaries);

    const namespaces = createRuntimeAssetOwnershipResolver(GERMANY_SPOKE.runtimeAssetNamespaces)
      .namespaces.map((namespace) => namespace.urlBase);
    expect(namespaces).toEqual(["/assets", "/spokes/germany/assets"]);

    const html = await headerHtml(GERMANY_SPOKE, { siteCode: GERMANY, localePath: GERMANY, routePath: "" });
    expect(html).not.toContain("/spokes/foundation/assets/");
  });
});




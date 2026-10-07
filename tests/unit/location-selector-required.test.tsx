/**
 * THE LOCATION SELECTOR UNDER A REQUIRED-LOCATION POLICY (FOUNDATION-LOC1)
 * ======================================================================
 *
 * The Location control is the one surface where the two modes are VISIBLE to a visitor, so it is proved
 * rendered — not merely by a pure function's return value:
 *
 *   OPTIONAL Site  the explicit unspecified option is present, and the inventory keeps the accepted
 *                  deterministic (label) ordering;
 *   REQUIRED Site  there is NO unspecified option, and the configured default Location leads.
 *
 * The projection is built from this file's own configuration (the SAME builder the server uses), so the
 * control resolves its real destinations and its real policy.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let currentPath = "/ca/en/beta";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: () => {} }),
}));

import { ClientRoutingProvider } from "@/components/site/client-routing-context";
import { buildClientRoutingContext } from "@/components/site/client-routing";
import { LocationSwitcher } from "@/components/site/location-switcher";
import { parseSiteConfig } from "@/config/loader";
import type { SiteConfig } from "@/config/site-config";
import { siteSetOf } from "@/core/site";

const REGION_BASE = {
  timezone: "America/Toronto",
  address: { street: "1 Example Road", city: "Exampleville", country: "Canada" },
  hours: {},
};

/** Labels chosen so the accepted alphabetical order (`Alpha`, `Beta`) is NOT the default-first order. */
const REGIONS = {
  beta: { ...REGION_BASE, label: "Beta" },
  alpha: { ...REGION_BASE, label: "Alpha" },
  /** LOC2 — a third Location, bound only where a refinement names it. */
  gamma: { ...REGION_BASE, label: "Gamma" },
};

const BASE = {
  site: {
    url: "https://example.test",
    name: "Example",
    tagline: "An example",
    description: "A deployment used to prove the Location selector's two modes.",
  },
  i18n: {
    defaultLocale: "en",
    locales: [{ code: "en", label: "English" }],
  },
  defaultSite: "ww",
  contact: { email: "fixture@example.test" },
  socialLinks: [],
  navigation: [{ label: "Home", href: "/" }],
  business: {
    regions: REGIONS,
    pages: [
      { site: "ca", locale: "en", region: "beta" },
      { site: "ca", locale: "en", region: "alpha" },
    ],
  },
};

function config(sites: readonly Record<string, unknown>[]): SiteConfig {
  return parseSiteConfig({ ...BASE, sites });
}

const optional = config([
  { code: "ww", label: "Global" },
  { code: "ca", label: "Canada", locales: ["en"], defaultLocale: "en" },
]);
const required = config([
  { code: "ww", label: "Global" },
  {
    code: "ca",
    label: "Canada",
    locales: ["en"],
    defaultLocale: "en",
    locationSelection: { mode: "required", default: "beta" },
  },
]);

/** The rendered options of the Location control, in DOM order, as `[value, label]`. */
function locationOptions(
  siteConfig: SiteConfig,
  path: string,
  locale = "en",
): readonly (readonly [string, string])[] {
  currentPath = path;
  const html = renderToStaticMarkup(
    <ClientRoutingProvider
      routing={buildClientRoutingContext(
        siteConfig,
        siteSetOf(siteConfig.sites, siteConfig.defaultSite),
      )}
    >
      <LocationSwitcher
        locale={locale}
        label="Location"
        unspecifiedLabel="All locations"
        regionLabels={{ beta: "Beta", alpha: "Alpha", gamma: "Gamma" }}
      />
    </ClientRoutingProvider>,
  );

  return [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(
    (match) => [match[1] as string, match[2] as string] as const,
  );
}

describe("an OPTIONAL Site keeps its unspecified option and its accepted ordering", () => {
  it("offers the unspecified option FIRST, then the inventory in label order", () => {
    expect(locationOptions(optional, "/ca/en/beta")).toEqual([
      ["", "All locations"],
      ["alpha", "Alpha"],
      ["beta", "Beta"],
    ]);
  });

  it("still shows the visitor's actual Location as the current selection", () => {
    const options = locationOptions(optional, "/ca/en/alpha");
    expect(options.map(([value]) => value)).toEqual(["", "alpha", "beta"]);
  });
});

describe("a REQUIRED Site offers NO unspecified option, and leads with its default Location", () => {
  it("drops the unspecified option entirely", () => {
    const options = locationOptions(required, "/ca/en/beta");
    expect(options.map(([value]) => value)).toEqual(["beta", "alpha"]);
    expect(options.some(([, label]) => label === "All locations")).toBe(false);
  });

  it("keeps the remaining Locations in the accepted label order", () => {
    expect(locationOptions(required, "/ca/en/beta")).toEqual([
      ["beta", "Beta"],
      ["alpha", "Alpha"],
    ]);
  });

  it("never renders an empty-valued option, whatever path it is read on", () => {
    for (const path of ["/ca/en", "/ca/en/beta", "/ca/en/alpha"]) {
      const options = locationOptions(required, path);
      expect(options.some(([value]) => value === "")).toBe(false);
      expect(options[0]?.[0]).toBe("beta");
    }
  });
});

/**
 * LOC2 — THE EFFECTIVE DEFAULT IS PER LOCALE (FOUNDATION-LOC2)
 * ==========================================================
 *
 * The control leads with the Location the adopter's REFINEMENT names for the locale being READ, and with
 * the site-wide default in every other locale — the same ONE rule the route boundary asks, read for this
 * locale. The optional mode and the active selection are unchanged: the refinement supplies the leading
 * option, never the selection, which is still the URL's own Location.
 */
const localeRefined = parseSiteConfig({
  ...BASE,
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English" },
      { code: "de", label: "Deutsch" },
    ],
  },
  sites: [
    { code: "ww", label: "Global" },
    {
      code: "ca",
      label: "Canada",
      locales: ["en", "de"],
      defaultLocale: "en",
      locationSelection: { mode: "required", default: "beta", localeDefaults: { de: "gamma" } },
    },
  ],
  business: {
    regions: REGIONS,
    pages: [
      { site: "ca", locale: "en", region: "beta" },
      { site: "ca", locale: "en", region: "alpha" },
      { site: "ca", locale: "de", region: "gamma" },
      { site: "ca", locale: "de", region: "beta" },
    ],
  },
});

describe("LOC2 — the control leads with the EFFECTIVE default for the locale it is read in", () => {
  it("leads with the refined Location on the locale the refinement names", () => {
    const options = locationOptions(localeRefined, "/ca/de/gamma", "de");
    // The accepted label order is Alpha, Beta, Gamma; the refinement lifts Gamma to the front.
    expect(options.map(([value]) => value)).toEqual(["gamma", "alpha", "beta"]);
    expect(options.some(([, label]) => label === "All locations")).toBe(false);
  });

  it("leads with the site-wide default on an unmapped locale of the SAME Site", () => {
    const options = locationOptions(localeRefined, "/ca/en/beta", "en");
    expect(options.map(([value]) => value)).toEqual(["beta", "alpha", "gamma"]);
    expect(options.some(([, label]) => label === "All locations")).toBe(false);
  });

  it("leaves the OPTIONAL mode exactly as it was, in every locale", () => {
    for (const locale of ["en", "de"]) {
      const options = locationOptions(optional, "/ca/en/beta", locale);
      expect(options[0]).toEqual(["", "All locations"]);
    }
  });
});

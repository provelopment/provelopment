import { describe, expect, it } from "vitest";

import { completePublicPath } from "@/app/[[...segments]]/spoke-navigation";
import { parseSiteConfig } from "@/config/loader";
import type { SiteConfig } from "@/config/site-config";
import type { OperationalRegion } from "@/core/region";
import {
  assertLocationSelectionValid,
  locationSelectionIssues,
  orderedLocationIdsForSelector,
} from "@/core/location-selection";
import { resolveSites } from "@/core/site";

/**
 * A SITE THAT REQUIRES A LOCATION (FOUNDATION-LOC1)
 * =================================================
 *
 * THE CAPABILITY: an OPTIONAL per-Site policy that states "every visitor of this Site is inside one of
 * its Locations". This suite proves it through the REAL seams — the schema, the loader, the resolver and
 * the public path completion — and proves, just as carefully, that an ABSENT policy changes NOTHING.
 *
 * The fixture vocabulary is deliberately synthetic and neutral (`north`, `south`, `far`): the capability
 * is generic, so no test may encode a real deployment's place names, and none does.
 *
 * The two Sites below differ in exactly one way — `ca` requires a Location, `ww` does not — which is what
 * makes "the policy is per Site" and "another Site's Location cannot satisfy it" measurable rather than
 * asserted.
 */

const SITE_BASE = {
  url: "https://example.test",
  name: "Example",
  tagline: "An example",
  description: "A deployment used to prove the Location-selection policy.",
};

/** One Location of the fixture. `defaultLocale` is deliberately NOT set — the accepted rule derives it. */
type RegionFixture = {
  readonly timezone: string;
  readonly address: OperationalRegion["address"];
  /** The loader completes an omitted schedule, so the fixture authors only what it asserts. */
  readonly hours: Record<string, unknown>;
  readonly defaultLocale?: string;
};

const REGION_BASE: RegionFixture = {
  timezone: "America/Toronto",
  address: { street: "1 Example Road", city: "Exampleville", country: "Canada" },
  hours: {},
};
/** `north` (the Location `ca` requires), `south` (a second Location of `ca`), `far` (NOT `ca`'s). */
const REGIONS = { north: REGION_BASE, south: REGION_BASE, far: REGION_BASE };

/** Every binding the two Sites share: `ca` owns `north`+`south`, `ww` owns `far` only. */
const BINDINGS = [
  { site: "ca", locale: "en", region: "north" },
  { site: "ca", locale: "en", region: "north", slug: "about" },
  { site: "ca", locale: "en", region: "south" },
  { site: "ca", locale: "de", region: "north" },
  { site: "ww", locale: "en", region: "far" },
];

/** The SAME deployment with no policy anywhere: the established optional behaviour, untouched. */
const OPTIONAL_RAW = {
  site: SITE_BASE,
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English" },
      { code: "de", label: "Deutsch" },
    ],
  },
  sites: [
    { code: "ww", label: "Global" },
    { code: "ca", label: "Canada", locales: ["en", "de"], defaultLocale: "en" },
  ],
  defaultSite: "ww",
  contact: { email: "fixture@example.test" },
  socialLinks: [],
  navigation: [{ label: "Home", href: "/" }],
  business: { regions: REGIONS, pages: BINDINGS },
};

/** The same deployment, with `ca` requiring `north` — the ONE difference under test. */
const REQUIRED_RAW = {
  ...OPTIONAL_RAW,
  sites: [
    { code: "ww", label: "Global" },
    {
      code: "ca",
      label: "Canada",
      locales: ["en", "de"],
      defaultLocale: "en",
      locationSelection: { mode: "required", default: "north" },
    },
  ],
};

const optional: SiteConfig = parseSiteConfig(OPTIONAL_RAW);
const required: SiteConfig = parseSiteConfig(REQUIRED_RAW);

/**
 * The SAME required Site, with its default Location bound to `en` only — the shape that makes the
 * accepted default-locale rule observable (`/ca/de` has no `de` landing of `north` to keep).
 */
const requiredEnOnly: SiteConfig = parseSiteConfig({
  ...REQUIRED_RAW,
  business: {
    regions: REGIONS,
    pages: BINDINGS.filter(
      (binding) => !(binding.site === "ca" && binding.locale === "de" && binding.region === "north"),
    ),
  },
});

/** The public redirect the boundary completes `path` to, or `null` when the path is already complete. */
function completionFor(config: SiteConfig, path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  const completion = completePublicPath(config, segments, {});
  return "redirectPath" in completion ? completion.redirectPath : null;
}

describe("an ABSENT policy leaves the established optional behaviour untouched", () => {
  it("resolves every Site with no policy at all", () => {
    expect(optional.sites.map((site) => site.locationSelection ?? null)).toEqual([null, null]);
  });

  it("still answers a non-regional Site path with its own page, not a redirect", () => {
    // The exact behaviour that must not change: `/{site}/{locale}` and `/{site}/{locale}/{route}` are
    // complete public paths for an optional Site.
    expect(completionFor(optional, "/ca/en")).toBeNull();
    expect(completionFor(optional, "/ca/en/about")).toBeNull();
    expect(completionFor(optional, "/ww/en")).toBeNull();
  });

  it("still completes a bare Site path, exactly as before", () => {
    expect(completionFor(optional, "/ca")).toBe("/ca/en");
    expect(completionFor(optional, "/")).toBe("/ww/en");
    expect(completionFor(optional, "/en/about")).toBe("/ww/en/about");
  });

  it("keeps the selector's inventory and ordering exactly as the caller computed it", () => {
    const inventory = ["south", "far", "north"];
    expect(orderedLocationIdsForSelector(inventory, null)).toEqual(inventory);
    expect(orderedLocationIdsForSelector(inventory, undefined)).toEqual(inventory);
  });
});

describe("a REQUIRED Site completes non-regional public paths into its default Location", () => {
  it("completes the Site root and the bare-Site path, in ONE hop", () => {
    expect(completionFor(required, "/ca")).toBe("/ca/en/north");
    expect(completionFor(required, "/ca/en")).toBe("/ca/en/north");
  });

  it("completes a page that the default Location has", () => {
    expect(completionFor(required, "/ca/en/about")).toBe("/ca/en/north/about");
  });

  it("falls back to the default Location's landing when it does not have the page", () => {
    // `/ca/en/faqs` names no Location, and `north` has no `faqs` page: the accepted Location
    // destination rule answers with the Location's landing rather than guessing a page.
    expect(completionFor(required, "/ca/en/faqs")).toBe("/ca/en/north");
    expect(completionFor(required, "/ca/en/legal/privacy")).toBe("/ca/en/north");
  });

  it("keeps the requested locale when the default Location is bound to it", () => {
    expect(completionFor(required, "/ca/de")).toBe("/ca/de/north");
    expect(completionFor(required, "/ca/de/north")).toBeNull();
  });

  it("uses the accepted default-locale rule when the requested locale is not bound to the Location", () => {
    // `north` is bound to `en` only in THIS Site, while the Site also serves `de`: a `de` request names
    // no Location, and the accepted `regionDefaultLocale` rule decides the landing's locale — exactly as
    // the Location selector and language switcher already do. No second locale algorithm is introduced.
    expect(completionFor(requiredEnOnly, "/ca/de")).toBe("/ca/en/north");
    expect(completionFor(requiredEnOnly, "/ca/de/about")).toBe("/ca/en/north");
  });

  it("leaves a path that ALREADY names one of the Site's Locations alone", () => {
    // The Location stays URL-authoritative: a visitor in `south` — or in `north` — stays exactly there,
    // and the default Location is never forced on a request that already names a place.
    expect(completionFor(required, "/ca/en/north")).toBeNull();
    expect(completionFor(required, "/ca/en/north/about")).toBeNull();
    expect(completionFor(required, "/ca/en/south")).toBeNull();
  });

  it("keeps language switching inside the selected Location (existing semantics)", () => {
    // The same (region, page) in the requested locale where it exists…
    expect(completionFor(required, "/ca/en/north/about")).toBeNull();
    expect(completionFor(required, "/ca/de/north")).toBeNull();
    // …and where the requested locale is not bound to the named page, the accepted Location destination
    // rule answers with the default Location's landing in THAT locale — never a second rule.
    expect(completionFor(required, "/ca/de/south")).toBe("/ca/de/north");
  });
});

describe("a REQUIRED policy is scoped to its Site — never a deployment-wide switch", () => {
  it("does not affect another Site's paths", () => {
    expect(completionFor(required, "/ww/en")).toBeNull();
    expect(completionFor(required, "/ww/en/far")).toBeNull();
  });

  it("does not affect the site-less shorthand of the untouched default Site", () => {
    expect(completionFor(required, "/en/about")).toBe("/ww/en/about");
  });

  it("cannot be satisfied by another Site's Location", () => {
    const issues = locationSelectionIssues({
      sites: [
        {
          code: "ca",
          locationSelection: { mode: "required", default: "far" },
        },
      ],
      regions: REGIONS,
      bindings: [
        { site: "ca", locale: "en", region: "north", slug: null },
        { site: "ww", locale: "en", region: "far", slug: null },
      ],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('Site "ca"');
    expect(issues[0]?.message).toContain('locationSelection.default "far"');
    expect(issues[0]?.message).toContain("not part of THIS Site's Location inventory");
  });
});

describe("a policy that cannot be honoured is refused at configuration time", () => {
  const base = REQUIRED_RAW;

  it("refuses `required` with NO default", () => {
    expect(() =>
      parseSiteConfig({
        ...base,
        sites: [
          { code: "ww", label: "Global" },
          {
            code: "ca",
            locales: ["en", "de"],
            defaultLocale: "en",
            locationSelection: { mode: "required" },
          },
        ],
      }),
    ).toThrow(/locationSelection\.default/);
  });

  it("refuses a mode other than `required` (there is no second mode)", () => {
    const raw = {
      ...base,
      sites: [
        { code: "ww", label: "Global" },
        {
          code: "ca",
          locales: ["en", "de"],
          defaultLocale: "en",
          locationSelection: { mode: "optional", default: "north" },
        },
      ],
    };
    expect(() => parseSiteConfig(raw)).toThrow(/locationSelection\.mode/);
    // …and the SITE RESOLVER refuses it too, through the same shape rule: validation and resolution
    // cannot disagree about what an author wrote.
    expect(() =>
      resolveSites({
        input: [{ code: "ww", locationSelection: { mode: "optional", default: "north" } }],
        defaultLocale: "en",
        locales: ["en"],
      }),
    ).toThrow(/locationSelection\.mode/);
  });

  it("refuses a default that names no configured Location", () => {
    expect(() =>
      parseSiteConfig({
        ...base,
        sites: [
          { code: "ww", label: "Global" },
          {
            code: "ca",
            locales: ["en", "de"],
            defaultLocale: "en",
            locationSelection: { mode: "required", default: "nowhere" },
          },
        ],
      }),
    ).toThrow(/not an operating Location/);
  });

  it("refuses a Site that binds NO Location at all", () => {
    expect(() =>
      parseSiteConfig({
        ...base,
        sites: [
          ...base.sites,
          {
            code: "fr",
            label: "France",
            locales: ["en"],
            defaultLocale: "en",
            locationSelection: { mode: "required", default: "north" },
          },
        ],
      }),
    ).toThrow(/binds NO Location at all/);
  });

  it("refuses a default Location of ANOTHER Site", () => {
    expect(() =>
      parseSiteConfig({
        ...base,
        sites: [
          { code: "ww", label: "Global" },
          {
            code: "ca",
            locales: ["en", "de"],
            defaultLocale: "en",
            locationSelection: { mode: "required", default: "far" },
          },
        ],
      }),
    ).toThrow(/not part of THIS Site's Location inventory/);
  });

  it("refuses a default Location with no usable landing in THIS Site", () => {
    // `north` declares `de` as its default locale, but `de` is bound to `north` only in the OTHER Site —
    // so the accepted default-locale rule would send a `ca` visitor to a landing `ca` does not have.
    const raw = {
      ...base,
      business: {
        regions: { ...REGIONS, north: { ...REGION_BASE, defaultLocale: "de" } },
        pages: [
          { site: "ca", locale: "en", region: "north" },
          { site: "ww", locale: "de", region: "north" },
        ],
      },
    };
    expect(() => parseSiteConfig(raw)).toThrow(/no usable landing destination/);
  });

  it("names the Site, the configured default Location and the rule it broke", () => {
    const issues = locationSelectionIssues({
      sites: [{ code: "ca", locationSelection: { mode: "required", default: "nowhere" } }],
      regions: REGIONS,
      bindings: [{ site: "ca", locale: "en", region: "north", slug: null }],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.siteCode).toBe("ca");
    expect(issues[0]?.message).toContain('Site "ca"');
    expect(issues[0]?.message).toContain('locationSelection.default "nowhere"');
    expect(issues[0]?.message).toContain("not an operating Location");
    // The message names what IS configured, so the author can fix it without reading the source.
    expect(issues[0]?.message).toContain("north");
  });

  it("accepts a policy that IS honourable, and writes nothing back to it", () => {
    expect(() => assertLocationSelectionValid({
      sites: [{ code: "ca", locationSelection: { mode: "required", default: "north" } }],
      regions: REGIONS,
      bindings: [{ site: "ca", locale: "en", region: "north", slug: null }],
    })).not.toThrow();
  });
});
describe("a REQUIRED policy is carried on the Site that declares it", () => {
  it("carries the policy on `ca` and nothing on `ww`", () => {
    expect(required.sites.find((site) => site.code === "ca")?.locationSelection).toEqual({
      mode: "required",
      default: "north",
    });
    expect(required.sites.find((site) => site.code === "ww")?.locationSelection ?? null).toBeNull();
  });

  it("accepts the policy without inventing anything else about the Site", () => {
    const canada = required.sites.find((site) => site.code === "ca");
    expect(canada?.locales.map((locale) => locale.path)).toEqual(["en", "de"]);
    expect(canada?.isDefault).toBe(false);
  });

  it("leads the selector with the configured default Location, then the caller's order", () => {
    const policy = { mode: "required", default: "north" } as const;
    expect(orderedLocationIdsForSelector(["south", "north"], policy)).toEqual(["north", "south"]);
    // A default that is NOT in the inventory cannot reorder anything (validation refuses it first).
    expect(orderedLocationIdsForSelector(["south", "north"], { mode: "required", default: "far" })).toEqual([
      "south",
      "north",
    ]);
  });
});

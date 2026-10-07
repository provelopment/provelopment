import { describe, expect, it } from "vitest";

import { completePublicPath } from "@/app/[[...segments]]/spoke-navigation";
import { parseSiteConfig } from "@/config/loader";
import type { SiteConfig } from "@/config/site-config";
import type { OperationalRegion } from "@/core/region";
import {
  assertLocationSelectionValid,
  effectiveDefaultLocation,
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
    expect(orderedLocationIdsForSelector(inventory, null, "en")).toEqual(inventory);
    expect(orderedLocationIdsForSelector(inventory, undefined, "de")).toEqual(inventory);
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
          locales: [{ path: "en" }, { path: "de" }],
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
      sites: [
        {
          code: "ca",
          locationSelection: { mode: "required", default: "nowhere" },
          locales: [{ path: "en" }, { path: "de" }],
        },
      ],
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
      sites: [
        {
          code: "ca",
          locationSelection: { mode: "required", default: "north" },
          locales: [{ path: "en" }, { path: "de" }],
        },
      ],
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
    expect(orderedLocationIdsForSelector(["south", "north"], policy, "en")).toEqual(["north", "south"]);
    // A default that is NOT in the inventory cannot reorder anything (validation refuses it first).
    expect(
      orderedLocationIdsForSelector(["south", "north"], { mode: "required", default: "far" }, "en"),
    ).toEqual(["south", "north"]);
  });
});

/**
 * LOC2 — EXPLICIT PER-LOCALE DEFAULTS FOR A REQUIRED SITE (FOUNDATION-LOC2)
 * =======================================================================
 *
 * The same capability, refined: an adopter may name the Location that completes an otherwise
 * Location-less request FOR ONE LOCALE. What this suite proves, in the order it is asserted:
 *
 *   · an existing LOC1 policy (no `localeDefaults`) behaves EXACTLY as before — measured against the SAME
 *     Site WITH a refinement, so the difference is the refinement and nothing else;
 *   · a mapped locale uses ITS Location, an unmapped locale keeps the site-wide default, and a mapped
 *     locale's page is completed into that Location's equivalent page;
 *   · a URL that already names a Location is untouched — in any locale, including the refined one — so
 *     Language and Location stay independent dimensions;
 *   · every refinement that could not be honoured is refused at configuration time, naming the Site, the
 *     locale, the configured Location and the violated rule;
 *   · the selector leads with the EFFECTIVE default for the locale it is read in.
 *
 * The vocabulary stays synthetic and neutral (`north`, `south`, `far`, `en`, `de`). Nothing here encodes
 * one deployment's places or languages, and — the point of the whole feature — NO test asserts that a
 * language IS a place: the refinement is authored data.
 */

/** `ca` serves BOTH locales and binds a Location in each, so a `de` refinement has a real destination. */
const LOCALE_REFINED_BINDINGS = [
  { site: "ca", locale: "en", region: "north" },
  { site: "ca", locale: "en", region: "north", slug: "about" },
  { site: "ca", locale: "en", region: "south" },
  { site: "ca", locale: "de", region: "north" },
  { site: "ca", locale: "de", region: "south" },
  { site: "ca", locale: "de", region: "south", slug: "about" },
  { site: "ww", locale: "en", region: "far" },
];

/** `ca` requires `north` and REFINES `de` to `south` — the one difference from the LOC1 fixture. */
const LOCALE_REFINED_RAW = {
  ...REQUIRED_RAW,
  business: { regions: REGIONS, pages: LOCALE_REFINED_BINDINGS },
  sites: [
    { code: "ww", label: "Global" },
    {
      code: "ca",
      label: "Canada",
      locales: ["en", "de"],
      defaultLocale: "en",
      locationSelection: { mode: "required", default: "north", localeDefaults: { de: "south" } },
    },
  ],
};

/** The SAME bindings and locales with NO refinement: LOC1's behaviour, measured side by side. */
const LOCALE_UNREFINED_RAW = {
  ...LOCALE_REFINED_RAW,
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

const localeRefined: SiteConfig = parseSiteConfig(LOCALE_REFINED_RAW);
const localeUnrefined: SiteConfig = parseSiteConfig(LOCALE_UNREFINED_RAW);

/** The refinement exactly as the runtime reads it — the adopter's own data, never inferred. */
const REFINED_POLICY = {
  mode: "required",
  default: "north",
  localeDefaults: { de: "south" },
} as const;

describe("LOC2 — an EXPLICIT locale refinement, and LOC1 unchanged without one", () => {
  it("carries the refinement on the Site that authored it, and nothing on the other", () => {
    expect(localeRefined.sites.find((site) => site.code === "ca")?.locationSelection).toEqual({
      mode: "required",
      default: "north",
      localeDefaults: { de: "south" },
    });
    expect(localeRefined.sites.find((site) => site.code === "ww")?.locationSelection ?? null).toBeNull();
    expect(localeUnrefined.sites.find((site) => site.code === "ca")?.locationSelection).toEqual({
      mode: "required",
      default: "north",
    });
  });

  it("answers the effective default with the ONE rule: refinement first, else the site-wide default", () => {
    expect(effectiveDefaultLocation(REFINED_POLICY, "de")).toBe("south");
    expect(effectiveDefaultLocation(REFINED_POLICY, "en")).toBe("north");
    // An UNMAPPED locale keeps the site-wide default — no inference from the locale's language.
    expect(effectiveDefaultLocation(REFINED_POLICY, "es")).toBe("north");
    // No refinement authored at all: LOC1's answer, in every locale.
    expect(effectiveDefaultLocation({ mode: "required", default: "north" }, "de")).toBe("north");
    // No policy: no default at all (the established optional behaviour).
    expect(effectiveDefaultLocation(null, "de")).toBeNull();
    expect(effectiveDefaultLocation(undefined, "en")).toBeNull();
  });

  it("keeps the LOC1 behaviour EXACTLY when no refinement is authored", () => {
    // The measurement: two configurations whose ONLY difference is the refinement.
    expect(completionFor(localeUnrefined, "/ca/de")).toBe("/ca/de/north");
    // The unrefined Site keeps LOC1's accepted fallback — `north` has no `about` in `de`, so the visitor
    // lands on `north`'s `de` landing…
    expect(completionFor(localeUnrefined, "/ca/de/about")).toBe("/ca/de/north");
    // …while the refined Site preserves the page, because a refinement is validated to be honourable IN
    // its own locale (rule 8), so `south` really has that page in `de`.
    expect(completionFor(localeRefined, "/ca/de")).toBe("/ca/de/south");
    expect(completionFor(localeRefined, "/ca/de/about")).toBe("/ca/de/south/about");
  });

  it("uses the refined Location for ITS locale, and the site-wide default elsewhere", () => {
    expect(completionFor(localeRefined, "/ca/de")).toBe("/ca/de/south");
    expect(completionFor(localeRefined, "/ca/en")).toBe("/ca/en/north");
    // The bare Site path negotiates the Site's OWN default locale, then keeps the same rules.
    expect(completionFor(localeRefined, "/ca")).toBe("/ca/en/north");
  });

  it("completes a mapped locale's page into the refined Location's own equivalent page", () => {
    expect(completionFor(localeRefined, "/ca/de/about")).toBe("/ca/de/south/about");
    // A page the refined Location does not have falls back to ITS landing — the accepted rule, unchanged.
    expect(completionFor(localeRefined, "/ca/de/faqs")).toBe("/ca/de/south");
  });

  it("leaves a URL that ALREADY names a Location alone — in every locale", () => {
    // The URL wins: a visitor in `north` stays in `north`, even in the locale refined to `south`…
    expect(completionFor(localeRefined, "/ca/de/north")).toBeNull();
    expect(completionFor(localeRefined, "/ca/de/north/about")).toBeNull();
    expect(completionFor(localeRefined, "/ca/en/south")).toBeNull();
    // …and the refined Location itself is untouched in its own locale.
    expect(completionFor(localeRefined, "/ca/de/south")).toBeNull();
    expect(completionFor(localeRefined, "/ca/de/south/about")).toBeNull();
  });

  it("stays scoped to its Site: a sibling Site is unaffected", () => {
    expect(completionFor(localeRefined, "/ww/en")).toBeNull();
    expect(completionFor(localeRefined, "/ww/de")).toBeNull();
    expect(completionFor(localeRefined, "/ww/en/far")).toBeNull();
  });

  it("leads the selector with the effective default for the locale being read", () => {
    const inventory = ["alpha", "south", "north"];
    expect(orderedLocationIdsForSelector(inventory, REFINED_POLICY, "de")).toEqual(["south", "alpha", "north"]);
    expect(orderedLocationIdsForSelector(inventory, REFINED_POLICY, "en")).toEqual(["north", "alpha", "south"]);
    // An unrefined LOC1 policy orders identically in EVERY locale (backward compatibility).
    expect(orderedLocationIdsForSelector(inventory, { mode: "required", default: "north" }, "de")).toEqual([
      "north",
      "alpha",
      "south",
    ]);
  });
});

describe("LOC2 — every refinement that cannot be honoured is refused at configuration time", () => {
  /** The refined fixture, with ONE `locationSelection` block replaced: the shape each refusal is read on. */
  const withPolicy = (locationSelection: unknown) => ({
    ...LOCALE_REFINED_RAW,
    sites: [
      { code: "ww", label: "Global" },
      {
        code: "ca",
        label: "Canada",
        locales: ["en", "de"],
        defaultLocale: "en",
        locationSelection,
      },
    ],
  });

  it("refuses a refinement for a locale THIS Site does not serve", () => {
    // `ca` serves `en` and `de`; a refinement for `es` could never complete an `es` request of this Site.
    expect(() =>
      parseSiteConfig(withPolicy({ mode: "required", default: "north", localeDefaults: { es: "south" } })),
    ).toThrow(/"es" is not a locale THIS Site serves/);
  });

  it("refuses a refinement naming a Location that does not exist", () => {
    expect(() =>
      parseSiteConfig(withPolicy({ mode: "required", default: "north", localeDefaults: { de: "nowhere" } })),
    ).toThrow(/the refined Location is not an operating Location/);
  });

  it("refuses a refinement naming ANOTHER Site's Location, and names the Site that owns it", () => {
    // `far` is `ww`'s Location; this `ca` Site's inventory is `north` + `south` only.
    expect(() =>
      parseSiteConfig(withPolicy({ mode: "required", default: "north", localeDefaults: { de: "far" } })),
    ).toThrow(/not part of THIS Site's Location inventory[\s\S]*belongs to Site "ww"/);
  });

  it("refuses a refinement whose Location has no landing in THAT EXACT locale", () => {
    // `south` is bound to `en` only here, so a `de` refinement could only fall back to another locale —
    // exactly what an authored refinement must never do (the site-wide default keeps the fallback rule).
    expect(() =>
      parseSiteConfig({
        ...withPolicy({ mode: "required", default: "north", localeDefaults: { de: "south" } }),
        business: {
          regions: REGIONS,
          pages: [
            { site: "ca", locale: "en", region: "north" },
            { site: "ca", locale: "en", region: "south" },
            { site: "ca", locale: "de", region: "north" },
            { site: "ww", locale: "en", region: "far" },
          ],
        },
      }),
    ).toThrow(/has no landing in THIS EXACT locale/);
  });

  it("refuses a refinement that is not an object of non-empty pairs", () => {
    expect(() =>
      parseSiteConfig(withPolicy({ mode: "required", default: "north", localeDefaults: ["de"] })),
    ).toThrow();
    expect(() =>
      parseSiteConfig(withPolicy({ mode: "required", default: "north", localeDefaults: { de: " " } })),
    ).toThrow();
  });

  it("names the Site, the locale, the configured Location and the violated rule", () => {
    const issues = locationSelectionIssues({
      sites: [
        {
          code: "ca",
          locationSelection: { mode: "required", default: "north", localeDefaults: { es: "south" } },
          locales: [{ path: "en" }, { path: "de" }],
        },
      ],
      regions: REGIONS,
      bindings: [{ site: "ca", locale: "en", region: "north", slug: null }],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.siteCode).toBe("ca");
    expect(issues[0]?.message).toContain('Site "ca"');
    expect(issues[0]?.message).toContain('localeDefaults["es"] "south"');
    expect(issues[0]?.message).toContain("is not a locale THIS Site serves");
    expect(issues[0]?.message).toContain("en, de");
  });

  it("accepts a refinement that IS honourable, and reports ONE issue at a time", () => {
    expect(() =>
      assertLocationSelectionValid({
        sites: [
          {
            code: "ca",
            locationSelection: { mode: "required", default: "north", localeDefaults: { de: "south" } },
            locales: [{ path: "en" }, { path: "de" }],
          },
        ],
        regions: REGIONS,
        bindings: [
          { site: "ca", locale: "en", region: "north", slug: null },
          { site: "ca", locale: "de", region: "south", slug: null },
        ],
      }),
    ).not.toThrow();

    // A policy whose site-wide default is already unhonourable reports that FIRST and does not cascade
    // into the refinements: one policy, one issue, in the order an author would fix them.
    const issues = locationSelectionIssues({
      sites: [
        {
          code: "ca",
          locationSelection: { mode: "required", default: "nowhere", localeDefaults: { es: "south" } },
          locales: [{ path: "en" }, { path: "de" }],
        },
      ],
      regions: REGIONS,
      bindings: [{ site: "ca", locale: "en", region: "north", slug: null }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('locationSelection.default "nowhere"');
  });
});

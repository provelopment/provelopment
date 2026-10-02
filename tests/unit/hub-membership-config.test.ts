import { describe, expect, it } from "vitest";

import { parseSiteConfig } from "@/config";
import { effectiveSitePageConfig } from "@/config/site-page-config";
import { resolveSites } from "@/core/site";
import { hubMembershipIssues, IMPLICIT_HUB_ID } from "@/core/spoke";

/**
 * AUTHORED HUB MEMBERSHIP (FOUNDATION-MULTISITE-S3B)
 * ================================================
 *
 * `sites[].hub` is the FIRST authorable Hub concept: one optional leaf on an EXISTING site entry
 * that names the Hub owning that Site. It has no URL, hostname, path or asset meaning.
 *
 *   no `hub` anywhere  → one implicit Hub holding every resolved Site (today's behaviour)
 *   ANY `hub`          → explicit mode: EVERY Site must declare one, all or none
 *
 * The authored leaves are read through ONE config-layer seam and validated by the accepted pure
 * mechanism, so `resolveSites` still resolves the Spoke-wide population exactly once — never per Hub.
 */

/** A minimal VALID configuration WITHOUT a `sites` block. */
function baseConfig(localeCodes: readonly string[] = ["en"]): Record<string, unknown> {
  return {
    site: {
      url: "https://example.com",
      name: "Example",
      tagline: "Example tagline",
      description: "Example description",
    },
    i18n: {
      defaultLocale: localeCodes[0],
      locales: localeCodes.map((code) => ({ code, label: code })),
    },
    contact: {},
    socialLinks: [],
    navigation: [{ label: "Home", href: "/" }],
  };
}

/** The same configuration; the `sites` block is omitted ENTIRELY when not supplied. */
function configWith(
  sites?: readonly Record<string, unknown>[],
  localeCodes: readonly string[] = ["en"],
): Record<string, unknown> {
  const config = baseConfig(localeCodes);
  return sites === undefined ? config : { ...config, sites };
}

const twoSites = [{ code: "ww" }, { code: "de" }];
const fourExplicit = [
  { code: "ww", hub: "europe" },
  { code: "de", hub: "europe" },
  { code: "ca", hub: "north-america" },
  { code: "us", hub: "north-america" },
];

describe("implicit Hub mode — a configuration that authors no `hub`", () => {
  it("keeps today's deployment: every resolved Site in ONE implicit Hub", () => {
    const config = parseSiteConfig(configWith(twoSites));

    expect(config.hubs).toHaveLength(1);
    expect(config.hubs[0].identity.id).toBe(IMPLICIT_HUB_ID);
    expect(config.hubs[0].sites.map((site) => site.code)).toEqual(["ww", "de"]);
  });

  it("needs no `sites` block at all (absent → implicit ww → implicit Hub)", () => {
    const config = parseSiteConfig(configWith());

    expect(config.sites.map((site) => site.code)).toEqual(["ww"]);
    expect(config.hubs).toHaveLength(1);
    expect(config.hubs[0].identity.id).toBe(IMPLICIT_HUB_ID);
    expect(config.hubs[0].sites.map((site) => site.code)).toEqual(["ww"]);
  });

  it("preserves the Site population, the default Site and every ResolvedSite object", () => {
    const config = parseSiteConfig(configWith(twoSites));

    expect(config.sites.map((site) => site.code)).toEqual(["ww", "de"]);
    expect(config.defaultSite.code).toBe("ww");
    expect(config.hubs.flatMap((hub) => hub.sites)).toHaveLength(config.sites.length);
    for (const site of config.sites) expect(config.hubs[0].sites).toContain(site);
  });

  it("hands the implicit Hub the SAME array and the SAME ResolvedSite objects", () => {
    const config = parseSiteConfig(configWith(twoSites));

    expect(config.hubs[0].sites).toBe(config.sites);
    expect(config.hubs[0].sites[0]).toBe(config.sites[0]);
    expect(config.hubs[0].sites.find((site) => site.isDefault)).toBe(config.defaultSite);
  });

  it("is unchanged for a capsule-shaped deployment that authors no `hub`", () => {
    const config = parseSiteConfig({
      ...baseConfig(["en", "de"]),
      sites: [
        { code: "ww", label: "Global" },
        { code: "de", label: "Germany", locales: ["de", "en"], defaultLocale: "de" },
      ],
      defaultSite: "ww",
    });

    expect(config.sites.map((site) => site.code)).toEqual(["ww", "de"]);
    expect(config.defaultSite.code).toBe("ww");
    expect(config.hubs).toHaveLength(1);
    expect(config.hubs[0].identity.id).toBe(IMPLICIT_HUB_ID);
    expect(config.hubs[0].sites).toBe(config.sites);
  });
});

describe("explicit Hub mode — some Sites author a `hub`", () => {
  it("partitions the Sites into the named Hubs", () => {
    const config = parseSiteConfig(configWith(fourExplicit));

    expect(config.hubs.map((hub) => hub.identity.id)).toEqual(["europe", "north-america"]);
    expect(config.hubs.map((hub) => hub.sites.map((site) => site.code))).toEqual([
      ["ww", "de"],
      ["ca", "us"],
    ]);
  });

  it("keeps ONE resolved Site population, and the SAME objects in the Hubs", () => {
    const config = parseSiteConfig(configWith(fourExplicit));
    const inHubs = config.hubs.flatMap((hub) => hub.sites);

    expect(config.sites.map((site) => site.code)).toEqual(["ww", "de", "ca", "us"]);
    expect(inHubs).toHaveLength(config.sites.length);
    for (const site of config.sites) expect(inHubs).toContain(site); // the very same object
  });

  it("keeps the one Spoke-wide default Site exactly as configured", () => {
    const config = parseSiteConfig(configWith(fourExplicit));

    expect(config.defaultSite.code).toBe("ww");
    expect(config.defaultSite.isDefault).toBe(true);
    expect(
      config.hubs
        .flatMap((hub) => hub.sites.filter((site) => site.isDefault))
        .map((site) => site.code),
    ).toEqual(["ww"]);
  });
  it("keeps Hub ids OPAQUE: an authored id is carried verbatim, never slugged or trimmed", () => {
    const config = parseSiteConfig(
      configWith([
        { code: "ww", hub: "Europe" },
        { code: "de", hub: " europe " },
      ]),
    );

    expect(config.hubs.map((hub) => hub.identity.id)).toEqual(["Europe", " europe "]);
  });
});

describe("incoherent authored membership is REFUSED at build time", () => {
  it("refuses a partially grouped population (all or none)", () => {
    expect(() => parseSiteConfig(configWith([{ code: "ww" }, { code: "de", hub: "europe" }]))).toThrow(
      /Site "ww" has no Hub assignment/,
    );
  });

  it("refuses the reserved implicit Hub id", () => {
    expect(() => parseSiteConfig(configWith([{ code: "ww", hub: IMPLICIT_HUB_ID }]))).toThrow(
      /is reserved for the implicit Hub/,
    );
  });

  it("refuses a PADDED reserved id: padding cannot launder a reserved word", () => {
    expect(() =>
      parseSiteConfig(configWith([{ code: "ww", hub: ` ${IMPLICIT_HUB_ID} ` }])),
    ).toThrow(/is reserved for the implicit Hub/);
  });

  it("refuses a blank Hub id — through the pure membership rule, NOT a schema copy", () => {
    expect(() => parseSiteConfig(configWith([{ code: "ww", hub: "   " }]))).toThrow(
      /sites: assignment #1 gives Site "ww" an empty Hub id/,
    );
  });

  it("refuses an empty Hub id — through the pure membership rule, NOT a schema copy", () => {
    expect(() => parseSiteConfig(configWith([{ code: "ww", hub: "" }]))).toThrow(
      /sites: assignment #1 gives Site "ww" an empty Hub id/,
    );
  });

  it("adds no second authoring surface: an unknown site leaf is still refused", () => {
    expect(() => parseSiteConfig(configWith([{ code: "ww", hubId: "europe" }]))).toThrow(/sites\.0/);
  });
});

describe("valid Hub membership leaves every existing concern alone", () => {
  it("keeps a per-site page override winning over the shared value", () => {
    const config = parseSiteConfig(
      configWith([
        { code: "ww", hub: "europe", navigation: [{ label: "Europa", href: "/europa" }] },
        { code: "de", hub: "europe" },
      ]),
    );

    expect(effectiveSitePageConfig(config, "ww").navigation).toEqual([
      { label: "Europa", href: "/europa" },
    ]);
    expect(effectiveSitePageConfig(config, "de").navigation).toEqual([{ label: "Home", href: "/" }]);
    expect(Object.keys(config.sitePageOverrides)).toEqual(["ww"]);
  });

  it("keeps a per-site locale policy intact", () => {
    const config = parseSiteConfig(
      configWith(
        [
          { code: "ww", hub: "europe" },
          { code: "de", hub: "europe", locales: ["de", "en"], defaultLocale: "de" },
        ],
        ["en", "de"],
      ),
    );

    const de = config.sites.find((site) => site.code === "de");
    expect(de?.defaultLocale).toBe("de");
    expect(de?.locales.map((locale) => locale.path)).toEqual(["de", "en"]);
    expect(config.hubs.map((hub) => hub.identity.id)).toEqual(["europe"]);
  });

  it("keeps regional page bindings working", () => {
    const config = parseSiteConfig({
      ...baseConfig(),
      sites: fourExplicit,
      business: {
        regions: {
          berlin: {
            timezone: "Europe/Berlin",
            name: "Berlin",
            label: "Berlin",
            address: { street: "Example Street 1", city: "Berlin", country: "Germany" },
            hours: {},
          },
        },
        pages: [{ site: "de", locale: "en", region: "berlin" }],
      },
    });

    expect(config.pageBindings).toEqual([{ site: "de", locale: "en", region: "berlin", slug: null }]);
    expect(config.regions.berlin.id).toBe("berlin");
    expect(config.hubs.map((hub) => hub.identity.id)).toEqual(["europe", "north-america"]);
  });
});

describe("the Hub semantics have exactly ONE authority: the pure domain", () => {
  /** The resolved population of `twoSites`, exactly as the pure domain receives it. */
  const resolvedTwoSites = () =>
    resolveSites({ input: twoSites, defaultLocale: "en", locales: ["en"] }).sites;

  it("refuses a blank id with the PURE rule's own message, byte for byte", () => {
    const [issue] = hubMembershipIssues(resolvedTwoSites(), [{ site: "ww", hub: "   " }]);

    expect(issue).toBe('assignment #1 gives Site "ww" an empty Hub id');
    expect(() => parseSiteConfig(configWith([{ code: "ww", hub: "   " }]))).toThrow(issue);
  });

  it("refuses the reserved id with the PURE rule's own message, byte for byte", () => {
    const [issue] = hubMembershipIssues(resolvedTwoSites(), [
      { site: "ww", hub: IMPLICIT_HUB_ID },
    ]);

    expect(issue).toBe(
      'assignment #1: Hub id "implicit" is reserved for the implicit Hub and cannot be ' +
        "explicitly assigned",
    );
    expect(() => parseSiteConfig(configWith([{ code: "ww", hub: IMPLICIT_HUB_ID }]))).toThrow(issue);
  });

  it("keeps the leaf STRUCTURAL: a non-string hub is refused, an ordinary id is verbatim", () => {
    expect(() => parseSiteConfig(configWith([{ code: "ww", hub: 7 }]))).toThrow(/sites\.0\.hub/);
    expect(parseSiteConfig(configWith([{ code: "ww", hub: "Europe" }])).hubs[0].identity.id).toBe(
      "Europe",
    );
  });
});

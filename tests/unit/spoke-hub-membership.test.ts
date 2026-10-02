import { describe, expect, it } from "vitest";

import {
  HubMembershipError,
  IMPLICIT_HUB_ID,
  hubMembershipIssues,
  isCoherentSpokeHub,
  partitionSitesIntoHubs,
  spokeHubIssues,
  type Hub,
  type SiteHubAssignment,
  type SpokeHub,
} from "@/core/spoke";
import { resolveSites, type ResolvedSite } from "@/core/site";

/**
 * HUB MEMBERSHIP — RESOLVE ONCE, THEN PARTITION (FOUNDATION-MULTISITE-S3A)
 * =====================================================================
 *
 * One Spoke-wide Site population, already resolved by the caller (`resolveSites`), is partitioned
 * into Hubs by authored membership.
 *
 *   no membership at all → ONE implicit Hub holding every Site
 *   ANY membership       → explicit mode, and then EVERY Site must be assigned (all or none)
 *
 * The partition never resolves Sites, never invents a Hub and never moves the default: a Hub is a
 * pure container of the very `ResolvedSite` values it was given.
 *
 * The module is unwired (nothing in the application imports it); these tests are its consumer.
 */

/** REAL Foundation Site values — the same ones a deployment's `sites[]` resolves to. */
function sitesFor(...codes: readonly string[]): readonly ResolvedSite[] {
  return resolveSites({
    input: codes.map((code) => ({ code })),
    defaultLocale: "en",
    locales: ["en", "de", "fr"],
  }).sites;
}

function assign(site: string, hub: string): SiteHubAssignment {
  return { site, hub };
}

/** A one-Spoke Spoke Hub built from already-partitioned Hubs, so the S2/S2A rules can judge it. */
function spokeHubOf(hubs: readonly Hub[]): SpokeHub {
  return {
    spokes: [
      {
        identity: {
          id: "example",
          canonicalHostname: "example.com",
          hostnameClaims: ["example.com"],
        },
        hubs,
      },
    ],
  };
}

describe("implicit mode — no membership is authored", () => {
  it("puts EVERY resolved Site in ONE implicit Hub", () => {
    const sites = sitesFor("ww", "de", "ca");
    const hubs = partitionSitesIntoHubs(sites);

    expect(hubs).toHaveLength(1);
    expect(hubs[0].identity.id).toBe(IMPLICIT_HUB_ID);
    // The very same population is carried through — not a copy, not a re-resolution.
    expect(hubs[0].sites).toBe(sites);
  });

  it("uses a fixed reserved id that derives from nothing", () => {
    expect(IMPLICIT_HUB_ID).toBe("implicit");
    for (const codes of [["ww"], ["de", "fr"], ["ca", "us", "jp"]]) {
      expect(partitionSitesIntoHubs(sitesFor(...codes))[0].identity.id).toBe(IMPLICIT_HUB_ID);
    }
  });

  it("satisfies the S2/S2A coherence rules", () => {
    const hubs = partitionSitesIntoHubs(sitesFor("ww", "de"));
    expect(spokeHubIssues(spokeHubOf(hubs))).toEqual([]);
    expect(isCoherentSpokeHub(spokeHubOf(hubs))).toBe(true);
  });
});

describe("explicit mode — the whole population is assigned", () => {
  const northAmerica = [
    assign("ww", "europe"),
    assign("de", "europe"),
    assign("ca", "north-america"),
    assign("us", "north-america"),
  ];

  it("partitions the Sites into the named Hubs", () => {
    const hubs = partitionSitesIntoHubs(sitesFor("ww", "de", "ca", "us"), northAmerica);
    expect(hubs.map((hub) => hub.identity.id)).toEqual(["europe", "north-america"]);
    expect(hubs.map((hub) => hub.sites.map((site) => site.code))).toEqual([
      ["ww", "de"],
      ["ca", "us"],
    ]);
  });

  it("carries the SAME ResolvedSite values through — the default flag included", () => {
    const sites = sitesFor("ww", "de", "ca", "us");
    const hubs = partitionSitesIntoHubs(sites, northAmerica);
    const flattened = hubs.flatMap((hub) => hub.sites);

    expect(flattened).toHaveLength(sites.length);
    for (const site of sites) expect(flattened).toContain(site); // the very same object
    expect(flattened.filter((site) => site.isDefault).map((site) => site.code)).toEqual(["ww"]);
    expect(hubs[0].sites[0].defaultLocale).toBe("en");
    expect(hubs[0].sites[0].locales.map((locale) => locale.path)).toEqual(["en", "de", "fr"]);
  });

  it("gives a Hub NO default-Site field — the Hub holding the default is ordinary", () => {
    const hubs = partitionSitesIntoHubs(sitesFor("ww", "de"), [assign("ww", "a"), assign("de", "b")]);
    for (const hub of hubs) {
      expect(Object.keys(hub)).toEqual(["identity", "sites"]);
      expect(Object.keys(hub.identity)).toEqual(["id"]);
    }
  });

  it("follows the SITE population order, not the assignment order", () => {
    const hubs = partitionSitesIntoHubs(sitesFor("ww", "de", "ca"), [
      assign("ca", "b"),
      assign("de", "a"),
      assign("ww", "a"),
    ]);
    expect(hubs.map((hub) => hub.identity.id)).toEqual(["a", "b"]);
    expect(hubs.map((hub) => hub.sites.map((site) => site.code))).toEqual([["ww", "de"], ["ca"]]);
  });

  it("compares Site codes in the Site domain's own canonical spelling", () => {
    const hubs = partitionSitesIntoHubs(sitesFor("ww", "de"), [assign("WW", "a"), assign(" de ", "b")]);
    expect(hubs.map((hub) => hub.sites.map((site) => site.code))).toEqual([["ww"], ["de"]]);
  });

  it("works for arbitrary valid Site codes", () => {
    const hubs = partitionSitesIntoHubs(sitesFor("ca", "fr", "jp"), [
      assign("ca", "west"),
      assign("fr", "east"),
      assign("jp", "east"),
    ]);
    expect(hubs.map((hub) => hub.identity.id)).toEqual(["west", "east"]);
    expect(hubs.map((hub) => hub.sites.map((site) => site.code))).toEqual([["ca"], ["fr", "jp"]]);
  });

  it("satisfies the S2/S2A coherence rules", () => {
    const hubs = partitionSitesIntoHubs(sitesFor("ww", "de", "ca", "us"), northAmerica);
    expect(spokeHubIssues(spokeHubOf(hubs))).toEqual([]);
    expect(isCoherentSpokeHub(spokeHubOf(hubs))).toBe(true);
  });
});

describe("incoherent membership is reported, never guessed", () => {
  it("refuses a population where only SOME Sites are assigned (all or none)", () => {
    const sites = sitesFor("ww", "de", "ca");
    const partial = [assign("de", "europe"), assign("ca", "north-america")];
    expect(hubMembershipIssues(sites, partial).some((i) => i.includes('Site "ww" has no Hub assignment'))).toBe(true);
    expect(() => partitionSitesIntoHubs(sites, partial)).toThrowError(HubMembershipError);
  });

  it("refuses an assignment naming a Site that is not in the population", () => {
    const issues = hubMembershipIssues(sitesFor("ww", "de"), [
      assign("ww", "a"),
      assign("de", "a"),
      assign("fr", "a"),
    ]);
    expect(issues.some((i) => i.includes('names Site "fr", which is not in the Site population'))).toBe(true);
  });

  it("refuses the SAME Site assigned more than once", () => {
    const issues = hubMembershipIssues(sitesFor("ww", "de"), [
      assign("ww", "a"),
      assign("ww", "b"),
      assign("de", "b"),
    ]);
    expect(issues.some((i) => i.includes('Site "ww" is assigned more than once'))).toBe(true);
  });

  it("refuses an empty Hub id", () => {
    const issues = hubMembershipIssues(sitesFor("ww"), [assign("ww", "  ")]);
    expect(issues.some((i) => i.includes("empty Hub id"))).toBe(true);
  });

  it("refuses an empty Site population", () => {
    expect(hubMembershipIssues([])).toContain("a Hub partition needs at least one Site");
    expect(() => partitionSitesIntoHubs([])).toThrowError(HubMembershipError);
  });

  it("returns NO issues for a valid population, implicit or explicit", () => {
    expect(hubMembershipIssues(sitesFor("ww", "de"))).toEqual([]);
    expect(
      hubMembershipIssues(sitesFor("ww", "de"), [assign("ww", "a"), assign("de", "a")]),
    ).toEqual([]);
  });

  it("reports EVERY issue at once when it throws", () => {
    const attempt = () =>
      partitionSitesIntoHubs(sitesFor("ww", "de"), [
        assign("ww", ""),
        assign("ww", "a"),
        assign("fr", "a"),
      ]);

    expect(attempt).toThrowError(HubMembershipError);
    try {
      attempt();
    } catch (error) {
      const issues = (error as HubMembershipError).issues;
      expect(issues.some((i) => i.includes("empty Hub id"))).toBe(true);
      expect(issues.some((i) => i.includes("assigned more than once"))).toBe(true);
      expect(issues.some((i) => i.includes('names Site "fr"'))).toBe(true);
      expect(issues.some((i) => i.includes('Site "de" has no Hub assignment'))).toBe(true);
    }
  });
});

describe("the reserved implicit Hub id can never be authored (S3A1)", () => {
  it("is used by implicit mode, and is never reported there", () => {
    const sites = sitesFor("ww", "de");
    expect(hubMembershipIssues(sites)).toEqual([]);
    expect(partitionSitesIntoHubs(sites)[0].identity.id).toBe(IMPLICIT_HUB_ID);
  });

  it("refuses an EXPLICIT assignment to the reserved id", () => {
    const sites = sitesFor("ww", "de");
    const assignments = [assign("ww", IMPLICIT_HUB_ID), assign("de", IMPLICIT_HUB_ID)];

    expect(hubMembershipIssues(sites, assignments).some((i) => i.includes("reserved for the implicit Hub"))).toBe(
      true,
    );
    expect(() => partitionSitesIntoHubs(sites, assignments)).toThrowError(HubMembershipError);
  });

  it("refuses the reserved id even when it is padded (padding cannot launder a reserved word)", () => {
    const issues = hubMembershipIssues(sitesFor("ww"), [assign("ww", ` ${IMPLICIT_HUB_ID} `)]);
    expect(issues.some((i) => i.includes("reserved for the implicit Hub"))).toBe(true);
  });

  it("refuses a MIXED membership where only ONE assignment uses the reserved id", () => {
    const sites = sitesFor("ww", "de", "ca");
    const assignments = [
      assign("ww", "europe"),
      assign("de", IMPLICIT_HUB_ID),
      assign("ca", "north-america"),
    ];

    expect(hubMembershipIssues(sites, assignments).some((i) => i.includes("reserved for the implicit Hub"))).toBe(
      true,
    );
    expect(() => partitionSitesIntoHubs(sites, assignments)).toThrowError(HubMembershipError);
  });

  it("still accepts ordinary explicit Hub ids, including ones that resemble it", () => {
    const sites = sitesFor("ww", "de");
    for (const id of ["europe", "implicit-hub", "IMPLICIT", "implicit2", "main"]) {
      expect(hubMembershipIssues(sites, [assign("ww", id), assign("de", id)]), id).toEqual([]);
    }
    expect(
      partitionSitesIntoHubs(sites, [assign("ww", "a"), assign("de", "b")]).map((hub) => hub.identity.id),
    ).toEqual(["a", "b"]);
  });

  it("reports the reserved-id failure ALONGSIDE every other membership defect", () => {
    const attempt = () =>
      partitionSitesIntoHubs(sitesFor("ww", "de"), [
        assign("ww", IMPLICIT_HUB_ID),
        assign("ww", "a"),
        assign("fr", "a"),
      ]);

    expect(attempt).toThrowError(HubMembershipError);
    try {
      attempt();
    } catch (error) {
      const issues = (error as HubMembershipError).issues;
      expect(issues.some((i) => i.includes("reserved for the implicit Hub"))).toBe(true);
      expect(issues.some((i) => i.includes("assigned more than once"))).toBe(true);
      expect(issues.some((i) => i.includes('names Site "fr"'))).toBe(true);
      expect(issues.some((i) => i.includes('Site "de" has no Hub assignment'))).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  hubForSiteCode,
  isCoherentSpokeHub,
  resolveSpokeFromHost,
  spokeHubIssues,
  type Hub,
  type Spoke,
  type SpokeHub,
} from "@/core/spoke";
import { resolveSites, type ResolvedSite } from "@/core/site";

/**
 * HUB → SITE COMPOSITION (FOUNDATION-MULTISITE-S2)
 * ==============================================
 *
 * The step AFTER `hostname → Spoke`: within one already-selected Spoke, which Hub owns a Site?
 *
 * A Hub owns the EXISTING Foundation Site values (`resolveSites`, `@/core/site`) — there is no second
 * Site concept here. A public URL is `/<site>/<locale>/<route>` with NO Hub segment, so once the
 * hostname has chosen the Spoke a Site code must identify its Site on its own: it may occur only ONCE
 * across all of that Spoke's Hubs, while the SAME code in two DIFFERENT Spokes stays valid.
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

/** A Site value with the default flag forced — for constructing INCOHERENT fixtures. */
function relabel(site: ResolvedSite, isDefault: boolean): ResolvedSite {
  return { ...site, isDefault };
}

/** A Spoke assembled from raw Hubs, so a test can construct an INCOHERENT value deliberately. */
function spokeWith(id: string, canonicalHostname: string, hubs: readonly Hub[]): Spoke {
  return { identity: { id, canonicalHostname, hostnameClaims: [canonicalHostname] }, hubs };
}

/**
 * ONE Spoke whose Sites come from ONE resolution, so EXACTLY ONE of them carries `isDefault`: the
 * default flag is a Spoke-wide fact, not a per-Hub one (S2A).
 */
function spokeOf(
  id: string,
  canonicalHostname: string,
  hubs: readonly { readonly id: string; readonly codes: readonly string[] }[],
): Spoke {
  const resolved = sitesFor(...hubs.flatMap((hub) => hub.codes));
  return spokeWith(
    id,
    canonicalHostname,
    hubs.map((hub) => ({
      identity: { id: hub.id },
      sites: resolved.filter((site) => hub.codes.includes(site.code)),
    })),
  );
}

function spokeHubOf(spokes: readonly Spoke[]): SpokeHub {
  return { spokes };
}

/** The worked example: one domain, two Hubs, disjoint Site codes, ONE domain default (`ww`). */
function exampleSpoke(): Spoke {
  return spokeOf("example", "example.com", [
    { id: "primary", codes: ["ww", "de"] },
    { id: "north-america", codes: ["ca", "us"] },
  ]);
}

describe("a Hub owns the EXISTING Foundation Sites", () => {
  it("carries ResolvedSite values — not a second Site concept", () => {
    const primary = exampleSpoke().hubs[0];
    expect(primary.sites.map((site) => site.code)).toEqual(["ww", "de"]);
    // The real Site domain's values, with its locale policy intact.
    expect(primary.sites[0].locales.map((locale) => locale.path)).toEqual(["en", "de", "fr"]);
    expect(primary.sites[0].defaultLocale).toBe("en");
    expect(primary.sites[0].isDefault).toBe(true);
  });

  it("lets one Spoke hold several Hubs with different Site codes", () => {
    const spoke = exampleSpoke();
    expect(spoke.hubs.map((entry) => entry.identity.id)).toEqual(["primary", "north-america"]);
    expect(spokeHubIssues(spokeHubOf([spoke]))).toEqual([]);
    expect(isCoherentSpokeHub(spokeHubOf([spoke]))).toBe(true);
  });

  it("treats a Hub with zero Sites as incoherent (a resolved Hub owns 1..*)", () => {
    const spoke = spokeWith("example", "example.com", [{ identity: { id: "empty" }, sites: [] }]);
    expect(spokeHubIssues(spokeHubOf([spoke]))).toContain(
      'Spoke "example": Hub "empty" owns no Site',
    );
    expect(isCoherentSpokeHub(spokeHubOf([spoke]))).toBe(false);
  });
});

describe("Site code → owning Hub, within one already-selected Spoke", () => {
  it("resolves each Site code to the Hub that owns it", () => {
    const spoke = exampleSpoke();
    expect(hubForSiteCode(spoke, "ww")?.identity.id).toBe("primary");
    expect(hubForSiteCode(spoke, "de")?.identity.id).toBe("primary");
    expect(hubForSiteCode(spoke, "ca")?.identity.id).toBe("north-america");
    expect(hubForSiteCode(spoke, "us")?.identity.id).toBe("north-america");
  });

  it("compares the code in the Site domain's own canonical spelling", () => {
    const spoke = exampleSpoke();
    expect(hubForSiteCode(spoke, "WW")?.identity.id).toBe("primary");
    expect(hubForSiteCode(spoke, " ca ")?.identity.id).toBe("north-america");
  });

  it("answers null for a Site no Hub owns — never a default Hub", () => {
    const spoke = exampleSpoke();
    for (const code of ["fr", "jp", "", "nope"]) {
      expect(hubForSiteCode(spoke, code), JSON.stringify(code)).toBeNull();
    }
  });
});

describe("Spoke-wide Site-code uniqueness", () => {
  it("refuses the same Site code in two Hubs of ONE Spoke (the URL has no Hub segment)", () => {
    const spoke = spokeWith("example", "example.com", [
      { identity: { id: "a" }, sites: sitesFor("ww") },
      { identity: { id: "b" }, sites: sitesFor("ww").map((site) => relabel(site, false)) },
    ]);
    const issues = spokeHubIssues(spokeHubOf([spoke]));
    expect(issues.some((issue) => issue.includes("appears in more than one Hub"))).toBe(true);
    expect(isCoherentSpokeHub(spokeHubOf([spoke]))).toBe(false);
  });

  it("reports a Site code stated twice inside ONE Hub", () => {
    const ww = sitesFor("ww")[0];
    const spoke = spokeWith("example", "example.com", [
      { identity: { id: "main" }, sites: [ww, relabel(ww, false)] },
    ]);
    expect(spokeHubIssues(spokeHubOf([spoke]))).toContain(
      'Spoke "example": Hub "main" states the site code "ww" more than once',
    );
  });

  it("allows the same Site code in two DIFFERENT Spokes (the hostname already distinguishes them)", () => {
    const spokeHub = spokeHubOf([
      spokeOf("example", "example.com", [{ id: "main", codes: ["ww"] }]),
      spokeOf("other", "example.org", [{ id: "main", codes: ["ww"] }]),
    ]);
    expect(spokeHubIssues(spokeHub)).toEqual([]);
    expect(isCoherentSpokeHub(spokeHub)).toBe(true);
  });
});

describe("S1 hostname behaviour is unchanged by S2", () => {
  it("keeps exact, non-subdomain hostname resolution", () => {
    const spokeHub = spokeHubOf([
      spokeOf("example", "example.com", [{ id: "main", codes: ["ww"] }]),
    ]);
    expect(resolveSpokeFromHost(spokeHub, "example.com")?.spokeId).toBe("example");
    expect(resolveSpokeFromHost(spokeHub, "sub.example.com")).toBeNull();
    expect(resolveSpokeFromHost(spokeHub, "unknown.net")).toBeNull();
  });
});

describe("exactly one default Site per Spoke (S2A)", () => {
  it("is coherent with ONE default Site across ONE Hub", () => {
    const spoke = spokeOf("example", "example.com", [{ id: "main", codes: ["ww", "de"] }]);
    expect(spokeHubIssues(spokeHubOf([spoke]))).toEqual([]);
    expect(spoke.hubs[0].sites.filter((site) => site.isDefault).map((site) => site.code)).toEqual([
      "ww",
    ]);
  });

  it("is coherent with ONE default Site across SEVERAL Hubs (the designation is Spoke-wide)", () => {
    const spoke = exampleSpoke();
    const defaults = spoke.hubs.flatMap((hub) =>
      hub.sites.filter((site) => site.isDefault).map((site) => `${hub.identity.id}/${site.code}`),
    );
    expect(defaults).toEqual(["primary/ww"]);
    expect(isCoherentSpokeHub(spokeHubOf([spoke]))).toBe(true);
  });

  it("refuses a Spoke with ZERO default Sites", () => {
    const ww = relabel(sitesFor("ww")[0], false);
    const spoke = spokeWith("example", "example.com", [{ identity: { id: "main" }, sites: [ww] }]);
    expect(spokeHubIssues(spokeHubOf([spoke])).some((i) => i.includes("has no default Site"))).toBe(
      true,
    );
    expect(isCoherentSpokeHub(spokeHubOf([spoke]))).toBe(false);
  });

  it("refuses TWO default Sites inside ONE Hub", () => {
    const [ww, de] = sitesFor("ww", "de");
    const spoke = spokeWith("example", "example.com", [
      { identity: { id: "main" }, sites: [relabel(ww, true), relabel(de, true)] },
    ]);
    expect(
      spokeHubIssues(spokeHubOf([spoke])).some((i) => i.includes("has 2 default Sites")),
    ).toBe(true);
  });

  it("refuses default Sites in TWO different Hubs of one Spoke", () => {
    const [ww, de] = sitesFor("ww", "de");
    const spoke = spokeWith("example", "example.com", [
      { identity: { id: "a" }, sites: [relabel(ww, true)] },
      { identity: { id: "b" }, sites: [relabel(de, true)] },
    ]);
    expect(
      spokeHubIssues(spokeHubOf([spoke])).some((i) =>
        i.includes('has 2 default Sites ("ww" in Hub "a", "de" in Hub "b")'),
      ),
    ).toBe(true);
    expect(isCoherentSpokeHub(spokeHubOf([spoke]))).toBe(false);
  });

  it("lets each of two Spokes have its OWN default Site", () => {
    const spokeHub = spokeHubOf([
      spokeOf("example", "example.com", [{ id: "main", codes: ["ww"] }]),
      spokeOf("other", "example.org", [{ id: "main", codes: ["ww"] }]),
    ]);
    expect(spokeHubIssues(spokeHub)).toEqual([]);
  });
});

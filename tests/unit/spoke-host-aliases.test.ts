/**
 * R1 — ADDITIONAL HOSTNAME CLAIMS PER SPOKE (`hostAliases`, WEB-1 owner requirement 6)
 * ====================================================================================
 *
 * A Spoke may claim exact ADDITIONAL hostnames beside its canonical one. They are ROUTING CLAIMS ONLY: the
 * canonical origin (`site.url`) stays what every canonical URL, sitemap entry and social card is built from,
 * and NO hostname may route to two Spokes.
 *
 * Every refusal below happens at BUILD time, with the offending Spoke and hostname named, because at request
 * time an ambiguous hostname would be settled silently by declaration order. An Installation that authors no
 * aliases at all is completely unchanged — which the last case proves.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hostRoutingForInstallation } from "@/config/spoke-host-routing.mjs";
import { hostnameFromOrigin } from "@/core/spoke/hostname.mjs";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** ONE disposable Installation whose Spokes carry the origins and claims the case under test needs. */
function installation(
  spokes: readonly { id: string; url?: string; hostAliases?: readonly string[] }[],
  manifest: Record<string, unknown> = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), "r1-aliases-"));
  tempRoots.push(root);
  for (const spoke of spokes) {
    const spokeRoot = path.join(root, "spokes", spoke.id);
    mkdirSync(spokeRoot, { recursive: true });
    writeFileSync(
      path.join(spokeRoot, "site.config.json"),
      JSON.stringify(spoke.url === undefined ? {} : { site: { url: spoke.url } }),
    );
  }
  writeFileSync(
    path.join(root, "spokes.json"),
    JSON.stringify({
      spokes: spokes.map((spoke) => ({
        id: spoke.id,
        root: `spokes/${spoke.id}`,
        ...(spoke.hostAliases === undefined ? {} : { hostAliases: [...spoke.hostAliases] }),
      })),
      ...manifest,
    }),
  );
  return root;
}

/** The Spoke that answers one hostname, through the build's own carried facts (or `null`). */
function claimOf(root: string, host: string): string | null {
  const routing = hostRoutingForInstallation(root);
  for (const spoke of routing.spokes) {
    if (hostnameFromOrigin(spoke.canonicalOrigin) === host) return spoke.id;
    if (spoke.hostAliases.includes(host)) return spoke.id;
  }
  if (routing.inspection !== null && routing.inspection.hostnames.includes(host)) {
    return routing.inspection.spokeId;
  }
  return null;
}

const TWO_SPOKES = [
  { id: "primary", url: "https://primary.example.test", hostAliases: ["primary-staging.example.test"] },
  { id: "docs", url: "https://docs.example.test", hostAliases: ["docs-staging.example.test"] },
] as const;

describe("additional hostname claims (`hostAliases`)", () => {
  it("routes the canonical hostname AND the additional claim to the same Spoke, and invents nothing", () => {
    const root = installation(TWO_SPOKES);
    expect(claimOf(root, "primary.example.test")).toBe("primary");
    expect(claimOf(root, "primary-staging.example.test")).toBe("primary");
    expect(claimOf(root, "docs.example.test")).toBe("docs");
    expect(claimOf(root, "docs-staging.example.test")).toBe("docs");
    // Exact matching only: an unrelated name, a SUBDOMAIN of a claim and a lookalike that merely CONTAINS
    // one all answer nothing (a suffix rule would accept them).
    expect(claimOf(root, "other.example.test")).toBeNull();
    expect(claimOf(root, "sub.primary.example.test")).toBeNull();
    expect(claimOf(root, "primary.example.test.evil.test")).toBeNull();
  });

  it("leaves the CANONICAL ORIGIN untouched — an alias is a route, never a second origin", () => {
    const routing = hostRoutingForInstallation(installation(TWO_SPOKES));
    // The origins are EXACTLY the authored `site.url` values: canonical metadata cannot drift to a claim.
    expect(routing.spokes.map((spoke) => spoke.canonicalOrigin)).toEqual([
      "https://primary.example.test",
      "https://docs.example.test",
    ]);
    // …while the additional claims ARE carried, beside the canonical one, in authored order.
    expect(routing.spokes.map((spoke) => spoke.hostAliases)).toEqual([
      ["primary-staging.example.test"],
      ["docs-staging.example.test"],
    ]);
  });

  it("refuses a duplicate claim, a cross-Spoke collision and a canonical collision", () => {
    const cases: readonly [
      string,
      readonly { id: string; url: string; hostAliases: readonly string[] }[],
      RegExp,
    ][] = [
      [
        "the same alias twice in one Spoke's list",
        [
          {
            id: "primary",
            url: "https://primary.example.test",
            hostAliases: ["same.example.test", "same.example.test"],
          },
        ],
        /hostAliases states "same\.example\.test" more than once/,
      ],
      [
        "two Spokes claiming the same hostname",
        [
          { id: "primary", url: "https://primary.example.test", hostAliases: ["shared.example.test"] },
          { id: "docs", url: "https://docs.example.test", hostAliases: ["shared.example.test"] },
        ],
        /is declared by BOTH Spoke "primary" and Spoke "docs"/,
      ],
      [
        "an alias restating another Spoke's canonical hostname",
        [
          { id: "primary", url: "https://primary.example.test", hostAliases: [] },
          { id: "docs", url: "https://docs.example.test", hostAliases: ["primary.example.test"] },
        ],
        /already the CANONICAL hostname of Spoke "primary"/,
      ],
    ];

    for (const [name, spokes, expected] of cases) {
      expect(() => hostRoutingForInstallation(installation(spokes)), name).toThrow(expected);
    }
  });

  it("refuses a wildcard, a differently-cased spelling and an alias with no canonical origin", () => {
    expect(() =>
      hostRoutingForInstallation(
        installation([
          { id: "primary", url: "https://primary.example.test", hostAliases: ["*.example.test"] },
        ]),
      ),
    ).toThrow(/is not an exact hostname/);

    expect(() =>
      hostRoutingForInstallation(
        installation([
          { id: "primary", url: "https://primary.example.test", hostAliases: ["Upper.example.test"] },
        ]),
      ),
    ).toThrow(/must be spelled the normalized way/);

    expect(() =>
      hostRoutingForInstallation(
        installation([{ id: "primary", hostAliases: ["primary-staging.example.test"] }]),
      ),
    ).toThrow(/no usable canonical origin/);
  });

  it("refuses an additional claim that collides with an inspection hostname of ANOTHER Spoke", () => {
    expect(() =>
      hostRoutingForInstallation(
        installation(
          [
            { id: "primary", url: "https://primary.example.test", hostAliases: [] },
            { id: "docs", url: "https://docs.example.test", hostAliases: ["inspect.example.test"] },
          ],
          { inspectionSpoke: "primary", inspectionHosts: ["inspect.example.test"] },
        ),
      ),
    ).toThrow(/also an INSPECTION hostname of this Installation, which selects Spoke "primary"/);
  });

  it("keeps an Installation that authors no aliases completely unchanged", () => {
    const routing = hostRoutingForInstallation(
      installation([
        { id: "alpha", url: "https://alpha.localhost" },
        { id: "beta", url: "https://beta.localhost" },
      ]),
    );
    expect(routing.spokeSwitcher).toBeNull();
    expect(routing.spokes.map((spoke) => [spoke.canonicalOrigin, spoke.hostAliases])).toEqual([
      ["https://alpha.localhost", []],
      ["https://beta.localhost", []],
    ]);
  });
});

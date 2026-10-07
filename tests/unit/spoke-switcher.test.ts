/**
 * R1 — THE CROSS-SPOKE SWITCHER (`spokeSwitcher`, WEB-1 owner requirement 1)
 * =========================================================================
 *
 * The Installation authors an ORDERED list of Spokes a visitor may travel between. Two halves of ONE
 * contract are proved here:
 *
 *   BUILD     every option must route to the Spoke it NAMES — through that Spoke's canonical hostname, one of
 *             its additional claims, or an inspection hostname the policy nominates for it — and the authored
 *             ORDER is preserved exactly. An option that would land elsewhere, or nowhere, is refused with the
 *             option, the Spoke, the destination and the violated routing rule named.
 *   RUNTIME   the build's inlined description carries the options (the chrome's ONE reader), and a
 *             description that declares none answers `null` so no control is composed at all.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { hostRoutingForInstallation } from "@/config/spoke-host-routing.mjs";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.resetModules();
  vi.unstubAllEnvs();
});

/** ONE disposable Installation with two Spokes, the claims under test and (optionally) a switcher. */
function installation(
  options?: readonly Record<string, string>[],
  manifest: Record<string, unknown> = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), "r1-switcher-"));
  tempRoots.push(root);
  for (const id of ["primary", "docs"]) {
    const spokeRoot = path.join(root, "spokes", id);
    mkdirSync(spokeRoot, { recursive: true });
    writeFileSync(
      path.join(spokeRoot, "site.config.json"),
      JSON.stringify({ site: { url: `https://${id}.example.test` } }),
    );
  }
  writeFileSync(
    path.join(root, "spokes.json"),
    JSON.stringify({
      spokes: [
        { id: "primary", root: "spokes/primary", hostAliases: ["primary-staging.example.test"] },
        { id: "docs", root: "spokes/docs" },
      ],
      ...(options === undefined ? {} : { spokeSwitcher: { options } }),
      ...manifest,
    }),
  );
  return root;
}

const VALID_OPTIONS = [
  { spokeId: "primary", label: "Primary", href: "https://primary.example.test" },
  { spokeId: "docs", label: "Documentation", href: "https://docs.example.test" },
];

describe("the cross-Spoke switcher — build-time validation", () => {
  it("keeps the AUTHORED order and labels, and proves every destination routable", () => {
    const routing = hostRoutingForInstallation(installation(VALID_OPTIONS));
    expect(routing.spokeSwitcher?.options).toEqual(VALID_OPTIONS);
  });

  it("accepts an ADDITIONAL claim and an INSPECTION hostname as destinations too", () => {
    const routing = hostRoutingForInstallation(
      installation(
        [
          { spokeId: "primary", label: "Primary", href: "https://primary-staging.example.test/" },
          { spokeId: "docs", label: "Docs", href: "https://inspect.example.test" },
        ],
        { inspectionSpoke: "docs", inspectionHosts: ["inspect.example.test"] },
      ),
    );
    expect(routing.spokeSwitcher?.options.map((option) => option.href)).toEqual([
      "https://primary-staging.example.test/",
      "https://inspect.example.test",
    ]);
  });

  it("refuses a destination that would route to ANOTHER Spoke, or to nothing at all", () => {
    expect(() =>
      hostRoutingForInstallation(
        installation([{ spokeId: "docs", label: "Docs", href: "https://primary.example.test" }]),
      ),
    ).toThrow(/would not route there: the hostname "primary\.example\.test" is claimed by Spoke "primary"/);

    expect(() =>
      hostRoutingForInstallation(
        installation([{ spokeId: "docs", label: "Docs", href: "https://unknown.example.test" }]),
      ),
    ).toThrow(/would be REFUSED/);
  });

  it("REFUSES a switcher option that targets an unrelated/undeclared EXTERNAL organization", () => {
    // THE ORGANIZATIONAL BOUNDARY, AS A MECHANICAL CASE. ONE INSTALLATION IS ONE HUB, and its DECLARED Spokes
    // are its members. An unrelated organization's site is a DIFFERENT Hub/Installation: it is not a routing
    // claim of any member here, so the switcher can never offer it — however plausible the URL looks.
    //
    // There is deliberately NO organization-name rule, NO `hubId`, NO suffix heuristic and NO second
    // registry: the enforcement mechanism IS the routing-membership check, and this case holds it.
    const declared = installation([{ spokeId: "primary", label: "Primary", href: "https://unrelated.example" }]);

    expect(() => hostRoutingForInstallation(declared)).toThrow(
      /spokeSwitcher\.options\[0\] \("Primary"\) names Spoke "primary", but its destination "https:\/\/unrelated\.example" would not route there: the hostname "unrelated\.example" is claimed by no Spoke/,
    );
  });

  it("refuses an undeclared Spoke, a duplicate Spoke, a duplicate hostname, a bad href and a blank label", () => {
    const cases: readonly [string, readonly Record<string, string>[], RegExp][] = [
      [
        "an undeclared Spoke",
        [{ spokeId: "catalog", label: "Catalog", href: "https://primary.example.test" }],
        /"catalog" is not one of the declared Spokes/,
      ],
      [
        "the same Spoke twice",
        [
          { spokeId: "primary", label: "Primary", href: "https://primary.example.test" },
          { spokeId: "primary", label: "Again", href: "https://primary-staging.example.test" },
        ],
        /spokeId "primary" is offered more than once/,
      ],
      [
        "two options pointing at one hostname",
        [
          { spokeId: "primary", label: "Primary", href: "https://primary.example.test" },
          { spokeId: "docs", label: "Docs", href: "https://primary.example.test/" },
        ],
        /names a destination hostname another option already offers/,
      ],
      [
        "a relative href",
        [{ spokeId: "primary", label: "Primary", href: "/primary" }],
        /must be an absolute HTTPS origin/,
      ],
      [
        "a non-HTTPS origin",
        [{ spokeId: "primary", label: "Primary", href: "http://primary.example.test" }],
        /must be an absolute HTTPS origin/,
      ],
      [
        "an origin with a path",
        [{ spokeId: "primary", label: "Primary", href: "https://primary.example.test/ww/en" }],
        /must be an absolute HTTPS origin/,
      ],
      [
        "a blank label",
        [{ spokeId: "primary", label: "  ", href: "https://primary.example.test" }],
        /label must not be blank/,
      ],
    ];

    for (const [name, options, expected] of cases) {
      expect(() => hostRoutingForInstallation(installation(options)), name).toThrow(expected);
    }
  });

  it("refuses a structurally wrong switcher (an unknown leaf, a missing option field)", () => {
    const root = installation(VALID_OPTIONS);
    const manifest = JSON.parse(readFileSync(path.join(root, "spokes.json"), "utf8")) as {
      spokeSwitcher: Record<string, unknown>;
    };
    manifest.spokeSwitcher.order = "authored";
    writeFileSync(path.join(root, "spokes.json"), JSON.stringify(manifest));
    expect(() => hostRoutingForInstallation(root)).toThrow(/Unrecognized key: "order"/);

    const missing = installation([{ spokeId: "primary", label: "Primary" }]);
    expect(() => hostRoutingForInstallation(missing)).toThrow(
      /spokeSwitcher\.options\.0\.href: Invalid input: expected string/,
    );
  });
});

describe("the build's inlined description carries the switcher (the chrome's ONE reader)", () => {
  it("answers the authored options in order, frozen, and keeps the canonical origin untouched", async () => {
    vi.stubEnv(
      "FOUNDATION_DEPLOYMENT_HOST_ROUTING",
      JSON.stringify({
        mode: "multi",
        spokes: [
          {
            id: "primary",
            segment: "spoke-primary",
            canonicalOrigin: "https://primary.example.test",
            hostAliases: ["primary-staging.example.test"],
          },
          { id: "docs", segment: "spoke-docs", canonicalOrigin: "https://docs.example.test" },
        ],
        inspection: null,
        spokeSwitcher: { options: VALID_OPTIONS },
      }),
    );

    const { hostRoutingForBuild, spokeSwitcherForBuild, spokeSelectionForHost } = await import(
      "@/config/spoke-routing"
    );
    const routing = hostRoutingForBuild();

    // The additional claim is a CLAIM (routing); the canonical origin is untouched (metadata).
    expect(spokeSelectionForHost(routing, "primary-staging.example.test")?.spokeId).toBe("primary");
    expect(spokeSelectionForHost(routing, "primary.example.test")?.spokeId).toBe("primary");
    expect(spokeSelectionForHost(routing, "nobody.example.test")).toBeNull();
    expect(routing.spokes[0].canonicalOrigin).toBe("https://primary.example.test");

    expect(spokeSwitcherForBuild()?.options.map((option) => option.label)).toEqual([
      "Primary",
      "Documentation",
    ]);
    expect(Object.isFrozen(spokeSwitcherForBuild())).toBe(true);
  });

  it("answers `null` when the Installation authors none", async () => {
    vi.stubEnv(
      "FOUNDATION_DEPLOYMENT_HOST_ROUTING",
      JSON.stringify({
        mode: "single",
        spokes: [{ id: "implicit", segment: "spoke-implicit", canonicalOrigin: "https://one.example.test" }],
        inspection: null,
      }),
    );

    const { spokeSwitcherForBuild } = await import("@/config/spoke-routing");
    expect(spokeSwitcherForBuild()).toBeNull();
  });

  it("REFUSES an unusable additional claim in the description rather than dropping it", async () => {
    vi.stubEnv(
      "FOUNDATION_DEPLOYMENT_HOST_ROUTING",
      JSON.stringify({
        mode: "multi",
        spokes: [
          {
            id: "primary",
            segment: "spoke-primary",
            canonicalOrigin: "https://primary.example.test",
            hostAliases: [""],
          },
        ],
        inspection: null,
      }),
    );

    const { hostRoutingForBuild } = await import("@/config/spoke-routing");
    expect(() => hostRoutingForBuild()).toThrow(/is not a usable hostname/);
  });
});

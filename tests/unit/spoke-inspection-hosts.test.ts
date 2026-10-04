/**
 * FOUNDATION-MULTISITE-M20 — THE INSPECTION POLICY (PART B)
 * =======================================================
 *
 * A deployment/branch URL the HOSTING PLATFORM itself publishes for this deployment is part of the
 * operator's inspection workflow, so it must render the Installation rather than "Not Found" — while
 * everything else keeps failing closed. These proofs hold the whole policy:
 *
 *   · the platform's own hostnames are READ from its build identity, verbatim, and nothing else;
 *   · recognition is EXACT, so an unrelated project's Vercel URL, a team URL and a lookalike that merely
 *     CONTAINS the real name all answer nothing (a suffix rule would accept them);
 *   · an authored Spoke hostname ALWAYS wins, so the policy can never override Germany;
 *   · the policy is EXPLICIT: recognised hostnames without a declared `inspectionSpoke` and a policy
 *     naming an undeclared Spoke are both refused at build time, and a policy that names no Spoke the
 *     Installation has answers nothing — a caller cannot conjure a Spoke by asking for it;
 *   · the ONE-Spoke runtime is unchanged: a single-Spoke Installation answers every host, as before.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { hostRoutingForInstallation, inspectionHostnamesFromPlatform } from "@/config/spoke-host-routing.mjs";

const tempRoots: string[] = [];
/** The two hostnames the owner reported, exactly as the platform spells them. */
const MAIN_BRANCH = "provelopment-foundation-git-main-provelopment.vercel.app";
const UNIQUE_DEPLOYMENT = "provelopment-foundation-raoo2g20f-provelopment.vercel.app";

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A disposable multi-Spoke Installation that states (or omits) the inspection policy. */
function disposableCapsule(inspectionSpoke: string | undefined): string {
  const root = mkdtempSync(path.join(tmpdir(), "m20-inspection-"));
  tempRoots.push(root);
  for (const id of ["foundation", "germany"]) {
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
        { id: "foundation", root: "spokes/foundation" },
        { id: "germany", root: "spokes/germany" },
      ],
      ...(inspectionSpoke === undefined ? {} : { inspectionSpoke }),
    }),
  );
  return root;
}


describe("the hosting platform's own inspection hostnames", () => {
  it("reads the platform's deployment, branch and production values, and nothing else", () => {
    expect(
      inspectionHostnamesFromPlatform({
        VERCEL_URL: UNIQUE_DEPLOYMENT,
        VERCEL_BRANCH_URL: MAIN_BRANCH,
        VERCEL_PROJECT_PRODUCTION_URL: "foundation-template.provelopment.com",
        VERCEL_ENV: "production",
        SOME_OTHER_VALUE: "not-a-host.example.test",
      }),
    ).toEqual([UNIQUE_DEPLOYMENT, MAIN_BRANCH, "foundation-template.provelopment.com"]);
  });

  it("recognises nothing when the platform reported nothing, and never repeats a value", () => {
    expect(inspectionHostnamesFromPlatform({})).toEqual([]);
    expect(
      inspectionHostnamesFromPlatform({
        VERCEL_URL: `  ${UNIQUE_DEPLOYMENT}  `,
        VERCEL_BRANCH_URL: UNIQUE_DEPLOYMENT,
        VERCEL_PROJECT_PRODUCTION_URL: "   ",
      }),
    ).toEqual([UNIQUE_DEPLOYMENT]);
  });
});

describe("the build's inspection policy", () => {
  it("publishes the declared policy, and the Spoke order it does NOT derive the policy from", () => {
    // The policy here is `germany`, deliberately NOT the first declared Spoke, so a proof cannot pass by
    // reading the policy out of manifest order.
    const routing = hostRoutingForInstallation(disposableCapsule("germany"));

    expect(routing.mode).toBe("multi");
    expect(routing.spokes.map((spoke) => spoke.id)).toEqual(["foundation", "germany"]);
    expect(routing.inspection).toEqual({ spokeId: "germany", hostnames: [] });
  });

  it("recognises the platform's own hostnames for this deployment", () => {
    const before = { url: process.env["VERCEL_URL"], branch: process.env["VERCEL_BRANCH_URL"] };
    process.env["VERCEL_URL"] = UNIQUE_DEPLOYMENT;
    process.env["VERCEL_BRANCH_URL"] = MAIN_BRANCH;
    try {
      const routing = hostRoutingForInstallation(disposableCapsule("foundation"));
      expect(routing.inspection).toEqual({
        spokeId: "foundation",
        hostnames: [UNIQUE_DEPLOYMENT, MAIN_BRANCH],
      });
    } finally {
      if (before.url === undefined) delete process.env["VERCEL_URL"];
      else process.env["VERCEL_URL"] = before.url;
      if (before.branch === undefined) delete process.env["VERCEL_BRANCH_URL"];
      else process.env["VERCEL_BRANCH_URL"] = before.branch;
    }
  });

  it("refuses recognised inspection hostnames when no policy is declared (multi-Spoke)", () => {
    process.env["VERCEL_URL"] = UNIQUE_DEPLOYMENT;
    try {
      expect(() => hostRoutingForInstallation(disposableCapsule(undefined))).toThrow(
        /declares no "inspectionSpoke"/,
      );
    } finally {
      delete process.env["VERCEL_URL"];
    }
  });

  it("refuses a policy that names a Spoke the Installation does not declare", () => {
    expect(() => hostRoutingForInstallation(disposableCapsule("provelopment"))).toThrow(
      /is not one of the declared Spokes/,
    );
  });


/**
 * THE REQUEST BOUNDARY, over the build's OWN description — the same value the build inlines
 * (`FOUNDATION_DEPLOYMENT_HOST_ROUTING`). Each case re-imports the module because the boundary caches the
 * description it was handed, exactly as a build does.
 */
const ROUTING_ENV = "FOUNDATION_DEPLOYMENT_HOST_ROUTING";

const MULTI_DESCRIPTION = {
  mode: "multi",
  spokes: [
    { id: "foundation", segment: "foundation", canonicalOrigin: "https://foundation-template.provelopment.com" },
    {
      id: "germany",
      segment: "germany",
      canonicalOrigin: "https://foundation-template-germany.provelopment.com",
    },
  ],
  inspection: { spokeId: "foundation", hostnames: [UNIQUE_DEPLOYMENT, MAIN_BRANCH] },
};

async function selectionFor(
  description: unknown,
  host: string | null,
): Promise<{ spokeId: string; reason: string } | null> {
  vi.resetModules();
  process.env[ROUTING_ENV] = JSON.stringify(description);
  const routing = await import("@/config/spoke-routing");
  const selection = routing.spokeSelectionForHost(routing.hostRoutingForBuild(), host);
  return selection === null ? null : { spokeId: selection.spokeId, reason: selection.reason };
}

describe("host selection at the request boundary", () => {
  afterEach(() => {
    delete process.env[ROUTING_ENV];
  });

  it("answers each authored hostname with its own Spoke", async () => {
    expect(await selectionFor(MULTI_DESCRIPTION, "foundation-template.provelopment.com")).toEqual({
      spokeId: "foundation",
      reason: "registered-hostname",
    });
    expect(await selectionFor(MULTI_DESCRIPTION, "foundation-template-germany.provelopment.com")).toEqual({
      spokeId: "germany",
      reason: "registered-hostname",
    });
  });

  it("answers the platform's own inspection hostnames with the nominated inspection Spoke", async () => {
    for (const host of [MAIN_BRANCH, UNIQUE_DEPLOYMENT, `${MAIN_BRANCH}:443`]) {
      expect(await selectionFor(MULTI_DESCRIPTION, host)).toEqual({
        spokeId: "foundation",
        reason: "inspection-hostname",
      });
    }
  });

  it("refuses unrelated projects, team URLs and every lookalike", async () => {
    for (const host of [
      "some-other-project.vercel.app",
      "unrelated-team.vercel.app",
      "unknown.example.com",
      `${MAIN_BRANCH}.evil.test`,
      `evil-${MAIN_BRANCH}`,
      "provelopment-foundation-git-main-provelopment.vercel.app.evil.test",
      "",
      null,
    ]) {
      expect(await selectionFor(MULTI_DESCRIPTION, host)).toBeNull();
    }
  });

  it("never lets the policy be widened by the client: an undeclared Spoke answers nothing", async () => {
    const widened = {
      ...MULTI_DESCRIPTION,
      inspection: { spokeId: "attacker", hostnames: [MAIN_BRANCH] },
    };
    expect(await selectionFor(widened, MAIN_BRANCH)).toBeNull();
  });

  it("holds A/B/V/A/B/V stability: no case influences another", async () => {
    const sequence = [
      "foundation-template.provelopment.com",
      "foundation-template-germany.provelopment.com",
      MAIN_BRANCH,
      "foundation-template.provelopment.com",
      "foundation-template-germany.provelopment.com",
      MAIN_BRANCH,
    ];
    const first = [];
    for (const host of sequence) first.push(await selectionFor(MULTI_DESCRIPTION, host));
    const second = [];
    for (const host of sequence) second.push(await selectionFor(MULTI_DESCRIPTION, host));

    expect(first.map((entry) => entry?.spokeId)).toEqual([
      "foundation",
      "germany",
      "foundation",
      "foundation",
      "germany",
      "foundation",
    ]);
    expect(second).toEqual(first);
  });

  it("keeps the ONE-Spoke runtime unchanged: the sole Spoke answers every host", async () => {
    const single = {
      mode: "single",
      spokes: [
        {
          id: "foundation",
          segment: "foundation",
          canonicalOrigin: "https://foundation-template.provelopment.com",
        },
      ],
      inspection: null,
    };

    vi.resetModules();
    process.env[ROUTING_ENV] = JSON.stringify(single);
    const routing = await import("@/config/spoke-routing");
    const description = routing.hostRoutingForBuild();

    // ONE published entry is what the boundary's single-Spoke rule answers from, so nothing is chosen.
    expect(description.spokes).toHaveLength(1);
    expect(description.inspection).toBeNull();
    // The exact-claim decision still answers the authored host, and consults NO inspection policy.
    expect(routing.spokeSelectionForHost(description, "foundation-template.provelopment.com")?.spokeId).toBe(
      "foundation",
    );
    expect(routing.spokeSelectionForHost(description, MAIN_BRANCH)).toBeNull();
  });
});

  it("keeps the manifest's strictness: an unknown leaf is refused", () => {
    const root = disposableCapsule("foundation");
    writeFileSync(
      path.join(root, "spokes.json"),
      JSON.stringify({
        spokes: [
          { id: "foundation", root: "spokes/foundation" },
          { id: "germany", root: "spokes/germany" },
        ],
        inspectionSpoke: "foundation",
        defaultSpoke: "foundation",
      }),
    );
    expect(() => hostRoutingForInstallation(root)).toThrow(/Unrecognized key: "defaultSpoke"/);
  });
});

/**
 * FOUNDATION-MULTISITE-M20/M22 — THE INSPECTION POLICY (PART B)
 * ============================================================
 *
 * A hostname that is a first-party viewing surface of THIS Installation but is NOT a Spoke's public
 * domain must render the Installation rather than "Not Found" — while everything else keeps failing
 * closed. There are TWO such sources, and they are different kinds of fact:
 *
 *   · a deployment/branch URL the HOSTING PLATFORM publishes for the build it made (short-lived, and
 *     reported to the build itself);
 *   · a PERMANENT project alias the deployment OWNS and declares (`inspectionHosts`), which no provider
 *     build variable reliably carries — the defect this policy was extended to fix (M22).
 *
 * These proofs hold the whole policy:
 *
 *   · the platform's own hostnames are READ from its build identity, verbatim, and nothing else;
 *   · the authored aliases are read from the Installation's own manifest, are EXACT normalized hostnames,
 *     and are refused loudly when they are a pattern, a URL, a second spelling, a duplicate, or a
 *     restatement of a Spoke's own hostname;
 *   · recognition is EXACT, so an unrelated project's Vercel URL, a team URL and a lookalike that merely
 *     CONTAINS a real name all answer nothing (a suffix rule would accept them);
 *   · an authored Spoke hostname ALWAYS wins, so no policy can override Germany;
 *   · the policy is EXPLICIT: inspection hostnames without a declared `inspectionSpoke`, and a policy
 *     naming an undeclared Spoke, are both refused at build time, and a policy that names no Spoke the
 *     Installation has answers nothing — a caller cannot conjure a Spoke by asking for it;
 *   · the build's description must ADD UP: what it matches is exactly the platform-reported hostnames
 *     plus the authored aliases, so the artifact cannot claim provenance it does not have;
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
/**
 * The PERMANENT Vercel project alias this Installation owns — the host that answered "Not Found" before
 * M22, because Vercel's build variables carry the deployment- and branch-specific URLs but not reliably
 * this one. It is authored in `deployment/spokes.json` and is class 3 of the hostname model.
 */
const PROJECT_ALIAS = "provelopment-foundation.vercel.app";


afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A disposable multi-Spoke Installation with the given manifest leaves (and the two usual Spokes). */
function disposableCapsule(
  inspectionSpoke: string | undefined,
  leaves: Record<string, unknown> = {},
): string {
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
      ...leaves,
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
    expect(routing.inspection).toEqual({
      spokeId: "germany",
      hostnames: [],
      platformHostnames: [],
      authoredHostnames: [],
    });
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
        platformHostnames: [UNIQUE_DEPLOYMENT, MAIN_BRANCH],
        authoredHostnames: [],
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

  it("reads the aliases the Installation authored, and unions them with what the platform reported", () => {
    const before = {
      url: process.env["VERCEL_URL"],
      production: process.env["VERCEL_PROJECT_PRODUCTION_URL"],
    };
    process.env["VERCEL_URL"] = UNIQUE_DEPLOYMENT;
    // On some builds the provider ALSO reports the permanent project alias as its production URL: the
    // matched list must stay ONE hostname, not two spellings of one decision.
    process.env["VERCEL_PROJECT_PRODUCTION_URL"] = PROJECT_ALIAS;
    try {
      const routing = hostRoutingForInstallation(
        disposableCapsule("foundation", { inspectionHosts: [PROJECT_ALIAS] }),
      );

      expect(routing.inspection).toEqual({
        spokeId: "foundation",
        hostnames: [UNIQUE_DEPLOYMENT, PROJECT_ALIAS],
        platformHostnames: [UNIQUE_DEPLOYMENT, PROJECT_ALIAS],
        authoredHostnames: [PROJECT_ALIAS],
      });
    } finally {
      if (before.url === undefined) delete process.env["VERCEL_URL"];
      else process.env["VERCEL_URL"] = before.url;
      if (before.production === undefined) delete process.env["VERCEL_PROJECT_PRODUCTION_URL"];
      else process.env["VERCEL_PROJECT_PRODUCTION_URL"] = before.production;
    }
  });

  it("refuses an authored alias that is not ONE exact, normalized hostname", () => {
    // A wildcard, a URL, a path, a case variant, a blank value and a value with a space are all refused
    // LOUDLY — a declaration that quietly recognised nothing would look exactly like one that worked.
    for (const value of [
      "*.vercel.app",
      "https://provelopment-foundation.vercel.app",
      "provelopment-foundation.vercel.app/pages",
      "Foundation.Vercel.App",
      "provelopment foundation.vercel.app",
      "",
      "   ",
    ]) {
      expect(
        () => hostRoutingForInstallation(disposableCapsule("foundation", { inspectionHosts: [value] })),
        JSON.stringify(value),
      ).toThrow(/inspectionHosts/);
    }

    // …and the structural leaves keep refusing what is not even a list of text.
    expect(() =>
      hostRoutingForInstallation(disposableCapsule("foundation", { inspectionHosts: "alias.example.test" })),
    ).toThrow(/inspectionHosts: Invalid input: expected array/);
    expect(() =>
      hostRoutingForInstallation(disposableCapsule("foundation", { inspectionHosts: [42] })),
    ).toThrow(/inspectionHosts\.0: Invalid input: expected string/);
  });

  it("refuses an alias declared twice, and aliases with no nominated Spoke", () => {
    expect(() =>
      hostRoutingForInstallation(
        disposableCapsule("foundation", { inspectionHosts: [PROJECT_ALIAS, PROJECT_ALIAS] }),
      ),
    ).toThrow(/stated more than once/);

    // An alias is a host the nominated Spoke answers on: with no nomination it can never select
    // anything, so it is refused rather than authored hopefully.
    expect(() =>
      hostRoutingForInstallation(disposableCapsule(undefined, { inspectionHosts: [PROJECT_ALIAS] })),
    ).toThrow(/declares no "inspectionSpoke"/);
  });

  it("refuses an alias that would only restate a Spoke's OWN hostname", () => {
    // The disposable capsule's Spokes answer for foundation.example.test and germany.example.test. An
    // authored claim always WINS, so such an alias would silently mean nothing while reading as if it
    // meant something — a configuration defect, refused by name.
    expect(() =>
      hostRoutingForInstallation(
        disposableCapsule("foundation", { inspectionHosts: ["foundation.example.test"] }),
      ),
    ).toThrow(/already the authored hostname of Spoke "foundation"/);
    expect(() =>
      hostRoutingForInstallation(
        disposableCapsule("foundation", { inspectionHosts: ["germany.example.test"] }),
      ),
    ).toThrow(/already the authored hostname of Spoke "germany"/);
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
  inspection: {
    spokeId: "foundation",
    hostnames: [UNIQUE_DEPLOYMENT, MAIN_BRANCH, PROJECT_ALIAS],
    platformHostnames: [UNIQUE_DEPLOYMENT, MAIN_BRANCH],
    authoredHostnames: [PROJECT_ALIAS],
  },
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
      // …and the same for the PERMANENT project alias the Installation does own: a name that merely
      // CONTAINS it is a different hostname, and the policy recognises one exact host, not a family.
      "unrelated-project.vercel.app",
      "lookalike-provelopment-foundation.vercel.app.evil.test",
      "evil-provelopment-foundation.vercel.app",
      "provelopment-foundation.vercel.app.evil.test",
      "provelopment-foundation-preview.vercel.app",
      "",
      null,
    ]) {
      expect(await selectionFor(MULTI_DESCRIPTION, host)).toBeNull();
    }
  });

  it("answers the deployment-owned aliases with the Spoke the policy nominates", async () => {
    expect(await selectionFor(MULTI_DESCRIPTION, PROJECT_ALIAS)).toEqual({
      spokeId: "foundation",
      reason: "inspection-hostname",
    });
  });

  it("lets an authored Spoke hostname win, even when a description lists it as an inspection hostname", async () => {
    // The build REFUSES such an alias (`spoke-host-routing.mjs`), so the only way this description can
    // exist is if somebody wrote it by hand — and even then the decision is ordered so a real Spoke's own
    // hostname can never be taken away from it.
    const widened = {
      ...MULTI_DESCRIPTION,
      inspection: {
        spokeId: "germany",
        hostnames: ["foundation-template.provelopment.com"],
        platformHostnames: ["foundation-template.provelopment.com"],
        authoredHostnames: [],
      },
    };

    expect(await selectionFor(widened, "foundation-template.provelopment.com")).toEqual({
      spokeId: "foundation",
      reason: "registered-hostname",
    });
  });

  it("refuses a description whose inspection provenance does not add up", async () => {
    const inconsistent = {
      ...MULTI_DESCRIPTION,
      inspection: {
        spokeId: "foundation",
        hostnames: [PROJECT_ALIAS],
        platformHostnames: [],
        authoredHostnames: [UNIQUE_DEPLOYMENT],
      },
    };

    await expect(selectionFor(inconsistent, PROJECT_ALIAS)).rejects.toThrow(/does not add up/);
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

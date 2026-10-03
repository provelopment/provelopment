/**
 * THE REQUEST-CONTEXT SEAM, IN ALL THREE INSTALLATION SHAPES (FOUNDATION-MULTISITE-M16)
 * =====================================================================================
 *
 * `runtimeContextForRequestHost` is where "which Spoke is this request?" becomes an explicit context, and the
 * three installation shapes must stay distinct:
 *
 *   legacy / explicit ONE Spoke   the Installation's sole Spoke answers EVERY host — the accepted behaviour,
 *                                 unchanged for development, preview and test hosts;
 *   explicit MULTI                an EXACT claim selects one Spoke; an unclaimed host answers NOTHING;
 *   currentBuildRuntimeContext()  still REFUSES a multi-Spoke Installation (no weakening, no default).
 *
 * The two-Spoke Installation is the DISPOSABLE fixture (`tests/support/multihost-installation.mjs`), so the
 * assertion is about a real Installation the accepted authorities resolve, not about a stub.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { materializeMultihostInstallation, runtimeNamespaceFiles } from "../support/multihost-installation.mjs";

const fixture = materializeMultihostInstallation({ repositoryRoot: process.cwd() });
const savedRoot = process.env.FOUNDATION_DEPLOYMENT_ROOT;

/** The two-Spoke Installation's OWN routing description, exactly as the build inlines it. */
const MULTI_ROUTING = {
  mode: "multi",
  spokes: fixture.spokes.map((spoke) => ({
    id: spoke.id,
    segment: spoke.segment,
    canonicalOrigin: spoke.canonicalOrigin,
  })),
};

beforeEach(() => {
  vi.resetModules();
  // `vi.stubEnv` + `vi.unstubAllEnvs` (not raw assignment): the process environment is SHARED by every test
  // file in a worker, so a selection this suite makes must be undone by the framework rather than by hand —
  // a leaked root would describe a DELETED temporary Installation to the next file.
  vi.stubEnv("FOUNDATION_DEPLOYMENT_ROOT", fixture.root);
  vi.stubEnv("FOUNDATION_DEPLOYMENT_MODE", "multi");
  vi.stubEnv("FOUNDATION_DEPLOYMENT_HOST_ROUTING", JSON.stringify(MULTI_ROUTING));
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterAll(() => {
  fixture.cleanup();
});

/**
 * The GENERATED namespace files each Spoke needs (`public/spokes/<segment>/assets/**`), materialised for the
 * duration of this suite and removed afterwards.
 *
 * The context-bound composition asserts that a configured icon LEAF has a matching asset file, so a test that
 * renders a context must give that context the namespace the platform would have generated — exactly what the
 * browser scenario does. Nothing here is authored state: both directories are generated output, git-ignored,
 * and only the two disposable segments are touched.
 */
const generatedRoot = path.join(process.cwd(), "public", "spokes");
const created: string[] = [];

beforeAll(() => {
  for (const spoke of fixture.spokes) {
    const directory = path.join(generatedRoot, spoke.segment, "assets");
    mkdirSync(directory, { recursive: true });
    for (const { from, to } of runtimeNamespaceFiles(spoke.root, spoke.id)) {
      copyFileSync(from, path.join(directory, to));
    }
    created.push(path.join(generatedRoot, spoke.segment));
  }
});

afterAll(() => {
  for (const directory of created) {
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
});

describe("a MULTI-Spoke Installation", () => {
  it("resolves each claimed hostname to ITS OWN context", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    const alpha = runtimeContextForRequestHost("alpha.localhost");
    const beta = runtimeContextForRequestHost("beta.localhost");

    expect(alpha?.id).toBe("alpha");
    expect(beta?.id).toBe("beta");
    expect(alpha?.runtimeSegment).toBe("alpha");
    expect(alpha?.siteConfig.url).toBe("https://alpha.localhost");
    expect(beta?.siteConfig.url).toBe("https://beta.localhost");
    expect(alpha?.siteConfig.name).not.toBe(beta?.siteConfig.name);
    // …and each context owns its OWN authored trees, so their dictionaries and pages cannot be shared.
    expect(alpha?.resources.spokeRoot).not.toBe(beta?.resources.spokeRoot);
    expect(alpha?.resources.markdownPagesRoot).toContain("alpha");
    expect(beta?.resources.markdownPagesRoot).toContain("beta");
  });

  it("answers an UNCLAIMED host with NOTHING", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    expect(runtimeContextForRequestHost("unknown.localhost")).toBeNull();
    expect(runtimeContextForRequestHost("localhost:3000")).toBeNull();
    expect(runtimeContextForRequestHost("alpha.localhost.attacker.test")).toBeNull();
    expect(runtimeContextForRequestHost(null)).toBeNull();
    expect(runtimeContextForRequestHost(undefined)).toBeNull();
  });

  it("selects a context BY RUNTIME SEGMENT for the internal route, and by nothing else", async () => {
    const { runtimeContextForSegment } = await import("@/config/spoke-request");

    expect(runtimeContextForSegment("alpha")?.id).toBe("alpha");
    expect(runtimeContextForSegment("beta")?.id).toBe("beta");
    // An undeclared segment answers nothing: no default, no first, no fallback.
    expect(runtimeContextForSegment("gamma")).toBeNull();
    expect(runtimeContextForSegment("")).toBeNull();
  });

  it("still REFUSES the one-Spoke compatibility seam — never weakened into a default", async () => {
    const { currentBuildRuntimeContext } = await import("@/config/installation-runtime");

    expect(() => currentBuildRuntimeContext()).toThrow(/EXACTLY ONE Spoke/);
    expect(() => currentBuildRuntimeContext()).toThrow(/no default Spoke and no manifest-order rule/);
  });

  it("gives each Spoke artwork namespaces of its own, platform first and never a neighbour's", async () => {
    const { runtimeContextForSegment } = await import("@/config/spoke-request");

    const alpha = runtimeContextForSegment('alpha'); if (alpha === null) throw new Error('alpha');
    const beta = runtimeContextForSegment('beta'); if (beta === null) throw new Error('beta');
    const urls = (context: { runtimeAssetNamespaces: readonly { urlBase: string }[] }) => context.runtimeAssetNamespaces.map((namespace) => namespace.urlBase);

    expect(urls(alpha)[0]).toBe("/assets");
    expect(urls(alpha)).toContain("/spokes/alpha/assets");
    expect(urls(alpha)).not.toContain("/spokes/beta/assets");
    expect(urls(beta)).toContain("/spokes/beta/assets");
    expect(urls(beta)).not.toContain("/spokes/alpha/assets");
  });

  it("isolates the static inventory by runtime segment while the public pathname is identical", async () => {
    const { runtimeContextForSegment } = await import("@/config/spoke-request");
    const { spokeServerComposition, staticParamsForContext } = await import(
      "@/app/[...segments]/server-composition"
    );

    const inventories = [];
    for (const segment of ["alpha", "beta"]) {
      const context = runtimeContextForSegment(segment); if (context === null) throw new Error("no context for " + segment);
      const params = await staticParamsForContext(spokeServerComposition(context));
      inventories.push({
        segment,
        paths: params.map((param) => param.segments.join("/")),
        internal: params.map((param) => `/~spoke/${segment}/${param.segments.join("/")}`),
      });
    }

    // The SAME logical coordinates exist in BOTH contexts…
    expect(inventories[0].paths).toContain("ww/en/about");
    expect(inventories[1].paths).toContain("ww/en/about");
    // …where they are DISTINCT internal addresses, distinguished by the runtime segment alone.
    expect(inventories[0].internal).not.toEqual(inventories[1].internal);
    expect(new Set(inventories[0].internal).size).toBe(inventories[0].internal.length);
    expect(new Set(inventories[1].internal).size).toBe(inventories[1].internal.length);
    // …and a route only ONE Spoke authors never appears in the other's inventory.
    expect(inventories[0].paths.some((path) => path.includes("alpha-only"))).toBe(true);
    expect(inventories[0].paths.some((path) => path.includes("beta-only"))).toBe(false);
    expect(inventories[1].paths.some((path) => path.includes("beta-only"))).toBe(true);
  });
});

describe("a ONE-Spoke Installation keeps the accepted behaviour", () => {
  it("answers EVERY host with the Installation's sole Spoke (development, preview and test hosts included)", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env.FOUNDATION_DEPLOYMENT_ROOT = savedRoot;
    delete process.env.FOUNDATION_DEPLOYMENT_MODE;
    delete process.env.FOUNDATION_DEPLOYMENT_HOST_ROUTING;

    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");
    const { currentBuildRuntimeContext } = await import("@/config/installation-runtime");

    const context = runtimeContextForRequestHost("literally-any-host.example");
    if (context === null) throw new Error("expected a Spoke context");
    expect(runtimeContextForRequestHost("localhost:3000")?.id).toBe(context.id);
    // …and the compatibility seam agrees, because it IS that same sole Spoke.
    expect(currentBuildRuntimeContext().id).toBe(context.id);
    expect(currentBuildRuntimeContext().siteConfig.url).toBe(context.siteConfig.url);
  });
});

describe("M17 — asset generation covers EVERY declared Spoke", () => {
  it("mirrors each Spoke's own authored artwork into its OWN namespace, with the platform shared", async () => {
    const { buildPlan, runtimeNamespaces } = await import("../../scripts/sync-runtime-assets.mjs");

    const keys = runtimeNamespaces(fixture.root).map((namespace) => namespace.key);
    expect(keys).toContain("platform");
    expect(keys).toContain("spoke:alpha");
    expect(keys).toContain("spoke:beta");

    const rows = buildPlan(fixture.root);
    const alphaRows = rows.filter((row) => row.namespace === "spoke:alpha");
    const betaRows = rows.filter((row) => row.namespace === "spoke:beta");
    expect(alphaRows.length).toBeGreaterThan(0);
    expect(betaRows.length).toBeGreaterThan(0);

    // ONE runtime target per namespace: a cross-Spoke overwrite is impossible by construction.
    const targets = new Set(rows.map((row) => `${row.namespace}::${row.to}`));
    expect(targets.size).toBe(rows.length);

    // Each Spoke's OWN role artwork comes from its OWN authored tree, into its OWN namespace…
    expect(alphaRows.some((row) => row.to === "favicon.svg" && row.from.includes("spokes/alpha"))).toBe(true);
    expect(betaRows.some((row) => row.to === "favicon.svg" && row.from.includes("spokes/beta"))).toBe(true);
    expect(alphaRows.some((row) => row.from.includes("spokes/beta"))).toBe(false);
    expect(betaRows.some((row) => row.from.includes("spokes/alpha"))).toBe(false);
    // …while the platform-owned artwork is installed ONCE, shared, and deduplicated across Spokes that ship
    // the same bytes (a multi-Spoke Installation authors the platform tree in every Spoke root).
    const platformTargets = rows.filter((row) => row.namespace === "platform").map((row) => row.to);
    expect(new Set(platformTargets).size).toBe(platformTargets.length);
    expect(platformTargets).toContain("icon-home.svg");
    expect(platformTargets.filter((name) => name === "icon-home.svg")).toHaveLength(1);
  });
});

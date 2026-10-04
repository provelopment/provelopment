import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  DEPLOYMENT_MODE_ENV,
  DEPLOYMENT_SPOKE_ROOT_ENV,
  DEPLOYMENT_SPOKE_SEGMENT_ENV,
  deploymentEnvironment,
  installationSpokes,
  resolveDeploymentForBuild,
} from "@/config/deployment-build.mjs";
import { resolveInstallationSpokeRoots } from "@/config/spoke-roots";

/**
 * EXPLICIT ONE-SPOKE INSTALLATION SELECTION (FOUNDATION-MULTISITE-S3F1)
 * ====================================================================
 *
 * An Installation is authored either LEGACY (its root is the one implicit Spoke) or EXPLICIT (its root
 * declares its Spokes in `spokes.json`). This suite proves the selection rules the running Foundation
 * depends on — including the ones it must REFUSE:
 *
 *   · legacy still resolves exactly as it always did (same root, same resource root, no Spoke);
 *   · an explicit Installation with EXACTLY ONE Spoke is runnable, and its RESOURCES come from that
 *     Spoke's root while the Installation keeps its own lifecycle records;
 *   · ZERO declared Spokes, TWO OR MORE declared Spokes, a root authored BOTH ways and a root authored
 *     NEITHER way are all refused LOUDLY. There is no default Spoke, no first Spoke and no
 *     manifest-order rule — S3F1 activates exactly one because the CARDINALITY is one;
 *   · the seam's answer AGREES with the TypeScript S3C1 authority (`resolveInstallationSpokeRoots`) on
 *     the same manifests, including which ones are unacceptable.
 *
 * Every tree is disposable (OS temp) and removed afterwards; nothing here reads or writes a real
 * Installation.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** ONE declared Spoke, authored beneath the dedicated namespace, carrying its own configuration. */
function plantSpoke(installationRoot: string, id: string, locator: string): void {
  const spokeRoot = path.join(installationRoot, ...locator.split("/"));
  write(path.join(spokeRoot, "site.config.json"), JSON.stringify({ spoke: id }));
  write(path.join(spokeRoot, "config", "i18n", "en.json"), JSON.stringify({ name: id }));
  write(path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", "about.md"), `# ${id}\n`);
}

function declareSpokes(
  installationRoot: string,
  declarations: readonly Record<string, string>[],
): void {
  write(path.join(installationRoot, "spokes.json"), JSON.stringify({ spokes: declarations }, null, 2));
}

describe("LEGACY mode resolves exactly as it always did", () => {
  it("takes the root's own configuration and its own resources, and declares no Spoke", () => {
    const root = tempTree("foundation-s3f1-legacy-");
    write(path.join(root, "site.config.json"), JSON.stringify({ legacy: true }));

    const resolved = resolveDeploymentForBuild({}, root);
    expect(resolved.layout).toBe("repository");
    expect(resolved.mode).toBe("legacy");
    expect(resolved.root).toBe(root);
    expect(resolved.resourceRoot).toBe(root);
    expect(resolved.spoke).toBeNull();
    expect(resolved.siteConfigFile).toBe(path.join(root, "site.config.json"));
    expect(JSON.parse(resolved.config)).toEqual({ legacy: true });
    expect(installationSpokes(root)).toEqual({ mode: "legacy", manifestFile: null, spokes: [] });
  });

  it("publishes an EMPTY Spoke binding, so a later mode switch cannot inherit a stale one", () => {
    const root = tempTree("foundation-s3f1-legacy-env-");
    write(path.join(root, "site.config.json"), "{}");

    const environment = deploymentEnvironment(resolveDeploymentForBuild({}, root));
    expect(environment[DEPLOYMENT_MODE_ENV]).toBe("legacy");
    expect(environment[DEPLOYMENT_SPOKE_ROOT_ENV]).toBe("");
    expect(environment[DEPLOYMENT_SPOKE_SEGMENT_ENV]).toBe("");
  });
});

describe("EXPLICIT mode: exactly ONE Spoke is runnable, and its resources are the Spoke's", () => {
  it("resolves the sole Spoke's configuration, its resource root and its runtime segment", () => {
    const root = tempTree("foundation-s3f1-explicit-");
    plantSpoke(root, "foundation", "spokes/foundation-web");
    declareSpokes(root, [{ id: "foundation", root: "spokes/foundation-web" }]);

    const resolved = resolveDeploymentForBuild({}, root);
    expect(resolved.mode).toBe("explicit");
    expect(resolved.root).toBe(root);
    expect(resolved.resourceRoot).toBe(path.join(root, "spokes", "foundation-web"));
    expect(resolved.siteConfigFile).toBe(
      path.join(root, "spokes", "foundation-web", "site.config.json"),
    );
    expect(JSON.parse(resolved.config)).toEqual({ spoke: "foundation" });
    expect(resolved.spoke).toEqual({
      id: "foundation",
      relativeRoot: "spokes/foundation-web",
      root: path.join(root, "spokes", "foundation-web"),
      segment: "foundation",
    });
  });

  it("publishes the mode, the relative Spoke root and the segment the runtime authority reads", () => {
    const root = tempTree("foundation-s3f1-explicit-env-");
    plantSpoke(root, "demo/a", "spokes/one");
    declareSpokes(root, [{ id: "demo/a", root: "spokes/one" }]);

    const environment = deploymentEnvironment(resolveDeploymentForBuild({}, root));
    expect(environment[DEPLOYMENT_MODE_ENV]).toBe("explicit");
    expect(environment[DEPLOYMENT_SPOKE_ROOT_ENV]).toBe("spokes/one");
    // The segment is derived from the IDENTITY, not from the authored directory.
    expect(environment[DEPLOYMENT_SPOKE_SEGMENT_ENV]).toBe("demo~2Fa");
  });

  it("resolves the runtime RESOURCE PATHS and namespaces from that published binding", async () => {
    const root = tempTree("foundation-s3f1-runtime-");
    plantSpoke(root, "foundation", "spokes/foundation-web");
    declareSpokes(root, [{ id: "foundation", root: "spokes/foundation-web" }]);
    const resolved = resolveDeploymentForBuild({}, root);
    const repositoryRoot = process.cwd();

    // A fresh module registry, with exactly the environment a BUILD would inline: this is the runtime
    // authority's own answer, not a copy of it.
    vi.resetModules();
    const keys = [
      DEPLOYMENT_MODE_ENV,
      DEPLOYMENT_SPOKE_ROOT_ENV,
      DEPLOYMENT_SPOKE_SEGMENT_ENV,
      "FOUNDATION_DEPLOYMENT_CONFIG",
      "FOUNDATION_DEPLOYMENT_LAYOUT",
      "FOUNDATION_DEPLOYMENT_ROOT",
    ] as const;
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    // Exactly what a build would inline for THIS installation: the test-only OVERRIDE selects it (the
    // same mechanism `tests/support/synthetic-deployment-root.ts` uses), and the published binding tells
    // the runtime authority which Spoke's resources to read.
    Object.assign(process.env, deploymentEnvironment(resolved), {
      FOUNDATION_DEPLOYMENT_LAYOUT: "override",
      FOUNDATION_DEPLOYMENT_ROOT: root,
    });
    try {
      const runtime = await import("@/config/deployment-root");
      const paths = runtime.deploymentPaths();
      const spokeRoot = path.join(root, "spokes", "foundation-web");
      // The authority publishes its paths with FORWARD slashes (valid on every platform), so compare
      // normalised exactly as the deployment-root guard does.
      const normalise = (value: string) => value.replace(/\\/g, "/");
      const tempPath = (value: string) => normalise(path.join(root, value));

      expect(runtime.deploymentMode()).toBe("explicit");
      expect(normalise(paths.root)).toBe(normalise(root));
      expect(normalise(paths.resourceRoot)).toBe(normalise(spokeRoot));
      expect(normalise(paths.siteConfigFile)).toBe(`${normalise(spokeRoot)}/site.config.json`);
      expect(normalise(paths.dictionaryDirectory)).toBe(`${normalise(spokeRoot)}/config/i18n`);
      expect(normalise(paths.assetSourceRoot)).toBe(`${normalise(spokeRoot)}/content/assets`);
      expect(normalise(paths.contentRoot)).toBe(tempPath("spokes/foundation-web/content"));
      // …while the INSTALLATION's own lifecycle record stays at the Installation root.
      expect(normalise(paths.operationalStateFile)).toBe(tempPath("operational-state.json"));
      // …and the runtime namespaces are the platform one plus the Spoke's own, in resolution order.
      expect(paths.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
        "/assets",
        "/spokes/foundation/assets",
      ]);
      expect(paths.runtimeAssetNamespaces.map((namespace) => normalise(namespace.directory))).toEqual([
        normalise(path.join(repositoryRoot, "public", "assets")),
        normalise(path.join(repositoryRoot, "public", "spokes", "foundation", "assets")),
      ]);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.resetModules();
    }
  });
});

describe("Every malformed Installation is REFUSED loudly (M16 adds the multi-Spoke runtime; nothing else relaxes)", () => {
  it("ACCEPTS two declared Spokes as the multi-host runtime — no default, no manifest-order rule", () => {
    const root = tempTree("foundation-s3f1-two-");
    plantSpoke(root, "alpha", "spokes/a");
    plantSpoke(root, "beta", "spokes/b");
    declareSpokes(root, [
      { id: "alpha", root: "spokes/a" },
      { id: "beta", root: "spokes/b" },
    ]);

    expect(resolveDeploymentForBuild({}, root).mode).toBe("multi");
    expect(resolveDeploymentForBuild({}, root).hostRouting.spokes.map((spoke) => spoke.id)).toEqual(["alpha", "beta"]);
    expect(resolveDeploymentForBuild({}, root).spoke).toBeNull();

    // Reversing the manifest changes nothing: the cardinality decides, never the order.
    declareSpokes(root, [
      { id: "beta", root: "spokes/b" },
      { id: "alpha", root: "spokes/a" },
    ]);
    expect(resolveDeploymentForBuild({}, root).hostRouting.spokes.map((spoke) => spoke.id)).toEqual(["beta", "alpha"]);

    // …while the SELECTION-LEVEL question still describes both (the plan tooling needs that).
    expect(installationSpokes(root).spokes.map((spoke) => spoke.id)).toEqual(["beta", "alpha"]);
  });

  it("refuses a manifest that declares NO Spoke (legacy is the absence of a manifest, not an empty one)", () => {
    const root = tempTree("foundation-s3f1-zero-");
    declareSpokes(root, []);

    // The WORDING is the S3C1 authority's, because the acceptance rules are ONE implementation: an empty
    // collection is an IDENTITY failure the domain reports, and the build seam reports exactly that.
    expect(() => resolveDeploymentForBuild({}, root)).toThrow(/needs at least one Spoke/);
    expect(() => resolveDeploymentForBuild({}, root)).toThrow(/Invalid Installation Spoke collection/);
  });

  it("refuses a root authored BOTH ways, and one authored NEITHER way", () => {
    const both = tempTree("foundation-s3f1-both-");
    plantSpoke(both, "foundation", "spokes/foundation");
    declareSpokes(both, [{ id: "foundation", root: "spokes/foundation" }]);
    write(path.join(both, "site.config.json"), "{}");
    expect(() => resolveDeploymentForBuild({}, both)).toThrow(/authored SIMULTANEOUSLY in both forms/);

    const neither = tempTree("foundation-s3f1-neither-");
    expect(() => resolveDeploymentForBuild({}, neither)).toThrow(/authored NEITHER way/);
    expect(() => resolveDeploymentForBuild({}, neither)).toThrow(/nothing falls back silently/);
  });

  it("refuses a Spoke locator outside the dedicated namespace, or outside the Installation", () => {
    const outside = tempTree("foundation-s3f1-outside-");
    write(path.join(outside, "config", "i18n", "en.json"), "{}");
    write(path.join(outside, "config", "site.config.json"), "{}");
    declareSpokes(outside, [{ id: "one", root: "config" }]);
    expect(() => resolveDeploymentForBuild({}, outside)).toThrow(/beneath the dedicated "spokes\/" namespace/);

    const escaping = tempTree("foundation-s3f1-escaping-");
    declareSpokes(escaping, [{ id: "one", root: "spokes/../../elsewhere" }]);
    expect(() => resolveDeploymentForBuild({}, escaping)).toThrow(/must not contain a "\.\." segment/);
  });
});

describe("the seam AGREES with the S3C1 authority on the same manifests", () => {
  it("resolves the same ids, roots and segments for an acceptable manifest", () => {
    const root = tempTree("foundation-s3f1-agree-");
    plantSpoke(root, "foundation", "spokes/foundation-web");
    plantSpoke(root, "second", "spokes/second-site");
    declareSpokes(root, [
      { id: "foundation", root: "spokes/foundation-web" },
      { id: "second", root: "spokes/second-site" },
    ]);

    const declared = installationSpokes(root).spokes;
    const authority = resolveInstallationSpokeRoots(root);

    expect(authority.mode).toBe("explicit");
    expect(
      declared.map((spoke) => ({ id: spoke.id, root: spoke.root, segment: spoke.segment })),
    ).toEqual(
      authority.descriptors.map((descriptor) => ({
        id: descriptor.id,
        root: descriptor.root,
        segment: descriptor.id,
      })),
    );
    // The runtime segment is the IDENTITY (the canonical Spoke id encodes to itself), while the
    // authored directory spelling stays unrelated to it.
    expect(declared[0].segment).toBe("foundation");
    expect(declared[0].root.endsWith(path.join("spokes", "foundation-web"))).toBe(true);
  });

  it("refuses the SAME unacceptable manifests, so a build can never serve what composition rejects", () => {
    const cases: readonly { readonly root: string; readonly declarations: readonly Record<string, string>[] }[] = [
      { root: "config", declarations: [{ id: "one", root: "config" }] },
      { root: "spokes/../escape", declarations: [{ id: "one", root: "spokes/../escape" }] },
      { root: "spokes/absent", declarations: [{ id: "one", root: "spokes/absent" }] },
      { root: "spokes", declarations: [{ id: "one", root: "spokes" }] },
    ];

    for (const testCase of cases) {
      const root = tempTree("foundation-s3f1-bad-");
      plantSpoke(root, "one", "spokes/one");
      declareSpokes(root, testCase.declarations);

      expect(() => installationSpokes(root), testCase.root).toThrow();
      expect(() => resolveInstallationSpokeRoots(root), testCase.root).toThrow();
    }
  });
});

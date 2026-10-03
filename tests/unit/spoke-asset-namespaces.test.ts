import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { iconAssetAvailable, namespaceOwning, runtimeAssetPath } from "@/config/assets";

import {
  MIRRORED,
  MIRRORED_DIRECTORIES,
  SPOKE_DIRECTORIES,
  buildPlan,
  checkMirrors,
  runtimeNamespaces,
  syncMirrors,
} from "../../scripts/sync-runtime-assets.mjs";

/**
 * COLLISION-SAFE SPOKE ASSET NAMESPACES (FOUNDATION-MULTISITE-S3E1C)
 * =================================================================
 *
 * The generated runtime tree is divided into NAMESPACES — the shared platform one (`assets/`) and one per
 * declared Spoke (`spokes/<runtime-segment>/assets/`) — and this suite proves every property that division
 * exists for, on disposable trees under the OS temp directory (never the repository's real mirror, never a
 * real Installation):
 *
 *   · LEGACY IS UNCHANGED, byte for byte: one namespace, the same flat plan, the same URLs;
 *   · two Spokes may ship the SAME asset basename — their outputs stay separate and byte-exact, so one
 *     Spoke can neither overwrite nor delete another's;
 *   · PLATFORM assets stay shared: the icon library and the platform marks are installed once, into
 *     `assets/`, and never into a Spoke's namespace;
 *   · a duplicate runtime TARGET is refused loudly rather than resolved by precedence;
 *   · the generated tree is REMOVABLE and idempotent: stale output (including a whole namespace for a Spoke
 *     the manifest no longer declares) is converged away, and a second run changes nothing.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/** A disposable directory; every tree is removed in `afterAll`. */
function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

function bytes(file: string): Buffer {
  return readFileSync(file);
}

/** The authored material EVERY Spoke owns: the role sources, plus one replaceable brand file. */
function plantSpokeResources(spokeRoot: string, marker: string): void {
  for (const row of MIRRORED) write(path.join(spokeRoot, row.from), `<svg>${marker}:${row.to}</svg>`);
  for (const { from } of SPOKE_DIRECTORIES) {
    write(path.join(spokeRoot, from, "banner-home.svg"), `<svg>${marker}:brand</svg>`);
  }
}

/** The PLATFORM-owned trees, as an Installation authors them beside its Spoke material. */
function plantPlatformResources(spokeRoot: string, marker: string): void {
  for (const { from } of MIRRORED_DIRECTORIES) {
    const name = from.includes("icon-library") ? "icon-home.svg" : "github.svg";
    write(path.join(spokeRoot, from, name), `<svg>${marker}:${name}</svg>`);
  }
}

/** A LEGACY Installation: the root IS the implicit Spoke, and its artwork is the root's own. */
function plantLegacyInstallation(root: string, marker = "legacy"): void {
  write(path.join(root, "site.config.json"), JSON.stringify({ site: { url: "https://example.com" } }));
  plantSpokeResources(root, marker);
  plantPlatformResources(root, marker);
}

/** An EXPLICIT Installation declaring the given `id -> authored directory` pairs. */
function plantExplicitInstallation(
  root: string,
  declarations: readonly { readonly id: string; readonly root: string }[],
  options: { readonly platformResources?: boolean } = {},
): void {
  write(
    path.join(root, "spokes.json"),
    `${JSON.stringify({ spokes: declarations }, null, 2)}\n`,
  );
  for (const declaration of declarations) {
    const spokeRoot = path.join(root, ...declaration.root.split("/"));
    write(path.join(spokeRoot, "site.config.json"), JSON.stringify({ spoke: declaration.id }));
    plantSpokeResources(spokeRoot, declaration.id);
    // The platform-owned trees are SHARED: an Installation authors them once, so a multi-Spoke
    // Installation that duplicated them would be refused by the plan (they would target one file twice).
    if (options.platformResources !== false) plantPlatformResources(spokeRoot, declaration.id);
  }
}

/** The generated runtime pair: the PLATFORM namespace root, and the base that holds every namespace. */
function runtimePair(): { runtimeRoot: string; runtimeBase: string } {
  const base = path.join(tempTree("foundation-namespaces-runtime-"), "public");
  return { runtimeRoot: path.join(base, "assets"), runtimeBase: base };
}

describe("LEGACY mode is unchanged: ONE namespace, the same flat plan", () => {
  it("declares every row in the platform namespace, flat and deployment-relative", () => {
    const installationRoot = tempTree("foundation-namespaces-legacy-");
    plantLegacyInstallation(installationRoot);

    const namespaces = runtimeNamespaces(installationRoot);
    expect(namespaces).toHaveLength(1);
    expect(namespaces[0]).toEqual({
      key: "platform",
      directory: "assets",
      urlBase: "/assets",
      spokeId: null,
    });

    const plan = buildPlan(installationRoot);
    expect(plan.length).toBe(MIRRORED.length + 2);
    for (const row of plan) {
      expect(row.namespace).toBe("platform");
      expect(row.to).not.toContain("/");
      expect(row.from.startsWith("content/assets/")).toBe(true);
    }
    expect(new Set(plan.map((row) => row.to)).size).toBe(plan.length);
  });

  it("installs into `public/assets` exactly as before, byte for byte", () => {
    const installationRoot = tempTree("foundation-namespaces-legacy-install-");
    plantLegacyInstallation(installationRoot, "shipped");
    const { runtimeRoot, runtimeBase } = runtimePair();

    const report = syncMirrors(installationRoot, runtimeRoot);
    expect(report.created.length).toBeGreaterThan(0);
    expect(report.unexpected).toEqual([]);
    expect(existsSync(path.join(runtimeBase, "spokes"))).toBe(false);

    for (const row of buildPlan(installationRoot)) {
      const target = path.join(runtimeRoot, row.to);
      expect(existsSync(target), row.to).toBe(true);
      expect(bytes(target)).toEqual(bytes(path.join(installationRoot, row.from)));
    }
  });
});


describe("EXPLICIT mode: every Spoke owns a namespace derived from its IDENTITY", () => {
  it("gives the sole Spoke its own namespace, and keeps the platform assets SHARED", () => {
    const installationRoot = tempTree("foundation-namespaces-explicit-");
    plantExplicitInstallation(installationRoot, [{ id: "foundation", root: "spokes/foundation-web" }]);
    const { runtimeRoot, runtimeBase } = runtimePair();

    const namespaces = runtimeNamespaces(installationRoot);
    expect(namespaces.map((namespace) => namespace.directory)).toEqual([
      "assets",
      "spokes/foundation/assets",
    ]);
    expect(namespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      "/spokes/foundation/assets",
    ]);

    const plan = buildPlan(installationRoot);
    const spokeRows = plan.filter((row) => row.namespace === "spoke:foundation");
    const platformRows = plan.filter((row) => row.namespace === "platform");
    // The replaceable ROLE artwork and the brand artwork belong to the Spoke…
    expect(spokeRows.length).toBe(MIRRORED.length + 1);
    // …while the platform-owned trees are installed ONCE, into the shared namespace.
    expect(platformRows.map((row) => row.to).sort()).toEqual(["github.svg", "icon-home.svg"]);

    syncMirrors(installationRoot, runtimeRoot);
    for (const row of plan) {
      const namespace = namespaces.find((entry) => entry.key === row.namespace);
      if (namespace === undefined) throw new Error(`no namespace for ${row.namespace}`);
      const target = path.join(runtimeBase, namespace.directory, row.to);
      expect(bytes(target), `${row.namespace}/${row.to}`).toEqual(
        bytes(path.join(installationRoot, row.from)),
      );
    }
    // No platform asset was duplicated into the Spoke's namespace.
    expect(existsSync(path.join(runtimeBase, "spokes", "foundation", "assets", "icon-home.svg"))).toBe(
      false,
    );
    expect(existsSync(path.join(runtimeBase, "spokes", "foundation", "assets", "github.svg"))).toBe(
      false,
    );
  });

  it("derives the namespace from the ID, never from the authored directory", () => {
    const installationRoot = tempTree("foundation-namespaces-identity-");
    plantExplicitInstallation(installationRoot, [{ id: "foundation", root: "spokes/foundation-web" }]);
    const { runtimeRoot, runtimeBase } = runtimePair();

    syncMirrors(installationRoot, runtimeRoot);
    expect(existsSync(path.join(runtimeBase, "spokes", "foundation", "assets", "favicon.svg"))).toBe(true);
    expect(existsSync(path.join(runtimeBase, "spokes", "foundation-web"))).toBe(false);
  });

  it("lets two Spokes ship the SAME basename: separate outputs, different bytes, neither overwritten", () => {
    const installationRoot = tempTree("foundation-namespaces-collision-");
    plantExplicitInstallation(
      installationRoot,
      [
        { id: "alpha", root: "spokes/a" },
        { id: "beta", root: "spokes/b" },
      ],
      { platformResources: false },
    );
    const { runtimeRoot, runtimeBase } = runtimePair();

    const namespaces = runtimeNamespaces(installationRoot);
    expect(namespaces.map((namespace) => namespace.spokeId)).toEqual([null, "alpha", "beta"]);

    syncMirrors(installationRoot, runtimeRoot);

    for (const row of MIRRORED) {
      const alphaSource = path.join(
        installationRoot,
        row.from.replace("content/assets", "spokes/a/content/assets"),
      );
      const betaSource = path.join(
        installationRoot,
        row.from.replace("content/assets", "spokes/b/content/assets"),
      );
      const alpha = path.join(runtimeBase, "spokes", "alpha", "assets", row.to);
      const beta = path.join(runtimeBase, "spokes", "beta", "assets", row.to);
      expect(existsSync(alpha), `alpha ${row.to}`).toBe(true);
      expect(existsSync(beta), `beta ${row.to}`).toBe(true);
      expect(bytes(alpha)).toEqual(bytes(alphaSource));
      expect(bytes(beta)).toEqual(bytes(betaSource));
      // THE point: the same basename, two Spokes, two different files.
      expect(bytes(alpha)).not.toEqual(bytes(beta));
    }
  });
});


describe("the plan is collision-safe by CONSTRUCTION", () => {
  it("SHARES one platform target when two Spokes ship the SAME bytes (M17)", () => {
    const installationRoot = tempTree("foundation-namespaces-shared-");
    plantExplicitInstallation(installationRoot, [
      { id: "alpha", root: "spokes/a" },
      { id: "beta", root: "spokes/b" },
    ]);
    // The same SHARED asset, authored in two complete Spoke roots: byte for byte the same platform artwork.
    for (const [from, to] of [
      ["icon-library/icons/icon-home.svg", "icon-library/icons/icon-home.svg"],
      ["platform-marks/github.svg", "platform-marks/github.svg"],
    ]) {
      write(
        path.join(installationRoot, "spokes", "b", "content", "assets", ...to.split("/")),
        bytes(path.join(installationRoot, "spokes", "a", "content", "assets", ...from.split("/"))).toString("utf8"),
      );
    }

    const plan = buildPlan(installationRoot);
    // The shared namespace gets ONE row for it…
    const platform = plan.filter((row) => row.namespace === "platform");
    expect(platform.filter((row) => row.to === "icon-home.svg")).toHaveLength(1);
    // …while each Spoke still owns ITS OWN replaceable role artwork.
    for (const namespace of ["spoke:alpha", "spoke:beta"]) {
      expect(plan.filter((row) => row.namespace === namespace).length).toBeGreaterThan(0);
    }
  });

  it("REFUSES two DIFFERENT files for one platform target, naming both sources", () => {
    const installationRoot = tempTree("foundation-namespaces-conflict-");
    plantExplicitInstallation(installationRoot, [
      { id: "alpha", root: "spokes/a" },
      { id: "beta", root: "spokes/b" },
    ]);
    // The same platform basename with DIFFERENT bytes: the shared namespace cannot hold two versions, and
    // "which Spoke's copy wins" is exactly the precedence this installer refuses to invent.
    write(
      path.join(installationRoot, "spokes", "b", "content", "assets", "icon-library", "icons", "icon-home.svg"),
      "<svg>a different platform icon</svg>",
    );

    expect(() => buildPlan(installationRoot)).toThrow(/TWICE into the "platform" namespace/);
    expect(() => buildPlan(installationRoot)).toThrow(/spokes\/a\/content\/assets/);
  });

  it("converges: idempotent, and a Spoke the manifest drops takes only its OWN namespace with it", () => {
    const installationRoot = tempTree("foundation-namespaces-converge-");
    plantExplicitInstallation(
      installationRoot,
      [
        { id: "alpha", root: "spokes/a" },
        { id: "beta", root: "spokes/b" },
      ],
      { platformResources: false },
    );
    const { runtimeRoot, runtimeBase } = runtimePair();
    syncMirrors(installationRoot, runtimeRoot);

    const second = syncMirrors(installationRoot, runtimeRoot);
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.unexpected).toEqual([]);

    const alphaFavicon = path.join(runtimeBase, "spokes", "alpha", "assets", "favicon.svg");
    const before = bytes(alphaFavicon);

    // The manifest now declares ONE Spoke: the other's namespace is stale generated output.
    plantExplicitInstallation(installationRoot, [{ id: "alpha", root: "spokes/a" }]);
    rmSync(path.join(installationRoot, "spokes", "b"), { recursive: true, force: true });
    const converged = syncMirrors(installationRoot, runtimeRoot);

    expect(converged.removed).toContain("spokes/beta/assets/favicon.svg");
    expect(existsSync(path.join(runtimeBase, "spokes", "beta"))).toBe(false);
    // …and the Spoke that IS still declared is byte-identical: nobody deleted its artwork.
    expect(bytes(alphaFavicon)).toEqual(before);
    expect(checkMirrors(installationRoot, runtimeRoot).unexpected).toEqual([]);
  });

  it("removes a leftover Spoke namespace in LEGACY mode too", () => {
    const installationRoot = tempTree("foundation-namespaces-leftover-");
    plantLegacyInstallation(installationRoot);
    const { runtimeRoot, runtimeBase } = runtimePair();
    syncMirrors(installationRoot, runtimeRoot);

    write(path.join(runtimeBase, "spokes", "ghost", "assets", "favicon.svg"), "<svg/>");
    expect(checkMirrors(installationRoot, runtimeRoot).unexpected).toContain(
      "spokes/ghost/assets/favicon.svg",
    );

    const repaired = syncMirrors(installationRoot, runtimeRoot);
    expect(repaired.removed).toContain("spokes/ghost/assets/favicon.svg");
    expect(existsSync(path.join(runtimeBase, "spokes"))).toBe(false);
  });
});

/**
 * RESOLUTION READS DECLARED NAMESPACES, AND ONLY THOSE (FOUNDATION-MULTISITE-S3F1)
 * ==============================================================================
 *
 * The mirror above decides WHERE a file is installed. These prove the other half of the same ownership
 * contract: when the runtime resolves a basename, it consults the namespaces of the CURRENTLY SELECTED
 * context — the platform one first (a Spoke may never shadow platform artwork), then the sole declared
 * Spoke's own — and nothing else.
 *
 * A generated namespace the context does not declare must be INVISIBLE, even though it is sitting on disk:
 * ownership is authored, and accidental generated-file presence is not authority. (The rule was previously
 * relaxed by a last-resort scan of the `spokes/` container, which let one Spoke be served another's
 * artwork; that fallback is gone, and these are the proofs that it stays gone.)
 */
describe("runtime resolution reads DECLARED namespaces only", () => {
  /** A disposable namespace directory holding `files`, addressed by `urlBase`. */
  function namespaceAt(
    prefix: string,
    urlBase: string,
    files: readonly string[],
  ): { directory: string; urlBase: string } {
    const directory = path.join(tempTree(prefix), "assets");
    mkdirSync(directory, { recursive: true });
    for (const file of files) write(path.join(directory, file), `<svg>${prefix}:${file}</svg>`);
    return { directory, urlBase };
  }

  const platform = namespaceAt("foundation-ns-platform-", "/assets", ["icon-home.svg", "shared.svg"]);
  const spokeA = namespaceAt("foundation-ns-a-", "/spokes/a/assets", ["banner.webp", "shared.svg"]);
  const spokeB = namespaceAt("foundation-ns-b-", "/spokes/b/assets", ["shared.svg"]);

  it("takes the PLATFORM namespace first: a Spoke can never shadow platform artwork", () => {
    // The same basename in two declared namespaces resolves to the PLATFORM copy, in either order of
    // declaration — platform assets are non-shadowable (A2).
    expect(namespaceOwning("shared.svg", [platform, spokeA])).toBe(platform);
    expect(namespaceOwning("shared.svg", [spokeA, platform])).toBe(spokeA);
    expect(namespaceOwning("icon-home.svg", [platform, spokeA])).toBe(platform);
  });

  it("resolves a Spoke-owned basename from the Spoke the context DECLARES", () => {
    expect(namespaceOwning("banner.webp", [platform, spokeA])).toBe(spokeA);
  });

  it("gives Spoke B NOTHING of Spoke A's — a foreign generated namespace is invisible to it", () => {
    // Spoke A OWNS banner.webp and its generated namespace exists on disk beside B's; B does not declare
    // A, so the file is simply unavailable to it.
    expect(existsSync(path.join(spokeA.directory, "banner.webp"))).toBe(true);
    expect(namespaceOwning("banner.webp", [platform, spokeB])).toBeNull();
    expect(namespaceOwning("banner.webp", [spokeB])).toBeNull();
  });

  it("gives each declared context only its OWN copy of a shared basename", () => {
    expect(namespaceOwning("shared.svg", [spokeA])).toBe(spokeA);
    expect(namespaceOwning("shared.svg", [spokeB])).toBe(spokeB);
    expect(namespaceOwning("shared.svg", [spokeA])).not.toBe(spokeB);
  });

  it("treats an UNDECLARED namespace as absent, and never resolves an empty name", () => {
    expect(namespaceOwning("banner.webp", [platform])).toBeNull();
    expect(namespaceOwning("banner.webp", [])).toBeNull();
    expect(namespaceOwning("", [platform, spokeA])).toBeNull();
  });

  it("ignores the repository's REAL generated Spoke namespace under a legacy selection", () => {
    // This process selects the synthetic (LEGACY) installation, whose declared namespaces are the platform
    // one only. The repository's generated tree may well hold the canonical deployment's Spoke namespace
    // beside it — that is ANOTHER installation's output, and it must be invisible here: a legacy
    // Installation resolves role artwork from its own platform namespace or not at all.
    expect(runtimeAssetPath("favicon.svg")).toBeUndefined();
    expect(iconAssetAvailable("favicon.svg")).toBe(false);
    expect(runtimeNamespaces().map((namespace) => namespace.urlBase)).toEqual(["/assets"]);
  });
});

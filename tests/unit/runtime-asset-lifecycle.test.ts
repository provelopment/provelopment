import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  MIRRORED,
  MIRRORED_DIRECTORIES,
  buildPlan,
  checkMirrors,
  deploymentAvailable,
  syncMirrors,
} from "../../scripts/sync-runtime-assets.mjs";

/**
 * THE GENERATED RUNTIME MIRROR'S LIFECYCLE (FOUNDATION-DEPLOYMENT-ISO-B3C1)
 * =======================================================================
 *
 * The deployment's `content/assets/**` is the ONE authority; `public/assets/**` is DERIVED from it and
 * is NOT version-controlled. This suite proves the mechanics that decision depends on, on disposable
 * trees under the OS temp directory — never the repository's real mirror, and never a real
 * deployment's artwork:
 *
 *   · an ABSENT mirror is bootstrapped deterministically (the fresh-checkout case, which previously
 *     crashed the installer and therefore made the tracked copy load-bearing);
 *   · MISSING, STALE and UNAUTHORIZED output is detected by `checkMirrors`, and repaired by
 *     `syncMirrors` — including unauthorized NESTED directories, which the flat plan never installs;
 *   · `syncMirrors` is IDEMPOTENT and byte-exact for every asset class, and it never touches anything
 *     outside its runtime tree, nor its own sources (the data flow is strictly one-way).
 *
 * S3E1C — PATHS IN A REPORT ARE RELATIVE TO THE GENERATED RUNTIME BASE (`public/`), which is the
 * directory that holds every namespace. The platform namespace is therefore `assets/**` in a report (its
 * files are installed into `<runtime base>/assets` exactly as before), and a Spoke's own artwork would be
 * `spokes/<segment>/assets/**` — the qualification that makes two Spokes' identical basenames
 * distinguishable in one report. `tests/unit/spoke-asset-namespaces.test.ts` proves that half.
 */
const trees: string[] = [];

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

/** Read a file as bytes, so a comparison cannot depend on text encoding. */
const bytes = (file: string): Buffer => readFileSync(file);

/**
 * Every file under a tree, as relative path → base64 content. Used to prove the ONE-WAY property: a
 * sync must leave its SOURCE tree byte-identical, so nothing is ever authored from the runtime side.
 */
function treeContents(root: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (directory: string, prefix: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full, relative);
      else found[relative] = readFileSync(full).toString("base64");
    }
  };
  walk(root, "");
  return found;
}

/**
 * A deployment that satisfies the WHOLE manifest: the configuration the seam requires, every declared
 * source file, and one artwork file inside each mirrored directory. `buildPlan` is then complete — no
 * declared source is missing — so a test's arithmetic is about the behaviour under test only.
 */
function plantDeployment(root: string): void {
  write(path.join(root, "site.config.json"), JSON.stringify({ synthetic: true }));
  for (const row of MIRRORED) write(path.join(root, row.from), `<svg>${row.to}</svg>`);
  write(path.join(root, "content", "assets", "icon-library", "icons", "icon-temp.svg"), "<svg/>");
  write(path.join(root, "content", "assets", "platform-marks", "mark-temp.svg"), "<svg/>");
}

/** A deployment plus an ABSENT runtime tree: the state a fresh checkout starts in. */
function freshPair(): { deploymentRoot: string; runtimeRoot: string } {
  const deploymentRoot = tempTree("foundation-assets-deployment-");
  plantDeployment(deploymentRoot);
  return { deploymentRoot, runtimeRoot: path.join(tempTree("foundation-assets-runtime-"), "public", "assets") };
}

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

describe("the plan is flat, so anything else in the runtime tree is unauthorized output", () => {
  it("installs plain filenames only — no runtime subdirectory is ever legitimate", () => {
    const { deploymentRoot } = freshPair();
    const plan = buildPlan(deploymentRoot);
    expect(plan.length).toBeGreaterThan(0);
    for (const row of plan) expect(row.to, row.to).not.toContain("/");
    // Every declared source is deployment-relative, and the plan is deduplicated.
    expect(new Set(plan.map((row) => row.to)).size).toBe(plan.length);
    for (const row of [...MIRRORED, ...MIRRORED_DIRECTORIES]) {
      expect(row.from.startsWith("content/assets/"), row.from).toBe(true);
    }
  });
});

describe("missing, stale and unauthorized output are all detected — and repaired by sync", () => {
  it("reports a MISSING runtime file, then restores it byte-exactly", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    syncMirrors(deploymentRoot, runtimeRoot);
    const row = buildPlan(deploymentRoot)[0];
    rmSync(path.join(runtimeRoot, row.to));

    const missing = checkMirrors(deploymentRoot, runtimeRoot);
    expect(missing.created.map((entry) => entry.to)).toEqual([row.to]);
    expect(missing.unexpected).toEqual([]);

    syncMirrors(deploymentRoot, runtimeRoot);
    expect(bytes(path.join(runtimeRoot, row.to))).toEqual(bytes(path.join(deploymentRoot, row.from)));
  });

  it("reports a file added directly to the mirror and REMOVES it, so it is never accepted", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    syncMirrors(deploymentRoot, runtimeRoot);
    write(path.join(runtimeRoot, "unauthorized.svg"), "<svg/>");

    expect(checkMirrors(deploymentRoot, runtimeRoot).unexpected).toEqual(["assets/unauthorized.svg"]);

    const repaired = syncMirrors(deploymentRoot, runtimeRoot);
    expect(repaired.removed).toEqual(["assets/unauthorized.svg"]);
    expect(existsSync(path.join(runtimeRoot, "unauthorized.svg"))).toBe(false);
    expect(checkMirrors(deploymentRoot, runtimeRoot).unexpected).toEqual([]);
  });

  it("removes an unauthorized NESTED directory the flat plan never creates", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    syncMirrors(deploymentRoot, runtimeRoot);
    write(path.join(runtimeRoot, "stray", "deeper", "file.svg"), "<svg/>");

    expect(checkMirrors(deploymentRoot, runtimeRoot).unexpected).toEqual([
      "assets/stray/",
      "assets/stray/deeper/",
      "assets/stray/deeper/file.svg",
    ]);

    const repaired = syncMirrors(deploymentRoot, runtimeRoot);
    expect(repaired.removed).toEqual([
      "assets/stray/",
      "assets/stray/deeper/",
      "assets/stray/deeper/file.svg",
    ]);
    expect(existsSync(path.join(runtimeRoot, "stray"))).toBe(false);
  });

  it("removes output whose SOURCE disappeared, so a generated tree cannot accumulate history", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    syncMirrors(deploymentRoot, runtimeRoot);
    const row = buildPlan(deploymentRoot).find((entry) =>
      entry.from.startsWith("content/assets/icon-library/icons/"),
    ) as { from: string; to: string };
    // The source is gone (the owner deleted an icon). The plan is derived from the directory listing,
    // so the row leaves the plan — and the runtime file it produced must stop being shipped.
    rmSync(path.join(deploymentRoot, row.from));

    const stale = checkMirrors(deploymentRoot, runtimeRoot);
    expect(stale.unexpected).toContain(`assets/${row.to}`);
    expect(stale.unexpected).not.toContain(`assets/${row.to}/`);

    const repaired = syncMirrors(deploymentRoot, runtimeRoot);
    expect(repaired.removed).toContain(`assets/${row.to}`);
    expect(existsSync(path.join(runtimeRoot, row.to))).toBe(false);
    expect(checkMirrors(deploymentRoot, runtimeRoot).unexpected).toEqual([]);
  });

  it("reports a missing DECLARED source as a failure sync cannot repair", () => {
    // A `MIRRORED` row is a promise: the plan names it whether or not the file exists. A missing
    // declared source is therefore a manifest error (a broken installation), never a removal.
    const { deploymentRoot, runtimeRoot } = freshPair();
    syncMirrors(deploymentRoot, runtimeRoot);
    const row = MIRRORED[0] as { from: string; to: string };
    rmSync(path.join(deploymentRoot, row.from));

    const report = checkMirrors(deploymentRoot, runtimeRoot);
    expect(report.missingSources.map((entry) => entry.from)).toEqual([row.from]);
    const attempted = syncMirrors(deploymentRoot, runtimeRoot);
    expect(attempted.created).toEqual([]);
    expect(attempted.updated).toEqual([]);
    expect(attempted.removed).toEqual([]);
  });

  it("repairs a BYTE-level drift, including non-text bytes, without normalising them", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    syncMirrors(deploymentRoot, runtimeRoot);
    const row = buildPlan(deploymentRoot).find((entry) =>
      entry.from.startsWith("content/assets/platform-marks/"),
    ) as { from: string; to: string };
    // A binary source (a PNG's signature plus NUL bytes) must survive the mirror unchanged.
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    writeFileSync(path.join(deploymentRoot, row.from), binary);

    const drifted = checkMirrors(deploymentRoot, runtimeRoot);
    expect(drifted.updated.map((entry) => entry.to)).toEqual([row.to]);

    syncMirrors(deploymentRoot, runtimeRoot);
    expect(bytes(path.join(runtimeRoot, row.to))).toEqual(binary);
  });
});

describe("sync is idempotent, one-way, and confined to its own runtime tree", () => {
  it("changes nothing on a second run once the mirror equals the plan", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    syncMirrors(deploymentRoot, runtimeRoot);
    const second = syncMirrors(deploymentRoot, runtimeRoot);
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.current).toHaveLength(buildPlan(deploymentRoot).length);
  });

  it("never writes to its sources, and never touches a path outside the runtime tree", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    const sibling = path.join(path.dirname(runtimeRoot), "sibling-assets");
    write(path.join(sibling, "keep.svg"), "<svg/>");
    write(path.join(runtimeRoot, "unauthorized.svg"), "<svg/>");

    const sourcesBefore = treeContents(deploymentRoot);
    syncMirrors(deploymentRoot, runtimeRoot);

    // ONE-WAY: the authoritative tree is read, never written.
    expect(treeContents(deploymentRoot)).toEqual(sourcesBefore);
    // CONFINED: only the runtime tree is repaired.
    expect(existsSync(path.join(sibling, "keep.svg"))).toBe(true);
    expect(existsSync(path.join(runtimeRoot, "unauthorized.svg"))).toBe(false);
  });
});

describe("the deployment the installer targets comes from the ONE seam", () => {
  it("answers whether a deployment is installed, instead of failing an install that has none", () => {
    const { deploymentRoot } = freshPair();
    expect(deploymentAvailable({}, deploymentRoot)).toBe(true);
    // A tree with no `site.config.json` is not a deployment: the postinstall hook must tolerate this,
    // because a checkout can legitimately exist without one.
    expect(deploymentAvailable({}, tempTree("foundation-assets-empty-"))).toBe(false);
    // …while every explicit command keeps the seam's loud failure.
    expect(() => checkMirrors(tempTree("foundation-assets-nodeployment-"))).toThrow();
  });
});

describe("an ABSENT mirror is a fresh-checkout state, not a failure to measure", () => {
  it("is detected without crashing, and reported as not installed", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    const report = checkMirrors(deploymentRoot, runtimeRoot);
    expect(report.created).toHaveLength(buildPlan(deploymentRoot).length);
    expect(report.updated).toEqual([]);
    expect(report.current).toEqual([]);
    expect(report.unexpected).toEqual([]);
    expect(report.missingSources).toEqual([]);
  });

  it("is bootstrapped by sync, byte-exactly, and then checks clean", () => {
    const { deploymentRoot, runtimeRoot } = freshPair();
    const report = syncMirrors(deploymentRoot, runtimeRoot);
    expect(report.removed).toEqual([]);
    expect(report.created).toHaveLength(buildPlan(deploymentRoot).length);
    for (const row of buildPlan(deploymentRoot)) {
      const target = path.join(runtimeRoot, row.to);
      expect(existsSync(target), row.to).toBe(true);
      expect(bytes(target)).toEqual(bytes(path.join(deploymentRoot, row.from)));
    }
    const after = checkMirrors(deploymentRoot, runtimeRoot);
    expect(after.created).toEqual([]);
    expect(after.updated).toEqual([]);
    expect(after.unexpected).toEqual([]);
    expect(after.current).toHaveLength(buildPlan(deploymentRoot).length);
  });
});

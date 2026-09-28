import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  MIRRORED,
  MIRRORED_DIRECTORIES,
  buildPlan,
  resolveAssetDeployment,
} from "../../scripts/sync-runtime-assets.mjs";

/**
 * THE ASSET PIPELINE FOLLOWS THE SELECTED DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-H1)
 * =================================================================================
 *
 * `scripts/sync-runtime-assets.mjs` mirrors deployment-owned SOURCE artwork into the repository's
 * GENERATED `public/assets/**` runtime tree. The source tree is deployment state, so its location
 * must come from the ONE build/deployment seam (`src/config/deployment-build.ts`) — the same answer
 * `next.config.ts` and `vitest.config.mts` receive — in every supported layout.
 *
 * The defect this suite guards against is a measured one: the ISO-B2B migration moved the reference
 * deployment's artwork into its capsule, and `pnpm assets:check` failed because the script scanned
 * `<repo>/content/assets/**` literally.
 *
 * Every layout here is proved on a SYNTHETIC tree under the OS temp directory — never the live
 * deployment — and each tree carries a DECOY asset in the location that layout must NOT read, so a
 * passing test cannot come from the script having scanned the wrong root. Nothing is left on disk
 * afterwards, and nothing in this suite depends on the reference deployment's own configuration.
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

/**
 * The minimum a layout needs: the configuration the seam requires, plus the two directories
 * `buildPlan` scans (they are read with `readdirSync`, so they must exist).
 */
function plantDeployment(root: string, icon: string): void {
  write(path.join(root, "site.config.json"), JSON.stringify({ synthetic: true }));
  write(path.join(root, "content", "assets", "icon-library", "icons", icon), "<svg/>");
  write(path.join(root, "content", "assets", "platform-marks", `mark-${icon}`), "<svg/>");
}

/** The planned sources, as the deployment-relative paths the plan publishes. */
const plannedSources = (deploymentRoot: string): string[] =>
  buildPlan(deploymentRoot).map((row) => row.from);

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

describe("asset source resolution — the SELECTED deployment owns the source tree", () => {
  it("repository layout: sources come from `<repo>/content/assets`, and the mirror stays the repository's", () => {
    const repo = tempTree("foundation-assets-repository-");
    plantDeployment(repo, "icon-repository.svg");
    // A capsule-SHAPED decoy that is not a capsule (it holds no `deployment/site.config.json`).
    write(
      path.join(repo, "deployment", "content", "assets", "icon-library", "icons", "icon-decoy.svg"),
      "<svg/>",
    );

    const resolved = resolveAssetDeployment({}, repo);
    expect(resolved.layout).toBe("repository");
    expect(resolved.deploymentRoot).toBe(repo);
    expect(resolved.sourceRoot).toBe(path.join(repo, "content", "assets"));
    // Generated output is platform state: it never moves with a deployment.
    expect(resolved.runtimeRoot).toBe(path.join(repo, "public", "assets"));

    const planned = plannedSources(repo);
    expect(planned).toContain("content/assets/icon-library/icons/icon-repository.svg");
    expect(planned).not.toContain("deployment/content/assets/icon-library/icons/icon-decoy.svg");
  });

  it("capsule layout: sources come from `<repo>/deployment/content/assets`, and the repository root is ignored", () => {
    const repo = tempTree("foundation-assets-capsule-");
    const capsule = path.join(repo, "deployment");
    plantDeployment(capsule, "icon-capsule.svg");
    // A repository-root decoy: the capsule owns the deployment, so this must not be read.
    write(
      path.join(repo, "content", "assets", "icon-library", "icons", "icon-decoy.svg"),
      "<svg/>",
    );

    const resolved = resolveAssetDeployment({}, repo);
    expect(resolved.layout).toBe("capsule");
    expect(resolved.deploymentRoot).toBe(capsule);
    expect(resolved.sourceRoot).toBe(path.join(capsule, "content", "assets"));
    // The generated mirror does NOT move into the capsule.
    expect(resolved.runtimeRoot).toBe(path.join(repo, "public", "assets"));
    // A capsule is enough on its own: the repository root needs no configuration at all.
    expect(existsSync(path.join(repo, "site.config.json"))).toBe(false);

    const planned = plannedSources(capsule);
    expect(planned).toContain("content/assets/icon-library/icons/icon-capsule.svg");
    expect(planned).not.toContain("content/assets/icon-library/icons/icon-decoy.svg");
    // No declared source escapes the deployment root the seam selected.
    for (const from of planned) expect(from.startsWith("content/assets/")).toBe(true);
  });

  it("override layout (dev/test deployment): sources come from the override root, not the repository", () => {
    const override = tempTree("foundation-assets-override-");
    plantDeployment(override, "icon-override.svg");

    const repo = tempTree("foundation-assets-override-repository-");
    write(path.join(repo, "site.config.json"), JSON.stringify({ synthetic: true }));
    write(
      path.join(repo, "content", "assets", "icon-library", "icons", "icon-decoy.svg"),
      "<svg/>",
    );
    write(path.join(repo, "content", "assets", "platform-marks", "decoy.svg"), "<svg/>");

    const resolved = resolveAssetDeployment({ FOUNDATION_DEPLOYMENT_ROOT: override }, repo);
    expect(resolved.layout).toBe("override");
    expect(resolved.deploymentRoot).toBe(override);
    expect(resolved.sourceRoot).toBe(path.join(override, "content", "assets"));
    expect(resolved.runtimeRoot).toBe(path.join(repo, "public", "assets"));

    const planned = plannedSources(override);
    expect(planned).toContain("content/assets/icon-library/icons/icon-override.svg");
    expect(planned).not.toContain("content/assets/icon-library/icons/icon-decoy.svg");
  });
});

describe("the asset pipeline uses the ONE seam, and keeps the two ownership concepts apart", () => {
  const script = readFileSync(path.join(process.cwd(), "scripts", "sync-runtime-assets.mjs"), "utf8");
  /** CODE lines only: the header legitimately names the layouts and the seam in prose. */
  const code = script.split(/\r?\n/).filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));

  it("asks the build seam which deployment this is, instead of implementing a second mechanism", () => {
    expect(code.some((line) => /from\s+["'][^"']*deployment-build[^"']*["']/.test(line))).toBe(true);
    // No capsule sniffing of its own, and no independent parsing of the deployment-root env: the
    // seam is the ONLY place that answers "which deployment is this?".
    for (const line of code) {
      expect(line, `the script must not spell a deployment location: ${line}`).not.toMatch(
        /site\.config\.json/,
      );
      expect(line, `the script must not resolve the deployment itself: ${line}`).not.toMatch(
        /FOUNDATION_DEPLOYMENT_ROOT/,
      );
    }
  });

  it("publishes deployment-relative SOURCES and a repository-anchored GENERATED target", () => {
    // Every source is joined to the DEPLOYMENT root the seam selected…
    expect(
      code.some((line) => /source\s*=\s*path\.join\(deploymentRoot,\s*row\.from\)/.test(line)),
    ).toBe(true);
    // …while the generated mirror is anchored to the repository in every layout.
    expect(
      code.some((line) => /RUNTIME_ROOT\s*=\s*path\.join\(ROOT,\s*RUNTIME_DIR\)/.test(line)),
    ).toBe(true);
    expect(
      code.some((line) => /runtimeRoot:\s*path\.join\(repositoryRoot,\s*RUNTIME_DIR\)/.test(line)),
    ).toBe(true);
    // Declared sources stay deployment-relative, so no row can name a repository-root location.
    for (const row of [...MIRRORED, ...MIRRORED_DIRECTORIES]) {
      expect(row.from.startsWith("content/assets/"), row.from).toBe(true);
    }
  });
});

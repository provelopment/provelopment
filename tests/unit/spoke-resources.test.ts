import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DEPLOYMENT_RESOURCE_PATHS, deploymentPaths } from "@/config/deployment-root";
import { spokeResourcePaths, type SpokeResourcePaths } from "@/config/spoke-resources";
import { IMPLICIT_SPOKE_ID } from "@/core/spoke";

/**
 * SPOKE RESOURCE PATHS (FOUNDATION-MULTISITE-S3E1A)
 * ===============================================
 *
 * Proves the ONE new capability of this slice: an already-resolved Spoke root yields that Spoke's authored
 * resource trees — with the legacy implicit Spoke deriving EXACTLY today's deployment resource paths,
 * several Spokes staying strictly independent (identical relative layouts, no merge), and no discovery, no
 * filesystem requirement, no publication and no runtime namespace anywhere in it.
 *
 * NOTHING here creates, reads or writes a resource tree: an ABSENT tree is the interesting case, and a path
 * model must not need one. The canonical deployment is never involved.
 */

const INSTALLATION = `${tmpdir()}/foundation-s3e1a-installation`;

/** The five authored trees the model publishes, as `field -> relative tree` (from the ONE authority). */
const AUTHORED_TREES: Readonly<Record<string, string>> = {
  dictionaryRoot: DEPLOYMENT_RESOURCE_PATHS.dictionary,
  dictionaryOverrideRoot: DEPLOYMENT_RESOURCE_PATHS.dictionaryOverrides,
  markdownPagesRoot: DEPLOYMENT_RESOURCE_PATHS.markdownPages,
  jsonPagesRoot: DEPLOYMENT_RESOURCE_PATHS.jsonPages,
  assetSourceRoot: DEPLOYMENT_RESOURCE_PATHS.assetSources,
};

const AUTHORED_TREE_KEYS = Object.keys(AUTHORED_TREES) as (keyof SpokeResourcePaths)[];

/** Every field the model publishes, sorted: the five authored trees plus the root itself, and nothing else. */
const PUBLISHED_FIELDS = [...AUTHORED_TREE_KEYS.map(String), "spokeRoot"].sort();

const relative = (file: string): string => path.relative(process.cwd(), file).split(path.sep).join("/");

/** The CODE lines of a file: prose may legitimately NAME what the module refuses to do. */
function codeLines(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/** Every executable source file under `src/**` (the surface a production importer would appear in). */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mjs)$/.test(full)) found.push(full);
  }
  return found;
}

describe("legacy implicit compatibility — the strongest test of the abstraction", () => {
  it("derives EXACTLY today's deployment resource paths for the implicit Spoke", () => {
    const deployment = deploymentPaths();
    const paths = spokeResourcePaths({ id: IMPLICIT_SPOKE_ID, root: deployment.root });

    expect(paths.spokeRoot).toBe(deployment.root);
    expect(paths.dictionaryRoot).toBe(deployment.dictionaryDirectory);
    expect(paths.dictionaryOverrideRoot).toBe(deployment.dictionaryOverrideDirectory);
    expect(paths.markdownPagesRoot).toBe(deployment.markdownPagesRoot);
    expect(paths.jsonPagesRoot).toBe(deployment.jsonPagesRoot);
    expect(paths.assetSourceRoot).toBe(deployment.assetSourceRoot);
  });

  it("composes those paths from the SAME relative trees the authority publishes", () => {
    const deployment = deploymentPaths();
    const { root } = deployment;

    expect(deployment.dictionaryDirectory).toBe(`${root}/${DEPLOYMENT_RESOURCE_PATHS.dictionary}`);
    expect(deployment.dictionaryOverrideDirectory).toBe(
      `${root}/${DEPLOYMENT_RESOURCE_PATHS.dictionaryOverrides}`,
    );
    expect(deployment.markdownPagesRoot).toBe(`${root}/${DEPLOYMENT_RESOURCE_PATHS.markdownPages}`);
    expect(deployment.jsonPagesRoot).toBe(`${root}/${DEPLOYMENT_RESOURCE_PATHS.jsonPages}`);
    expect(deployment.assetSourceRoot).toBe(`${root}/${DEPLOYMENT_RESOURCE_PATHS.assetSources}`);
  });
});

describe("explicit Spoke paths", () => {
  const first = spokeResourcePaths({ id: "foundation", root: `${INSTALLATION}/spokes/a` });
  const second = spokeResourcePaths({ id: "demo", root: `${INSTALLATION}/spokes/b` });

  it("roots every authored tree beneath the descriptor's own root", () => {
    expect(first.spokeRoot).toBe(`${INSTALLATION}/spokes/a`);

    for (const key of AUTHORED_TREE_KEYS) {
      expect(first[key], key).toBe(`${first.spokeRoot}/${AUTHORED_TREES[key]}`);
      expect(first[key].startsWith(`${first.spokeRoot}/`), key).toBe(true);
    }
  });

  it("keeps two Spokes' resource trees strictly independent", () => {
    for (const key of AUTHORED_TREE_KEYS) {
      expect(first[key].startsWith(second.spokeRoot), key).toBe(false);
      expect(second[key].startsWith(first.spokeRoot), key).toBe(false);
    }
    expect(first.spokeRoot).not.toBe(second.spokeRoot);
  });

  it("allows the SAME relative resource layout in both Spokes (no collision, no merge)", () => {
    for (const key of AUTHORED_TREE_KEYS) {
      expect(first[key].endsWith(`/${AUTHORED_TREES[key]}`), key).toBe(true);
      expect(second[key].endsWith(`/${AUTHORED_TREES[key]}`), key).toBe(true);
    }
  });

  it("follows the descriptor ROOT, never the id (identity and spelling are independent)", () => {
    const mismatched = spokeResourcePaths({
      id: "foundation",
      root: `${INSTALLATION}/spokes/foundation-web`,
    });
    expect(mismatched.spokeRoot).toBe(`${INSTALLATION}/spokes/foundation-web`);
    expect(mismatched.dictionaryRoot).toBe(`${INSTALLATION}/spokes/foundation-web/config/i18n`);
    expect(mismatched.assetSourceRoot.includes("foundation/")).toBe(false);

    const unrelated = spokeResourcePaths({ id: "other-spoke", root: `${INSTALLATION}/spokes/one` });
    expect(unrelated.jsonPagesRoot).toBe(`${INSTALLATION}/spokes/one/content/pages/json`);
    expect(unrelated.markdownPagesRoot.includes("other-sp")).toBe(false);
  });

  it("publishes EXACTLY the authored trees, and no runtime field", () => {
    expect(Object.keys(first).sort()).toEqual(PUBLISHED_FIELDS);
    expect(Object.keys(DEPLOYMENT_RESOURCE_PATHS).sort()).toEqual([
      "assetSources",
      "dictionary",
      "dictionaryOverrides",
      "jsonPages",
      "markdownPages",
    ]);
    expect(Object.isFrozen(DEPLOYMENT_RESOURCE_PATHS)).toBe(true);
  });
});

describe("paths only: no existence, no publication", () => {
  it("derives paths for resource trees that do NOT exist, and creates nothing", () => {
    const absent = `${INSTALLATION}/spokes/absent`;
    expect(existsSync(absent)).toBe(false);

    const paths = spokeResourcePaths({ id: "absent", root: absent });

    expect(paths.dictionaryRoot).toBe(`${absent}/config/i18n`);
    expect(paths.assetSourceRoot).toBe(`${absent}/content/assets`);
    // Derivation touched no filesystem: the tree is still absent afterwards.
    expect(existsSync(absent)).toBe(false);
    expect(existsSync(paths.dictionaryRoot)).toBe(false);
  });
});

describe("S3E1A discovers nothing and is UNWIRED", () => {
  const model = (): string => codeLines(path.join(process.cwd(), "src", "config", "spoke-resources.ts"));

  it("reads no cwd, no environment, no manifest, no layout, and resolves no root", () => {
    const code = model();
    for (const forbidden of [
      /process\.cwd\(\)/,
      /process\.env/,
      /spokes\.json/,
      /deployment-build/,
      /path\.resolve/,
      /resolveInstallationSpokeRoots/,
      /discover/i,
      /public\//,
      /assetBasePath/,
      /runtime/i,
    ]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
    // The ONE thing it consults besides the root it was handed: the authority's relative trees.
    expect(code).toMatch(/DEPLOYMENT_RESOURCE_PATHS/);
  });

  it("no module imports the seam, and the client-facing barrel does not publish it", () => {
    const importers = sourceFiles(path.join(process.cwd(), "src"))
      .filter((file) => /from\s+["'][^"']*spoke-resources["']/.test(readFileSync(file, "utf8")))
      .map(relative);
    expect(importers).toEqual([]);

    expect(
      readFileSync(path.join(process.cwd(), "src", "config", "index.ts"), "utf8"),
    ).not.toMatch(/spoke-resources/);
  });
});

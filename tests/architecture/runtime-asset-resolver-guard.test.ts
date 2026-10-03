import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * S3F2A2-R1 GUARD — THE OWNERSHIP RESOLVER HOLDS NO AMBIENT CONTEXT AND NO SHARED CACHE
 * =====================================================================================
 *
 * The new resolver must be safe for SEVERAL runtime contexts to use at once in one process, which means two
 * things must be structurally true of its source, not merely true today: it must carry no ambient "which
 * Spoke am I" selection state, and it must not own a cache at module scope. It must also resolve only from
 * the namespaces it is handed — never from the process's own namespace list and never from generated output.
 */

const CONFIG_DIRECTORY = path.join(process.cwd(), "src", "config");
const RESOLVER_MODULE = path.join(CONFIG_DIRECTORY, "runtime-asset-resolver.ts");
const LIVE_ASSET_MODULE = path.join(CONFIG_DIRECTORY, "assets.ts");

/** Built by concatenation so no single line carries a repository anchor together with these words. */
const AMBIENT_SELECTION = [
  "active" + "Spoke",
  "current" + "Spoke",
  "selected" + "Spoke",
  "default" + "Spoke",
];

describe("runtime asset ownership resolver guard", () => {
  const source = readFileSync(RESOLVER_MODULE, "utf8");

  it("carries no ambient Spoke selection state", () => {
    for (const word of AMBIENT_SELECTION) expect(source).not.toContain(word);
    expect(source).not.toMatch(/\b(?:let|var)\s/);
  });

  it("keeps its ownership cache inside the resolver instance", () => {
    const cacheDeclarations = source.split("\n").filter((line) => line.includes("new Map<"));
    expect(cacheDeclarations).toHaveLength(1);
    expect(/^\s/.test(cacheDeclarations[0])).toBe(true);

    const moduleLevelDeclarations = source
      .split("\n")
      .filter((line) => /^(?:export )?(?:const|let|var)\b/.test(line));
    expect(moduleLevelDeclarations.filter((line) => /new Map<|Cache/.test(line))).toEqual([]);
  });

  it("resolves only from the namespaces it is handed", () => {
    expect(source).not.toContain("deploymentPaths");
    expect(source).not.toMatch(/readdirSync|globSync|readdir\(/);
    // No reference to the served output root at all (a path segment or a quoted literal), as opposed to the
    // word appearing in prose about public API signatures.
    expect(source).not.toMatch(/public[\\/]|["'`]public["'`]/);
  });

  it("is additive and unwired: the live asset module does not reference it", () => {
    expect(readFileSync(LIVE_ASSET_MODULE, "utf8")).not.toContain("runtime-asset-resolver");
  });
});

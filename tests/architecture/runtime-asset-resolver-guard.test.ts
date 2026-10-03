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
    // No module-level MUTABLE binding of any kind: function-local state (e.g. a decoder's cursor) is not
    // shared state, but a module-scope `let`/`var` would be.
    expect(source.split("\n").filter((line) => /^(?:export )?(?:let|var)\b/.test(line))).toEqual([]);
  });

  it("keeps the owner and dimension caches inside the resolver instance", () => {
    const cacheDeclarations = source.split("\n").filter((line) => line.includes("new Map<"));
    expect(cacheDeclarations).toHaveLength(2);
    for (const declaration of cacheDeclarations) expect(/^\s/.test(declaration)).toBe(true);

    expect(source).toContain("const ownerCache = new Map<string, RuntimeAssetNamespace | null>();");
    expect(source).toContain("const dimensionCache = new Map<string, ImageDimensions | undefined>();");

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

  it("projects every URL from the owning namespace's own urlBase, never a hardcoded prefix", () => {
    const projections = source.split("\n").filter((line) => line.includes("urlBase"));
    expect(projections.length).toBeGreaterThan(0);
    // No namespace base is ever spelled literally in a URL: each answer is built from the OWNING namespace.
    for (const line of projections) expect(line).not.toMatch(/["'`]\//);
    expect(source).toContain("${owner.urlBase}/${name}");
  });

  it("answers every page-role graphic through ONE resolver-local availability rule", () => {
    // The availability rule exists ONCE and is called by each of the six page-role methods.
    expect(source.split("const roleUrl =").length - 1).toBe(1);
    expect(source.split("roleUrl(").length - 1).toBe(6);
    for (const role of [
      "availableBannerPath",
      "availableBackgroundPath",
      "availableBackgroundMap",
      "availableFooterGraphicPath",
      "availableHeaderGraphicPath",
      "availableStatusGraphicPath",
    ]) {
      expect(source).toContain(role);
    }
    // A role is available only through THIS resolver's ownership: an unowned basename is `undefined` — never
    // the configured pathname (that preservation belongs to `runtimeAssetUrl` alone).
    expect(source).toContain("ownerOf(name) === null) return undefined");
  });

  it("is the LIVE authority: the asset module builds exactly ONE compatibility resolver from the deployment", () => {
    const live = readFileSync(LIVE_ASSET_MODULE, "utf8");
    expect(live).toContain("runtime-asset-resolver");
    expect(live.split("createRuntimeAssetOwnershipResolver(").length - 1).toBe(1);
    // Built from the deployment's namespace authority — the same list the legacy engine used.
    expect(live).toContain("deploymentPaths().runtimeAssetNamespaces");
  });

  it("leaves NO second runtime-asset engine in the live asset module", () => {
    const live = readFileSync(LIVE_ASSET_MODULE, "utf8");

    // No process-global cache of any kind: owner and dimension state live in the resolver instance.
    expect(live.split("new Map<").length - 1).toBe(0);

    // No duplicated media/ownership implementation: the decoders, the header read and the existence search
    // all belong to the resolver module now.
    expect(live).not.toMatch(/readUInt32BE|readUInt32LE|readUInt16BE|readUInt16LE|viewBox|GIF89a/);
    expect(live).not.toMatch(/\b(existsSync|statSync|openSync|readSync|closeSync)\s*\(/);
    expect(live).not.toMatch(/from "node:fs"|from "node:path"/);

    // No discovery of arbitrary Spoke namespaces, and no ambient selection state of any kind.
    expect(live).not.toMatch(/readdirSync|globSync|readdir\(/);
    for (const word of AMBIENT_SELECTION) expect(live).not.toContain(word);

    // …while every public projection still comes from the resolver: the delegations ARE the module.
    expect(live.split("compatibilityResolver.").length - 1).toBe(15);
  });
});

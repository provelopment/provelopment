import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * S3F2A2-D1 GUARD — THE RUNTIME DICTIONARY ACCESS IS CONTEXT-BOUND, SHARED AND CACHE-FREE
 * =======================================================================================
 *
 * The new capability is safe for SEVERAL contexts in one process only if three things are
 * STRUCTURALLY true of its source, not merely true today: it must be handed ONE explicit
 * SpokeRuntimeContext (never resolve or select one itself), it must hold no registry and no
 * Spoke→registry cache at module scope, and it must delegate to the ONE accepted registry loader
 * rather than restating any dictionary rule. Its booking-lock rule must be the SAME single
 * implementation the compatibility binding uses.
 */

const CONFIG_DIRECTORY = path.join(process.cwd(), "src", "config");
const ACCESS_MODULE = path.join(CONFIG_DIRECTORY, "runtime-dictionaries.ts");
const INVARIANTS_MODULE = path.join(CONFIG_DIRECTORY, "i18n", "invariants.ts");

/** Built by concatenation so no single line carries a repository anchor together with these words. */
const AMBIENT_SELECTION = [
  "active" + "Dictionary",
  "current" + "Dictionary",
  "selected" + "Dictionary",
  "default" + "Dictionary",
  "last" + "Dictionary",
];

/** Every executable source file under a tree — where a second loader or an ambient binding would appear. */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx|mjs)$/.test(full)) found.push(full);
  }
  return found;
}

const relative = (file: string): string => path.relative(process.cwd(), file).split(path.sep).join("/");

describe("runtime dictionary access guard", () => {
  const source = readFileSync(ACCESS_MODULE, "utf8");

  it("takes ONE explicit SpokeRuntimeContext and resolves none for itself", () => {
    expect(source).toContain("SpokeRuntimeContext");
    expect(source).toContain("dictionaryAccessForRuntimeContext");
    // No ambient configuration or root resolution of any kind.
    expect(source).not.toContain("deploymentPaths");
    expect(source).not.toContain("currentBuildRuntimeContext");
    expect(source).not.toMatch(/from "\.\.\/loader"|from "\.\.\/index"|from "@\/config"/);
    expect(source).not.toContain("import { siteConfig }");
    // It reads no files: discovery belongs to the loader it delegates to.
    expect(source).not.toMatch(/from "node:fs"|from "node:path"/);
    expect(source).not.toMatch(/\b(readdirSync|readFileSync|existsSync|globSync|readdir)\s*\(/);
  });

  it("holds no module-global registry and no Spoke → registry cache", () => {
    for (const word of AMBIENT_SELECTION) expect(source).not.toContain(word);
    // No module-level MUTABLE binding of any kind.
    expect(source.split("\n").filter((line) => /^(?:export )?(?:let|var)\b/.test(line))).toEqual([]);
    const moduleLevel = source
      .split("\n")
      .filter((line) => /^(?:export )?(?:const|let|var)\b/.test(line));
    expect(moduleLevel.filter((line) => /new Map<|Cache|Registry/.test(line))).toEqual([]);
    // The registry is a LOCAL of the factory: the access object itself is the scope.
    expect(source).toContain("const registry = loadSpokeDictionaryRegistry(");
  });

  it("delegates to the ONE registry loader — no second dictionary loader", () => {
    expect(source.split("loadSpokeDictionaryRegistry(").length - 1).toBe(1);
    // Reached through the per-Spoke module, never re-implemented or reached directly.
    expect(source).not.toContain("loadDictionaryRegistry");
    expect(source).not.toMatch(/dictionarySchema|dictionaryOverrideSchema|languageBaseOf/);
  });

  it("shares the ONE booking-label invariant instead of restating it", () => {
    expect(source).toContain("assertBookingLabelPresent");
    expect(source).toContain('from "./i18n/invariants"');

    // The invariant is DEFINED exactly once under `src/**`: the extracted pure module.
    const definers = sourceFiles(path.join(process.cwd(), "src"))
      .filter((file) => readFileSync(file, "utf8").includes("export function assertBookingLabelPresent("))
      .map(relative)
      .sort();
    expect(definers).toEqual(["src/config/i18n/invariants.ts"]);

    // …and THAT module is pure: no filesystem, no deployment location, no registry loader.
    const invariants = readFileSync(INVARIANTS_MODULE, "utf8");
    expect(invariants).not.toMatch(/from "node:fs"|from "node:path"/);
    expect(invariants).not.toContain("deploymentPaths");
    expect(invariants).not.toContain("loadDictionaryRegistry");
    expect(invariants.split("\n").filter((line) => /^(?:export )?(?:let|var)\b/.test(line))).toEqual([]);
  });
});

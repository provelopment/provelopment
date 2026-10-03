import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * S3F2A2-D2 GUARD — THE PRODUCTION DICTIONARY BINDING DELEGATES, AND OWNS NO REGISTRY
 * ==================================================================================
 *
 * After the cutover, `src/config/i18n/index.ts` must hold ONE immutable compatibility
 * `RuntimeDictionaryAccess` built from the current build context, and NOTHING else: no registry
 * construction, no deployment-path spelling, no module-global configuration, no effective-dictionary
 * map, no second booking rule. These are SOURCE facts, so a future edit cannot quietly reintroduce a
 * private dictionary binding beside the proven capability.
 *
 * Comments are stripped before every assertion: prose may name these modules (it must, to be
 * maintainable) and a guard that keyed on prose would fail for the wrong reason.
 */

const CONFIG_DIRECTORY = path.join(process.cwd(), "src", "config");
const I18N_DIRECTORY = path.join(CONFIG_DIRECTORY, "i18n");
const I18N_INDEX = path.join(I18N_DIRECTORY, "index.ts");

/** The CODE lines of a file — comment lines are ignored. */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    });
}

/** Every executable source file under a tree — where a second dictionary rule would appear. */
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

describe("production dictionary binding guard", () => {
  const code = codeLines(I18N_INDEX).join("\n");

  it("constructs exactly ONE compatibility RuntimeDictionaryAccess from the build context", () => {
    expect(code.split("dictionaryAccessForRuntimeContext(").length - 1).toBe(1);
    expect(code).toMatch(
      /const compatibilityDictionaryAccess = dictionaryAccessForRuntimeContext\(currentBuildRuntimeContext\(\)\);/,
    );
    // The compatibility seam is the ONLY selection this module makes: no Spoke is chosen here.
    expect(code.split("currentBuildRuntimeContext(").length - 1).toBe(1);
    // One module-level IMMUTABLE binding — never `let`/`var`, never a cache.
    expect(codeLines(I18N_INDEX).filter((line) => /^(?:export )?(?:let|var)\b/.test(line))).toEqual([]);
    expect(code).not.toMatch(/Cache|new Map</);
  });

  it("delegates getDictionary with its public signature unchanged", () => {
    expect(code).toMatch(
      /export function getDictionary\(locale: Locale, siteCode\?: string\): Dictionary \{\s*return compatibilityDictionaryAccess\.get\(locale, siteCode\);\s*\}/,
    );
  });

  it("no longer builds a registry or reaches the deployment authority / global configuration", () => {
    for (const forbidden of [
      "deployment-root",
      "deploymentPaths",
      "loadDictionaryRegistry",
      "loadSpokeDictionaryRegistry",
      'from "../loader"',
      "import { siteConfig }",
      "effectiveDictionaries",
      "dictionaryDirectory",
      "dictionaryOverrideDirectory",
      'from "node:fs"',
      "process.cwd()",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    // The F1 lock is applied INSIDE the capability at construction — never called again here.
    expect(code).not.toMatch(/assertBookingLabelPresent\s*\(/);
  });

  it("keeps the public surface: the shared invariant re-export and requireDictionarySection", () => {
    expect(code).toMatch(/export \{ assertBookingLabelPresent \} from "\.\/invariants";/);
    expect(code).toContain("export function requireDictionarySection");
    expect(code).toContain("type { Dictionary }");
  });

  it("leaves the invariant DEFINED exactly once under src/**", () => {
    const definers = sourceFiles(path.join(process.cwd(), "src"))
      .filter((file) => readFileSync(file, "utf8").includes("export function assertBookingLabelPresent("))
      .map(relative)
      .sort();
    expect(definers).toEqual(["src/config/i18n/invariants.ts"]);
  });
});

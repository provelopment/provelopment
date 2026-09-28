import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ww/en",
  useRouter: () => ({ push: () => {} }),
}));

/**
 * THE DEPLOYMENT-ROOT GUARD (FOUNDATION-DEPLOYMENT-ISO-B1)
 * ========================================================
 *
 * ISO-A1 found the SAME root-relative assumption written in four places, which is what made a
 * deployment change (adding a Site) require Foundation edits. `@/config/deployment-root` is now the
 * ONE authority, and this guard is what keeps it that way: a future change may not re-introduce a
 * deployment-owned path — or a bare `process.cwd()` — anywhere else in `src/**`.
 *
 * It is deliberately NARROW: it checks a short list of deployment-OWNED location literals (the
 * config file, the dictionary directory, the two authoring roots, the asset directories) and the
 * `process.cwd()` anchor itself. Platform concerns, comments and the authority's own file are not
 * policed.
 */
const ROOT = process.cwd();
const AUTHORITY = path.join(ROOT, "src", "config", "deployment-root.ts");

/** Every TypeScript/TSX file under `src/`, excluding the one authority. */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** The CODE lines of a file: comment lines are ignored (they may legitimately name these paths). */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    });
}

describe("deployment-owned paths are spelled in ONE place", () => {
  const files = sourceFiles(path.join(ROOT, "src")).filter((file) => file !== AUTHORITY);

  /** The deployment-owned location fragments, in the shape code would spell them. */
  const FORBIDDEN = [
    { label: "the root site config import", matcher: /from\s+["'][^"']*site\.config\.json["']/ },
    { label: "the dictionary directory", matcher: /["']config["']\s*,\s*["']i18n["']/ },
    { label: "the markdown authoring root", matcher: /["']content["']\s*,\s*["']pages["']\s*,\s*["']markdown["']/ },
    { label: "the JSON authoring root", matcher: /["']content["']\s*,\s*["']pages["']\s*,\s*["']json["']/ },
    { label: "the asset directories", matcher: /["']content["']\s*,\s*["']assets["']|["']public["']\s*,\s*["']assets["']/ },
  ];

  for (const { label, matcher } of FORBIDDEN) {
    it(`no module outside the authority builds ${label} itself`, () => {
      const offenders = files.filter((file) => codeLines(file).some((line) => matcher.test(line)));
      expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
    });
  }

  it("no module outside the authority anchors on process.cwd()", () => {
    const offenders = files.filter((file) =>
      codeLines(file).some((line) => line.includes("process.cwd()")),
    );
    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("every consumer resolves its deployment-owned location through the authority", () => {
    for (const consumer of [
      ["src", "config", "loader.ts"],
      ["src", "config", "i18n", "index.ts"],
      ["src", "adapters", "content", "authoring-source-discovery.ts"],
      ["src", "config", "assets.ts"],
    ] as const) {
      const source = readFileSync(path.join(ROOT, ...consumer), "utf8");
      expect(source, consumer.join("/")).toMatch(/deployment-root/);
      expect(source, consumer.join("/")).toMatch(/deploymentPaths\(\)|readDeploymentConfig\(\)/);
    }
  });

  it("keeps the authority CLIENT-SAFE: no node:fs and no process.cwd() at module load", () => {
    const source = readFileSync(AUTHORITY, "utf8");
    // `siteConfig` is imported by client components, so the authority's module-load code must not
    // pull a filesystem import (Turbopack refuses a client chunk with `node:fs`) and must not call
    // `process.cwd()` (absent in a browser). Both are only legal inside the SERVER-ONLY
    // `deploymentPaths()` body.
    const moduleScope = source
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
    expect(moduleScope.join("\n").includes('from "node:fs"')).toBe(false);
    const pathsBody = source.slice(source.indexOf("export function deploymentPaths()"));
    const outsidePaths = moduleScope.join("\n").split("export function deploymentPaths()")[0];
    expect(outsidePaths.includes("process.cwd()")).toBe(false);
    expect(pathsBody.includes("process.cwd()")).toBe(true);
  });
});

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveDeploymentForBuild } from "@/config/deployment-build";
import { deploymentPaths } from "@/config/deployment-root";

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
/**
 * The BUILD/CONFIG-harness module. It is the one other file that may anchor on `process.cwd()` and
 * read a deployment's configuration, because it runs at build/configuration time in Node — and
 * `next.config.ts` plus `vitest.config.mts` are its ONLY importers (asserted below), so no client
 * chunk and no application module can reach it.
 */
const BUILD_HARNESS = path.join(ROOT, "src", "config", "deployment-build.ts");

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
  const files = sourceFiles(path.join(ROOT, "src")).filter(
    (file) => file !== AUTHORITY && file !== BUILD_HARNESS,
  );

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

  it("has NO compile-time dependency on a root site.config.json (ISO-B1C)", () => {
    // The regression this guards: ISO-B1 resolved the repository layout through
    // `import bundledRepositorySiteConfig from "../../site.config.json"`, so deleting or moving that
    // file broke module resolution everywhere (tsc TS2307, Turbopack "Module not found"). The
    // deployment is now selected by the BUILD and inlined, so no application module imports a
    // deployment configuration file at all.
    const importers = sourceFiles(path.join(ROOT, "src")).filter((file) =>
      codeLines(file).some((line) => /from\s+["'][^"']*site\.config\.json["']/.test(line)),
    );
    expect(importers.map((file) => path.relative(ROOT, file))).toEqual([]);
    // …and the authority's CODE lines never IMPORT one (it does name the SELECTED deployment's file
    // when it publishes `siteConfigFile`, which is data, not a compile-time dependency).
    expect(codeLines(AUTHORITY).join("\n")).not.toMatch(/^\s*import[^\n]*site\.config\.json/m);
  });

  it("lets nothing outside the build harness READ a deployment configuration file", () => {
    const readers = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => file !== BUILD_HARNESS)
      .filter((file) =>
        codeLines(file).some((line) => /readFileSync\([^)]*site\.config\.json/.test(line)),
      );
    expect(readers.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("keeps the build harness out of the application: only the two config files import it", () => {
    const importers = sourceFiles(path.join(ROOT, "src"))
      .concat([path.join(ROOT, "next.config.ts"), path.join(ROOT, "vitest.config.mts")])
      .filter((file) =>
        codeLines(file).some((line) => /from\s+["'][^"']*deployment-build["']/.test(line)),
      );
    expect(importers.map((file) => path.relative(ROOT, file)).sort()).toEqual([
      "next.config.ts",
      "vitest.config.mts",
    ]);
  });
});

describe("the build selects exactly one deployment", () => {
  it("resolves the CURRENT repository layout when nothing else is selected", () => {
    const resolved = resolveDeploymentForBuild({}, ROOT);
    expect(resolved.layout).toBe("repository");
    expect(resolved.root).toBe(ROOT);
    expect(JSON.parse(resolved.config)).toEqual(JSON.parse(readFileSync(resolved.siteConfigFile, "utf8")));
    // The build's choice and the runtime authority agree: repository layout, the repository root,
    // and the deployment-owned locations exactly where they are today. Paths are published with
    // forward slashes (valid on every platform Node/Next support), so compare normalised.
    const paths = deploymentPaths();
    const normalise = (value: string) => value.replace(/\\/g, "/");
    expect(paths.layout).toBe("repository");
    expect(normalise(paths.root)).toBe(normalise(ROOT));
    expect(normalise(paths.dictionaryDirectory)).toBe(`${normalise(ROOT)}/config/i18n`);
    expect(normalise(paths.markdownPagesRoot)).toBe(`${normalise(ROOT)}/content/pages/markdown`);
  });

  it("resolves a CAPSULE at <repo>/deployment when one exists — with no root config involved", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-capsule-"));
    try {
      mkdirSync(path.join(root, "deployment"), { recursive: true });
      writeFileSync(
        path.join(root, "deployment", "site.config.json"),
        JSON.stringify({ capsule: true }),
        "utf8",
      );
      const resolved = resolveDeploymentForBuild({}, root);
      expect(resolved.layout).toBe("capsule");
      expect(resolved.root).toBe(path.join(root, "deployment"));
      expect(JSON.parse(resolved.config)).toEqual({ capsule: true });
      // …and the repository's own config is NOT required to exist for that build.
      expect(existsSync(path.join(root, "site.config.json"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves an OVERRIDE root, and fails LOUDLY when a selected deployment has no configuration", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-override-"));
    try {
      writeFileSync(path.join(root, "site.config.json"), JSON.stringify({ override: true }), "utf8");
      const resolved = resolveDeploymentForBuild({ FOUNDATION_DEPLOYMENT_ROOT: root }, ROOT);
      expect(resolved.layout).toBe("override");
      expect(JSON.parse(resolved.config)).toEqual({ override: true });

      expect(() =>
        resolveDeploymentForBuild({ FOUNDATION_DEPLOYMENT_ROOT: path.join(root, "absent") }, ROOT),
      ).toThrow(/no site\.config\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

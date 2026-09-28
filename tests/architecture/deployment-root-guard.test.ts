import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveDeploymentForBuild } from "@/config/deployment-build.mjs";
import { deploymentPaths } from "@/config/deployment-root";

import { syntheticDeploymentPaths } from "../support/synthetic-deployment";

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
 * read a deployment's configuration, because it runs at build/configuration time in Node — and it is
 * PLAIN ESM (FOUNDATION-DEPLOYMENT-ISO-H1C) so that all three of its runtimes — the build
 * (`next.config.ts`), the test run (`vitest.config.mts`) and the Foundation's Node tooling
 * (`scripts/sync-runtime-assets.mjs`) — consume the SAME authority with no TypeScript execution flag
 * and no loader or warning suppression. The assertion below covers the APPLICATION surface — `src/**`
 * — plus the two configuration files and expects exactly `next.config.ts` and `vitest.config.mts`
 * there, so no client chunk and no application module can reach it.
 */
const BUILD_HARNESS = path.join(ROOT, "src", "config", "deployment-build.mjs");

/**
 * Every module under `src/` this guard polices: TypeScript/TSX sources AND plain-ESM `.mjs` modules
 * — the build harness is one of the latter, so the scan surface must never depend on a file
 * extension (a `.mjs` deployment path would otherwise escape this guard).
 */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx") || full.endsWith(".mjs")) found.push(full);
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

  it("keeps the build harness out of the application, and on its approved boundaries", () => {
    // CLIENT SAFETY is the property that matters: the harness touches `node:fs`, so an application
    // module that imported it would drag a filesystem import into a client chunk.
    const importsHarness = (file: string) =>
      codeLines(file).some((line) => /from\s+["'][^"']*deployment-build[^"']*["']/.test(line));

    const applicationImporters = sourceFiles(path.join(ROOT, "src")).filter(importsHarness);
    expect(applicationImporters.map((file) => path.relative(ROOT, file))).toEqual([]);

    // Every other consumer is a NON-bundled boundary: the build (`next.config.ts`), the Foundation's
    // own Node tooling — the asset mirror AND the country-code reference generator (`scripts/**`,
    // ISO-H1C / ISO-B3A) — the browser harness, which must discover the SELECTED deployment's own
    // scenarios in whatever root that deployment owns (`tests/browser/matrix.mjs`, ISO-B3A), and the
    // test-context setup/support modules that select a deployment for the two Vitest projects
    // (ISO-H2). Nothing else may join the list — in particular not `vitest.config.mts`, which
    // deliberately resolves NO deployment: the generic suite must run in a repository where no real
    // deployment exists.
    const approved = [
      "next.config.ts",
      "scripts/generate-country-code-reference.mjs",
      "scripts/sync-runtime-assets.mjs",
      "tests/architecture/deployment-root-guard.test.ts",
      "tests/browser/matrix.mjs",
      "tests/setup/real-deployment.ts",
      "tests/support/synthetic-deployment-root.ts",
    ];
    const unapproved = sourceFiles(path.join(ROOT, "tests"))
      .concat(sourceFiles(path.join(ROOT, "scripts")), [path.join(ROOT, "next.config.ts")])
      .filter(importsHarness)
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .filter((file) => !approved.includes(file));
    expect(unapproved).toEqual([]);
  });
});

describe("the build selects exactly one deployment", () => {
  it("resolves the REPOSITORY layout for a repository that has no capsule (never 'this checkout')", () => {
    // ISO-H2 — this assertion used to pin the CURRENT checkout to the repository layout, which states
    // today's install rather than the architecture: a valid consumer repository may contain a capsule.
    // The rule is therefore exercised on a controlled temporary repository, where the expected answer
    // is unambiguous.
    const root = mkdtempSync(path.join(tmpdir(), "foundation-repository-layout-"));
    try {
      writeFileSync(
        path.join(root, "site.config.json"),
        JSON.stringify({ repository: true }),
        "utf8",
      );
      const resolved = resolveDeploymentForBuild({}, root);
      expect(resolved.layout).toBe("repository");
      expect(resolved.root).toBe(root);
      expect(resolved.siteConfigFile).toBe(path.join(root, "site.config.json"));
      expect(JSON.parse(resolved.config)).toEqual({ repository: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("publishes deployment-owned locations RELATIVE to the selected root, in every layout", () => {
    // The runtime authority derives its answer from the selection, never from a literal beside it, so
    // the same rule holds in the repository layout, in a capsule and under a test override.
    const paths = deploymentPaths();
    const normalise = (value: string) => value.replace(/\\/g, "/");
    expect(["repository", "capsule", "override"]).toContain(paths.layout);
    for (const location of [
      paths.siteConfigFile,
      paths.dictionaryDirectory,
      paths.dictionaryOverrideDirectory,
      paths.markdownPagesRoot,
      paths.jsonPagesRoot,
      paths.assetSourceRoot,
    ]) {
      expect(normalise(location).startsWith(normalise(paths.root)), location).toBe(true);
    }
    // …while the runtime mirror is the ONE platform-owned location and never follows a deployment.
    expect(normalise(paths.publicAssetsDirectory)).toBe(
      normalise(path.join(ROOT, "public", "assets")),
    );
  });

  it("gives the GENERIC test project a synthetic identity, never the installed deployment", () => {
    // ISO-H2 — the decisive isolation property, asserted where it is enforced: the generic project
    // selects the synthetic deployment before any test module loads
    // (`tests/setup/synthetic-deployment.ts`), so BOTH identity surfaces — the selected configuration
    // (`@/config`) and the filesystem identity (`deploymentPaths()`) — describe that deployment.
    const paths = deploymentPaths();
    const synthetic = syntheticDeploymentPaths();
    // Paths are published with forward slashes by the authority (valid on every platform Node/Next
    // support) while the support helper builds them with `path.join`, so compare normalised.
    const normalise = (value: string) => value.replace(/\\/g, "/");
    expect(paths.layout).toBe("override");
    expect(normalise(paths.root)).toBe(normalise(synthetic.root));
    expect(normalise(paths.siteConfigFile)).toBe(normalise(synthetic.siteConfigFile));
    expect(normalise(paths.dictionaryDirectory)).toBe(normalise(synthetic.dictionaryDirectory));
    expect(normalise(paths.markdownPagesRoot)).toBe(normalise(synthetic.markdownPagesRoot));
    expect(normalise(paths.jsonPagesRoot)).toBe(normalise(synthetic.jsonPagesRoot));
    expect(normalise(paths.assetSourceRoot)).toBe(normalise(synthetic.assetSourceRoot));
    // The synthetic root is a disposable temporary tree outside the checkout: a generic test may plant
    // and remove fixtures freely without touching any committed deployment.
    expect(paths.root.startsWith(ROOT + path.sep)).toBe(false);
    expect(existsSync(path.join(paths.root, "site.config.json"))).toBe(true);
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

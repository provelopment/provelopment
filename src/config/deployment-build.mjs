/**
 * THE DEPLOYMENT THE BUILD SELECTS (FOUNDATION-DEPLOYMENT-ISO-B1C)
 * ===============================================================
 *
 * Build/config-harness ONLY. `next.config.ts` and `vitest.config.mts` import this module; NO
 * application module may (the guard in `tests/architecture/deployment-root-guard.test.ts` proves it),
 * because it touches `node:fs` and would drag a filesystem import into a client chunk.
 *
 * It is deliberately the ONE place that answers "which deployment is this build for?" — and the
 * answer is then INLINED (`next.config.ts` → Next's `env`; `vitest.config.mts` → `test.env`) so that:
 *
 *   · `@/config/deployment-root` stays pure and client-safe (no `node:fs`, no `process.cwd()`);
 *   · the loader validates an already-selected configuration rather than reaching for a file;
 *   · and NO application module statically imports `<repo>/site.config.json`, so moving the
 *     deployment into a capsule (B2) cannot break module or build resolution.
 *
 * ISO-B1 resolved repository mode through a static `import` of the root config. That was a
 * compile-time dependency on the file's physical location: with the root `site.config.json` absent,
 * `tsc` failed with TS2307 and Turbopack with "Module not found". This module removes it — the root
 * config is now read HERE, at configuration time, like the capsule's.
 *
 * PLAIN ESM ON PURPOSE — ONE MODULE, THREE RUNTIMES (FOUNDATION-DEPLOYMENT-ISO-H1C)
 * ------------------------------------------------------------------------------
 * The authority is consumed by the build (`next.config.ts`), the test run (`vitest.config.mts`) and
 * the Foundation's own Node tooling (`scripts/sync-runtime-assets.mjs`), and only two of those three
 * run through a TypeScript compiler. A plain `.mjs` module is therefore the smallest stable boundary:
 *
 *   · Node executes it directly — no `--experimental-strip-types`, no loader or warning suppression;
 *   · Next and Vite import it like any other ES module (both already consume ESM);
 *   · TypeScript still sees the whole contract below, because the JSDoc types are part of the file
 *     and `tsc --noEmit` checks every call site (`next.config.ts`, `vitest.config.mts`, the guard).
 *
 * Its sibling `deployment-root.ts` stays TypeScript: that one IS compiled into application bundles and
 * is what the JSDoc `DeploymentLayout` below references — a type-only reference, erased at runtime.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The layouts a build may select. Type-only reference to the client-safe authority's union.
 * @typedef {import("./deployment-root").DeploymentLayout} DeploymentLayout
 */

/**
 * The deployment a build resolved.
 * @typedef {object} ResolvedDeployment
 * @property {DeploymentLayout} layout the layout the build selected
 * @property {string} root the directory that owns the deployment: the capsule, the override root, or the repository
 * @property {string} siteConfigFile `<root>/site.config.json`
 * @property {string} config the deployment's raw configuration TEXT, ready to inline into the build
 */

/** The environment names the build inlines for runtime code (`./deployment-root`). */
export const DEPLOYMENT_LAYOUT_ENV = "FOUNDATION_DEPLOYMENT_LAYOUT";
export const DEPLOYMENT_CONFIG_ENV = "FOUNDATION_DEPLOYMENT_CONFIG";
export const DEPLOYMENT_ROOT_ENV = "FOUNDATION_DEPLOYMENT_ROOT";

/**
 * Resolves the deployment this build serves.
 *
 *   capsule     `<repo>/deployment/site.config.json` exists → the capsule owns the deployment
 *   override    `FOUNDATION_DEPLOYMENT_ROOT` is set (dev/test) → that directory owns it
 *   repository  otherwise → `<repo>` itself, the CURRENT layout
 *
 * A missing configuration is a LOUD failure: the build must never silently fall back to a different
 * deployment than the one selected.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the build reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {ResolvedDeployment}
 */
export function resolveDeploymentForBuild(environment = process.env, repositoryRoot = process.cwd()) {
  const override = environment[DEPLOYMENT_ROOT_ENV]?.trim();
  const capsuleRoot = path.join(repositoryRoot, "deployment");
  /** @type {DeploymentLayout} */
  const layout =
    override !== undefined && override !== ""
      ? "override"
      : existsSync(path.join(capsuleRoot, "site.config.json"))
        ? "capsule"
        : "repository";

  const root =
    layout === "override"
      ? path.isAbsolute(override)
        ? override
        : path.resolve(repositoryRoot, override)
      : layout === "capsule"
        ? capsuleRoot
        : repositoryRoot;

  const siteConfigFile = path.join(root, "site.config.json");
  if (!existsSync(siteConfigFile)) {
    throw new Error(
      `FOUNDATION-DEPLOYMENT-ISO-B1C: the ${layout} deployment root "${root}" has no ` +
        `site.config.json. A build must resolve exactly one deployment; nothing falls back silently.`,
    );
  }

  return { layout, root, siteConfigFile, config: readFileSync(siteConfigFile, "utf8") };
}

/**
 * The `env`/`test.env` pairs that carry the selected deployment into the build and its tests.
 *
 * @param {ResolvedDeployment} resolved the resolved deployment
 * @returns {Record<string, string>}
 */
export function deploymentEnvironment(resolved) {
  return {
    [DEPLOYMENT_LAYOUT_ENV]: resolved.layout,
    [DEPLOYMENT_CONFIG_ENV]: resolved.config,
  };
}

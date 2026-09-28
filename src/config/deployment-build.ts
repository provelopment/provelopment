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
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { DeploymentLayout } from "./deployment-root";

export interface ResolvedDeployment {
  readonly layout: DeploymentLayout;
  /** The directory that owns the deployment: the capsule, the override root, or the repository. */
  readonly root: string;
  readonly siteConfigFile: string;
  /** The deployment's raw configuration TEXT, ready to inline into the build. */
  readonly config: string;
}

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
 */
export function resolveDeploymentForBuild(
  environment: Record<string, string | undefined> = process.env,
  repositoryRoot: string = process.cwd(),
): ResolvedDeployment {
  const override = environment[DEPLOYMENT_ROOT_ENV]?.trim();
  const capsuleRoot = path.join(repositoryRoot, "deployment");
  const layout: DeploymentLayout =
    override !== undefined && override !== ""
      ? "override"
      : existsSync(path.join(capsuleRoot, "site.config.json"))
        ? "capsule"
        : "repository";

  const root =
    layout === "override"
      ? path.isAbsolute(override as string)
        ? (override as string)
        : path.resolve(repositoryRoot, override as string)
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

/** The `env`/`test.env` pairs that carry the selected deployment into the build and its tests. */
export function deploymentEnvironment(resolved: ResolvedDeployment): Record<string, string> {
  return {
    [DEPLOYMENT_LAYOUT_ENV]: resolved.layout,
    [DEPLOYMENT_CONFIG_ENV]: resolved.config,
  };
}

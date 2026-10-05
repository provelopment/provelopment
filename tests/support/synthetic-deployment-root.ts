/**
 * THE SYNTHETIC DEPLOYMENT'S FILESYSTEM IDENTITY (FOUNDATION-DEPLOYMENT-ISO-H2)
 * ===========================================================================
 *
 * FILESYSTEM ONLY, on purpose. This module may be imported BEFORE a deployment is selected — the
 * generic test project's setup file (`tests/setup/synthetic-deployment.ts`) does exactly that — so it
 * must not transitively load the config surface (`@/config` reads the SELECTED deployment's
 * configuration at module load, and there is none yet at that moment).
 *
 * What lives here:
 *   · the committed fixture's location (`tests/fixtures/synthetic-deployment/**`, the test-only
 *     deployment: a Global site, a country site, two locales, two locations, a handful of pages,
 *     two dictionaries, a minimal asset tree and the authoring documentation a generic contract needs);
 *   · a DISPOSABLE temporary copy of it, created at most once per TEST-FILE CONTEXT, so a generic test
 *     may read and WRITE deployment-owned state without touching any committed file — and is REMOVED by
 *     that context's teardown (`cleanupSyntheticDeployment()`), because the copy belongs to exactly one
 *     test-file context. Removal is deliberately NOT left to a `process.on("exit")` hook: a Vitest worker
 *     is terminated without running one, so the hook never fired and every executed generic test file left
 *     a full deployment copy in OS temp, per run (ISO-B3C2B-A1).
 *   · `syntheticDeploymentPaths()` in the exact shape `@/config/deployment-root` publishes, for the
 *     few suites that assert the authority's answer;
 *   · `selectSyntheticDeployment()` — the one call that makes the synthetic deployment THE deployment
 *     of this test process, through the override selection the authority already documents.
 *
 * The configuration OBJECT (`syntheticSiteConfig`) and the `selectSyntheticDeployment()` convenience
 * re-export live in `./synthetic-deployment`, which may safely import the config surface because by
 * then the selection has happened.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEPLOYMENT_CONFIG_ENV,
  DEPLOYMENT_LAYOUT_ENV,
  DEPLOYMENT_ROOT_ENV,
} from "@/config/deployment-build.mjs";

/** The committed fixture tree — the SOURCE of every disposable copy, and never written to. */
export const SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "synthetic-deployment",
);

/** The fixture's raw configuration file, as committed. */
export const syntheticDeploymentConfigFile = path.join(
  SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT,
  "site.config.json",
);

export interface SyntheticDeployment {
  /** The absolute deployment root to hand to `FOUNDATION_DEPLOYMENT_ROOT`. */
  readonly root: string;
  /** Deletes THIS copy's temporary tree. Exact and idempotent: safe to call more than once. */
  cleanup(): void;
}

/** The fixture's configuration TEXT — the raw bytes a build would inline for this deployment. */
export function syntheticDeploymentConfigText(): string {
  return readFileSync(syntheticDeploymentConfigFile, "utf8");
}

/** True when the committed fixture is present (a guard for suites that depend on it). */
export function syntheticDeploymentFixtureExists(): boolean {
  return existsSync(syntheticDeploymentConfigFile);
}

/**
 * Copies the fixture deployment into a fresh temporary directory and returns it. The temporary tree is
 * the only thing a generic test may mutate: `site.config.json`, dictionaries, pages and asset sources
 * inside it are copies.
 */
export function materializeSyntheticDeployment(): SyntheticDeployment {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-synthetic-deployment-"));
  cpSync(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT, root, { recursive: true });
  return {
    root,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * The disposable copy of THIS test-file context (created on first use, removed by
 * `cleanupSyntheticDeployment()` — never by a process-exit hook, which a Vitest worker never runs).
 */
let writable: SyntheticDeployment | null = null;

export function syntheticWritableDeployment(): SyntheticDeployment {
  if (writable === null) {
    writable = materializeSyntheticDeployment();
    // No exit hook, and no other second owner: the teardown below removes exactly this root
    // (ISO-B3C2B-A1 — see `cleanupSyntheticDeployment()`).
  }
  return writable;
}

/**
 * REMOVES the copy this test-file context created, and nothing else (ISO-B3C2B-A1).
 *
 * OWNERSHIP IS EXACT. The one root `materializeSyntheticDeployment()` handed to this context is removed;
 * OS temp is never searched, globbed or swept, so a historical copy, another checkout's copy, or a copy
 * belonging to a run happening in parallel is not this function's — or this run's — property.
 *
 * Idempotent, and safe when this context owns nothing (returns `false`): the generic project's setup file
 * registers exactly this call as that file's teardown, and a teardown must run once per test file whatever
 * the file did. The copy is materialised lazily, so a later `syntheticWritableDeployment()` simply creates
 * a fresh one — the context stays usable after its own teardown has run.
 *
 * A failure to remove is NOT swallowed: residue must fail a run visibly rather than accumulate quietly in
 * OS temp, which is exactly the failure this lifecycle replaces.
 *
 * @returns whether a copy was removed.
 */
export function cleanupSyntheticDeployment(): boolean {
  if (writable === null) return false;
  const owned = writable;
  writable = null;
  owned.cleanup();
  return true;
}

/**
 * The synthetic deployment's paths in the shape `@/config/deployment-root` publishes.
 *
 * `publicAssetsDirectory` deliberately keeps the PLATFORM path: Next.js serves static files from
 * `public/` only, so the generated runtime mirror is a platform fact, not a deployment location.
 */
export function syntheticDeploymentPaths(root: string = syntheticWritableDeployment().root): {
  layout: "override";
  root: string;
  siteConfigFile: string;
  dictionaryDirectory: string;
  dictionaryOverrideDirectory: string;
  markdownPagesRoot: string;
  jsonPagesRoot: string;
  assetSourceRoot: string;
  /** FOUNDATION-B4A — the deployment's own operational record, in the shape the authority publishes. */
  operationalStateFile: string;
  publicAssetsDirectory: string;
} {
  const repositoryRoot = process.cwd();
  return {
    layout: "override",
    root,
    siteConfigFile: path.join(root, "site.config.json"),
    dictionaryDirectory: path.join(root, "config", "i18n"),
    dictionaryOverrideDirectory: path.join(root, "config", "i18n", "sites"),
    markdownPagesRoot: path.join(root, "content", "pages", "markdown"),
    jsonPagesRoot: path.join(root, "content", "pages", "json"),
    assetSourceRoot: path.join(root, "content", "assets"),
    operationalStateFile: path.join(root, "operational-state.json"),
    publicAssetsDirectory: path.join(repositoryRoot, "public", "assets"),
  };
}

/**
 * Makes the synthetic deployment the deployment of THIS test process, through the authority's own
 * test-only selection (`FOUNDATION_DEPLOYMENT_ROOT` + the `override` layout + the inlined
 * configuration). Called once, from the generic project's setup file, before any test module is
 * imported.
 */
export function selectSyntheticDeployment(): SyntheticDeployment {
  const deployment = syntheticWritableDeployment();
  process.env[DEPLOYMENT_ROOT_ENV] = deployment.root;
  process.env[DEPLOYMENT_LAYOUT_ENV] = "override";
  process.env[DEPLOYMENT_CONFIG_ENV] = syntheticDeploymentConfigText();
  return deployment;
}

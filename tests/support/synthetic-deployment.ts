/**
 * THE SYNTHETIC TEST DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B1)
 * ===========================================================
 *
 * A small, DETERMINISTIC, test-only deployment: one Global site plus one country site, two
 * locales, two locations, a handful of pages and two dictionaries. It exists so generic Foundation
 * contracts can be proved without reading — or writing — whatever the live reference deployment
 * happens to be configured as.
 *
 * It is NOT a second production configuration: nothing in `src/**` reads it, it is never deployed,
 * and its identity is unmistakably synthetic (`synthetic.example.test`, "Synthetic Deployment").
 *
 * TWO SURFACES
 * ------------
 *   `syntheticSiteConfig`          the validated config object generic UNIT tests compose against
 *                                  (installed globally by `tests/setup/synthetic-config.ts`).
 *   `materializeSyntheticDeployment()`  a TEMP-DIRECTORY copy of the fixture tree, for anything that
 *                                  needs real files: the generic BROWSER scenarios point a dev
 *                                  server at it through `FOUNDATION_DEPLOYMENT_ROOT`, so they no
 *                                  longer rewrite the real `site.config.json` or plant fixtures in
 *                                  the real content tree, and the temp tree is deleted afterwards.
 *
 * The fixture tree is copied FROM and never written back TO the committed fixture, so repeated runs
 * cannot drift it.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseSiteConfig } from "@/config/loader";

const FIXTURE_ROOT = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

/** The fixture's raw configuration, as committed. */
export const syntheticDeploymentConfigFile = path.join(FIXTURE_ROOT, "site.config.json");

/** The validated synthetic deployment, for unit tests that compose components. */
export const syntheticSiteConfig = parseSiteConfig(readFixtureConfig());

function readFixtureConfig(): unknown {
  // Read through the platform's own JSON loader rules (no caching: tests may inspect it directly).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return JSON.parse(readFileSync(syntheticDeploymentConfigFile, "utf8")) as unknown;
}

export interface SyntheticDeployment {
  /** The absolute deployment root to hand to `FOUNDATION_DEPLOYMENT_ROOT`. */
  readonly root: string;
  /** Deletes the temporary tree (call it in a `finally`). */
  cleanup(): void;
}

/**
 * A DISPOSABLE copy of the fixture, created at most once per test process and deleted when the
 * process exits. Using it is what lets a generic test read and WRITE deployment-owned state (pages,
 * dictionaries, config) without ever touching the repository's own deployment — including the
 * committed fixture, which is only ever the SOURCE of the copy.
 */
let writable: SyntheticDeployment | null = null;

export function syntheticWritableDeployment(): SyntheticDeployment {
  if (writable === null) {
    writable = materializeSyntheticDeployment();
    const created = writable;
    process.on("exit", () => created.cleanup());
  }
  return writable;
}

/**
 * The synthetic deployment's paths in the shape `@/config/deployment-root` publishes, so a test can
 * install it as the authority:
 *
 *     vi.mock("@/config/deployment-root", async (importOriginal) => {
 *       const actual = await importOriginal<typeof import("@/config/deployment-root")>();
 *       const { syntheticDeploymentPaths } = await import("../support/synthetic-deployment");
 *       return {
 *         ...actual,
 *         deploymentLayout: () => "override" as const,
 *         deploymentPaths: () => syntheticDeploymentPaths(),
 *       };
 *     });
 *
 * `publicAssetsDirectory` deliberately keeps the PLATFORM path: Next serves static files from
 * `public/` only, so asset availability is a platform fact, not a deployment location.
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
    publicAssetsDirectory: path.join(repositoryRoot, "public", "assets"),
  };
}

/**
 * Copies the fixture deployment into a fresh temporary directory and returns its root. The
 * temporary tree is the only thing a generic test may mutate: `site.config.json`, dictionaries and
 * pages inside it are copies.
 */
export function materializeSyntheticDeployment(): SyntheticDeployment {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-synthetic-deployment-"));
  cpSync(FIXTURE_ROOT, root, { recursive: true });
  return {
    root,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** True when the committed fixture is present (a guard for suites that depend on it). */
export function syntheticDeploymentFixtureExists(): boolean {
  return existsSync(syntheticDeploymentConfigFile);
}

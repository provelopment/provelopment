/**
 * A DISPOSABLE COPY OF THE SELECTED DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 * =============================================================================
 *
 * An AUTHORING experiment — planting a page, adding a dictionary, editing a configuration — must have
 * somewhere to write, and a deployment's shipped config, dictionaries, pages and artwork are not it.
 * This is the one way a deployment-scope test gets writable deployment state:
 *
 *     copy the deployment the AUTHORITY selected into OS temp, then SELECT THE COPY through the
 *     authority's own test-only override (`FOUNDATION_DEPLOYMENT_ROOT` + the `override` layout).
 *
 * No second path seam is invented: the copy is selected exactly the way `tests/setup/synthetic-deployment.ts`
 * selects the synthetic deployment (ISO-H2), so `@/config` and `@/config/deployment-root` describe the copy
 * — and because the copy is byte-identical, an acceptance assertion made against it means what it says
 * about the real deployment (the fidelity check below refuses a copy that is not).
 *
 * CALL IT BEFORE IMPORTING ANYTHING THAT READS THE CONFIG SURFACE. `@/config` and `@/config/deployment-root`
 * read the selection at module load and cache it, so a test file that already imported them (or whose setup
 * file did) must `vi.resetModules()` and DYNAMICALLY import the app modules afterwards — see
 * `deployment/tests/integration/page-authoring.test.ts`, which does exactly that.
 *
 * It lives in the Foundation's own test support (`tests/support/**`) rather than inside the deployment: the
 * copy mechanism is platform test infrastructure, not deployment content, and both trees may use it.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEPLOYMENT_CONFIG_ENV,
  DEPLOYMENT_LAYOUT_ENV,
  DEPLOYMENT_ROOT_ENV,
  resolveDeploymentForBuild,
} from "../../src/config/deployment-build.mjs";

import { captureProductionStateManifest, productionStateDrift } from "./production-state-manifest";

/** The surfaces a copy must reproduce byte-for-byte for an authoring experiment to mean anything. */
const FIDELITY_SURFACES = ["site.config.json", "config", "content/pages", "content/assets"] as const;

export interface DisposableDeployment {
  /** The temporary root to hand to `FOUNDATION_DEPLOYMENT_ROOT`. */
  readonly root: string;
  /** The deployment this copy was taken from — the real selected one, never written to. */
  readonly sourceRoot: string;
  /** Deletes the temporary copy (call it in a `finally`/`afterAll`). */
  cleanup(): void;
}

/**
 * Copies the SELECTED deployment into a fresh temporary root and makes the copy THIS process's
 * deployment. Returns the copy; throws — loudly, before anything else — when the copy is not faithful,
 * because a silently different copy would make every assertion made against it meaningless.
 */
export function selectDisposableDeploymentCopy(): DisposableDeployment {
  const source = resolveDeploymentForBuild(process.env, process.cwd());
  const root = mkdtempSync(path.join(tmpdir(), "foundation-deployment-authoring-"));
  cpSync(source.root, root, { recursive: true });

  const fidelity = productionStateDrift(
    captureProductionStateManifest(source.root, FIDELITY_SURFACES),
    captureProductionStateManifest(root, FIDELITY_SURFACES),
  );
  if (fidelity.length > 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      "FOUNDATION-DEPLOYMENT-ISO-B3C2B: the disposable copy of the selected deployment does not " +
        `reproduce its authored state byte-for-byte, so it cannot stand in for it. Difference:\n  ` +
        fidelity.join("\n  "),
    );
  }

  process.env[DEPLOYMENT_ROOT_ENV] = root;
  process.env[DEPLOYMENT_LAYOUT_ENV] = "override";
  process.env[DEPLOYMENT_CONFIG_ENV] = readFileSync(source.siteConfigFile, "utf8");

  // LOUD, both ways: the authority must now answer with the copy, and the copy must not BE the source —
  // a writable test that silently kept writing to the real deployment is the defect this exists to end.
  const selected = resolveDeploymentForBuild(process.env, process.cwd());
  if (
    selected.layout !== "override" ||
    path.resolve(selected.root) !== path.resolve(root) ||
    path.resolve(root) === path.resolve(source.root)
  ) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      "FOUNDATION-DEPLOYMENT-ISO-B3C2B: the disposable deployment copy was not selected " +
        `(got "${selected.layout}" at "${selected.root}", expected the override root "${root}").`,
    );
  }

  return {
    root,
    sourceRoot: source.root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

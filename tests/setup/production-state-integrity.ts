import { resolveDeploymentForBuild } from "../../src/config/deployment-build.mjs";
import {
  captureProductionStateManifest,
  productionStateDrift,
} from "../support/production-state-manifest";

/**
 * A TEST RUN MAY NOT LEAVE A MUTATION BEHIND (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 * ===========================================================================
 *
 * The write-domain rules (which module may write which domain, and the sanctioned-writer allowlist) are
 * asserted by `tests/architecture/write-ownership-guard.test.ts`. This file proves the OUTCOME those
 * rules exist for: whatever a project's tests do, the REAL deployment's authored production state —
 * `site.config.json`, `config/**`, `content/pages/**`, `content/assets/**` and the generated
 * `content/COUNTRY-CODES.md` — is byte-identical before and after the run.
 *
 * It is a Vitest GLOBAL SETUP, wired to BOTH projects (`vitest.config.mts`), so the proof brackets the
 * whole project rather than one file:
 *
 *   foundation   the generic suite must not reach this repository's deployment at all — it runs against
 *                a synthetic, disposable one (ISO-H2). The proof is that the real one is untouched.
 *   deployment   the acceptance suite reads the real deployment; a test that needs WRITABLE deployment
 *                state takes a disposable copy of it (`deployment/tests/support/disposable-deployment`),
 *                so the shipped tree must still be untouched afterwards.
 *
 * A run that leaves drift behind FAILS with the exact paths and the direction of each change. That is the
 * postcondition the deployment suite can no longer satisfy by cleaning up successfully (ISO-C1: cleanup
 * is best-effort; this is not).
 *
 * NOTHING IS SNAPSHOT-BASED: the manifest is taken at runtime, so no asset hash is ever committed, and a
 * repository with no deployment installed simply has nothing to protect.
 */
/**
 * Vitest's `globalSetup` contract: the default export runs BEFORE the project's tests, and whatever
 * FUNCTION it returns runs AFTER them. The project is passed in, so the diagnostics name the project
 * even though one module serves both.
 */
interface GlobalSetupProject {
  readonly name?: string;
  readonly project?: { readonly name?: string };
}

/** The deployment the BUILD would select for this repository, or `null` when none is installed. */
function installedDeployment(): { layout: string; root: string } | null {
  try {
    const { layout, root } = resolveDeploymentForBuild(process.env, process.cwd());
    return { layout, root };
  } catch {
    // No deployment is installed in this repository: there is no production state to protect, and the
    // project under test is free to be the only identity that exists (ISO-H2's stripped-checkout case).
    return null;
  }
}

export default function productionStateIntegrity(project: GlobalSetupProject = {}) {
  const label = project.name ?? project.project?.name ?? "project";
  const deployment = installedDeployment();

  if (deployment === null) {
    console.log(
      `[write-ownership] ${label}: no deployment is installed in this repository — there is no ` +
        "authored production state to protect.",
    );
    return function teardown(): void {};
  }

  const before = captureProductionStateManifest(deployment.root);
  console.log(
    `[write-ownership] ${label}: protecting ${before.size} authored file(s) of the ` +
      `${deployment.layout} deployment at ${deployment.root}`,
  );

  return function teardown(): void {
    const after = captureProductionStateManifest(deployment.root);
    const drift = productionStateDrift(before, after);
    if (drift.length === 0) {
      console.log(
        `[write-ownership] ${label}: the deployment's authored production state is unchanged ` +
          `(${after.size} file(s) verified).`,
      );
      return;
    }
    const message =
      `FOUNDATION-DEPLOYMENT-ISO-B3C2B: the ${label} test run MUTATED the deployment's authored ` +
      `production state at ${deployment.root}. Executable repository code may not use shipped ` +
      "configuration, dictionaries, pages or artwork as fixture storage; a test that needs writable " +
      "deployment state must take a disposable copy of the selected deployment instead " +
      `(tests/support/disposable-deployment.ts). Drift:\n  ${drift.join("\n  ")}`;
    console.error(message);
    process.exitCode = 1;
    throw new Error(message);
  };
}

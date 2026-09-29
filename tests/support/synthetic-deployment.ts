/**
 * THE SYNTHETIC TEST DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B1, ISO-H2)
 * ===================================================================
 *
 * A small, DETERMINISTIC, test-only deployment: one Global site plus one country site, two locales,
 * two locations, a handful of pages, two dictionaries, a minimal asset tree and the authoring
 * documentation the generic contracts read. It exists so generic Foundation contracts can be proved
 * without reading — or writing — whatever real deployment happens to be installed.
 *
 * It is NOT a second production configuration: nothing in `src/**` reads it, it is never deployed, and
 * its identity is unmistakably synthetic (`synthetic.example.test`, "Synthetic Deployment").
 *
 * WHERE THE IDENTITY COMES FROM (ISO-H2)
 * --------------------------------------
 * The synthetic deployment is not injected into individual tests. The `foundation` Vitest project
 * SELECTS it as this process's deployment (`tests/setup/synthetic-deployment.ts` →
 * `selectSyntheticDeployment()`), so BOTH surfaces describe it:
 *
 *   `siteConfig` (via `@/config`)                the synthetic configuration, because the synthetic
 *                                                deployment is the selected one — no mock involved;
 *   `deploymentPaths()` (`@/config/deployment-root`)  the synthetic filesystem identity.
 *
 * `syntheticSiteConfig` below is the same configuration as a value, for a test that wants to name it
 * explicitly. The fixture tree and the disposable-copy helpers live in
 * `./synthetic-deployment-root` (filesystem-only, safe to import before the selection happens).
 *
 * The fixture tree is copied FROM and never written back TO the committed fixture, so repeated runs
 * cannot drift it.
 *
 * The copy belongs to ONE test-file context and is removed by that context's teardown
 * (`cleanupSyntheticDeployment()`, registered by the generic project's setup file), so a run leaves no
 * deployment copy behind in OS temp (ISO-B3C2B-A1).
 */
export {
  SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT,
  cleanupSyntheticDeployment,
  materializeSyntheticDeployment,
  selectSyntheticDeployment,
  syntheticDeploymentConfigFile,
  syntheticDeploymentConfigText,
  syntheticDeploymentFixtureExists,
  syntheticDeploymentPaths,
  syntheticWritableDeployment,
  type SyntheticDeployment,
} from "./synthetic-deployment-root";

import { parseSiteConfig } from "@/config/loader";

import { syntheticDeploymentConfigText } from "./synthetic-deployment-root";

/** The validated synthetic deployment, for unit tests that compose components. */
export const syntheticSiteConfig = parseSiteConfig(JSON.parse(syntheticDeploymentConfigText()));


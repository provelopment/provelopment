/**
 * GENERIC TESTS COMPOSE AGAINST A SYNTHETIC DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B1)
 * ================================================================================
 *
 * Every test in the generic tree gets the SYNTHETIC deployment's configuration by default, so a
 * generic contract can no longer break because the live reference deployment changed (ISO-A1: the
 * same `@/config` import made 34 files depend on — and mutate — the reference deployment).
 *
 * A test that asserts the SHIPPED deployment's own configuration opts out with one line:
 *
 *     vi.unmock("@/config");   // DEPLOYMENT SCOPE
 *
 * Deployment-scope tests live in the deployment's capsule (`deployment/tests/**`) — since
 * FOUNDATION-DEPLOYMENT-ISO-B2A that is where they belong, and they read the deployment's files
 * through `@/config/deployment-root`. The marker here is what keeps a generic test honest: a test in
 * `tests/**` has no business asserting the live deployment, so its expectations stay synthetic.
 */
import { vi } from "vitest";

import { syntheticSiteConfig } from "../support/synthetic-deployment";

// Only `siteConfig` is substituted: every other export of `@/config` (the loader, the merge rule,
// the schema-facing helpers) stays the platform module, so a mock can never quietly remove a real
// API from the test surface.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return { ...actual, siteConfig: syntheticSiteConfig };
});

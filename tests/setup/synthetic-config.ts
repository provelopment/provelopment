/**
 * GENERIC TESTS COMPOSE AGAINST A SYNTHETIC DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B1)
 * ================================================================================
 *
 * Every test in the generic tree gets the SYNTHETIC deployment's configuration by default, so a
 * generic contract can no longer break because the live reference deployment changed (ISO-A1: the
 * same `@/config` import made 34 files depend on — and mutate — the reference deployment).
 *
 * A test that genuinely asserts the SHIPPED reference deployment opts out with one line:
 *
 *     vi.unmock("@/config");   // DEPLOYMENT SCOPE (B2): asserts the reference deployment
 *
 * That marker is deliberate: it is how deployment-scope tests stay identifiable while they still
 * live in the platform tree, and it is the list B2 moves into `deployment/tests/**`.
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

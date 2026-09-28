import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * TWO TEST IDENTITIES, ONE AUTHORITY (FOUNDATION-DEPLOYMENT-ISO-H2)
 * ===============================================================
 *
 * There are exactly two kinds of test in this repository, and they need DIFFERENT deployments:
 *
 *   `foundation`   the generic Foundation contract suite (`tests/**`). Its identity is
 *                  `Foundation code + a SYNTHETIC, test-owned deployment`. It must be provable with
 *                  NO real deployment in the repository at all — no root `site.config.json`, no
 *                  `config/i18n/**`, no `content/**`, no capsule — because a platform contract may
 *                  never depend on whichever deployment happens to be installed.
 *
 *   `deployment`   the acceptance suite of whichever deployment is installed
 *                  (`deployment/tests/**`, the capsule's own test workspace from ISO-B2A). Its
 *                  identity is `Foundation code + the REAL selected deployment`, and it must keep
 *                  seeing that deployment after the deployment physically moves into its capsule.
 *
 * Each project installs its own identity in a SETUP FILE, through the ONE deployment authority
 * (`src/config/deployment-build.mjs`) — the same seam the production build uses:
 *
 *   `tests/setup/synthetic-deployment.ts`  materialises the synthetic deployment and selects it
 *                                          (override layout) BEFORE any test module is imported, so
 *                                          `@/config` and `@/config/deployment-root` both describe the
 *                                          SYNTHETIC deployment. Synthetic configuration identity and
 *                                          synthetic filesystem identity therefore always agree — the
 *                                          ISO-B1C mixture (`synthetic siteConfig` + real
 *                                          `deploymentPaths()`) can no longer occur.
 *   `tests/setup/real-deployment.ts`       resolves the installed deployment (capsule → override →
 *                                          repository) and selects it, so a deployment test sees the
 *                                          real capsule. It runs ONLY in this project, which is why no
 *                                          package command has to resolve a deployment in order to run
 *                                          the generic suite.
 *
 * The resolution is deliberately NOT done while this config is loaded: a missing real deployment must
 * fail the DEPLOYMENT suite loudly (with the authority's own message) and must not prevent the generic
 * suite from running.
 *
 * Both extensions are COLLECTED deliberately in each project: the trees contain React component tests
 * (`.test.tsx`) as well as logic tests (`.test.ts`), and a test file must never sit in a tree while the
 * runner silently ignores its extension (owner-directed, 2026-09: `tests/unit/sidebar.test.tsx` was
 * excluded by an extension-only glob).
 *
 * Run one identity with `--project`, e.g. `pnpm exec vitest run --project foundation`; plain
 * `pnpm test` runs both (full regression confidence).
 */
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        // Foundation generic contracts — synthetic test-owned deployment.
        resolve: { alias },
        test: {
          name: "foundation",
          environment: "node",
          setupFiles: ["tests/setup/synthetic-deployment.ts"],
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
        },
      },
      {
        // A DEPLOYMENT's own acceptance tests — the real selected deployment.
        resolve: { alias },
        test: {
          name: "deployment",
          environment: "node",
          setupFiles: ["tests/setup/real-deployment.ts"],
          include: ["deployment/tests/**/*.test.ts", "deployment/tests/**/*.test.tsx"],
        },
      },
    ],
  },
});
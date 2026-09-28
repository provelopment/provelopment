import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Generic tests compose against the SYNTHETIC test deployment, so no generic contract depends
    // on the live reference deployment's configuration (§9/§10 of FOUNDATION-DEPLOYMENT-ISO-B1).
    // A deployment-scope test opts out with `vi.unmock("@/config")`.
    setupFiles: ["tests/setup/synthetic-config.ts"],
    // Both extensions are COLLECTED deliberately: the test tree contains React
    // component tests (`.test.tsx`) as well as logic tests (`.test.ts`), and a
    // test file must never sit in the tree while the runner silently ignores its
    // extension (owner-directed, 2026-09: `tests/unit/sidebar.test.tsx` was
    // excluded by an extension-only glob).
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      // FOUNDATION-DEPLOYMENT-ISO-B1 — a DEPLOYMENT's own tests live inside its write boundary
      // (`deployment/tests/**`, see `src/config/deployment-root.ts`). The glob is declared here, ONCE,
      // so a deployment can add tests without editing a platform file — which is the whole point of
      // the isolation. The directory does not exist yet (B2 moves the reference deployment's tests
      // there) and a glob that matches nothing is simply empty.
      "deployment/tests/**/*.test.ts",
      "deployment/tests/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
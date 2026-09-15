import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Both extensions are COLLECTED deliberately: the test tree contains React
    // component tests (`.test.tsx`) as well as logic tests (`.test.ts`), and a
    // test file must never sit in the tree while the runner silently ignores its
    // extension (owner-directed, 2026-09: `tests/unit/sidebar.test.tsx` was
    // excluded by an extension-only glob).
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
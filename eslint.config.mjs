import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // UI-10 D5: the CDP browser-verification harness is Node CLI infra (not
    // Next app code). It is exercised by `pnpm test:browser`; linting it as
    // server/app code would flag Node globals and is not this project's lint
    // surface.
    "tests/browser/**",
  ]),
]);

export default eslintConfig;

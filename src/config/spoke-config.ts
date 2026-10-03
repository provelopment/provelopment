/**
 * THE PER-SPOKE CONFIGURATION READER (FOUNDATION-MULTISITE-S3D1A)
 * =============================================================
 *
 * Reads ONE declared Spoke's authored configuration:
 *
 *     SpokeRootDescriptor  ->  <descriptor.root>/site.config.json  ->  raw JSON  ->  SiteConfig
 *
 * THE SECOND SANCTIONED CONFIGURATION-FILE READER, AND NOT A SECOND ROOT AUTHORITY
 * --------------------------------------------------------------------------------
 * `./deployment-build.mjs` remains the ONE answer to "which Installation is this build for?"; this module
 * answers nothing about WHICH Spoke — it is handed a descriptor that `./spoke-roots` already resolved and
 * validated. It therefore deliberately does NOT: call `process.cwd()`, discover an Installation, read
 * `spokes.json`, select a deployment layout, or read an environment variable. Its only input is a root it
 * was given, which is what makes it usable for a Spoke the selection seam never selected.
 *
 * `tests/architecture/deployment-root-guard.test.ts` names exactly these two readers and keeps every other
 * module out of the business of reading a deployment configuration file.
 *
 * `parseSiteConfig` REMAINS THE ONE SEMANTIC AUTHORITY
 * ---------------------------------------------------
 * This reader performs NO configuration semantics of its own: read the file, `JSON.parse`, hand the raw
 * value to the existing `parseSiteConfig(raw)`. Schema validation, Site resolution (exactly ONCE per Spoke),
 * default-Site selection, Hub membership, business/region/page-binding normalization and every other
 * normalization therefore stay in ONE place, and this module cannot drift from them.
 *
 * SERVER/BUILD ONLY, AND UNWIRED (S3D1A)
 * -------------------------------------
 * It touches `node:fs`, so it must never be reachable from a client or edge chunk, and it is deliberately
 * NOT exported from the `./index` barrel: nothing in `src/app/**`, `src/components/**`, `src/proxy.ts` or the
 * request path imports it. Selecting an Installation whose Spokes this reader could configure is LATER
 * work, because the running application still requires ONE globally inlined configuration.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { DEPLOYMENT_CONFIG_FILE_NAME } from "./deployment-root";
import { parseSiteConfig } from "./loader";
import type { SiteConfig } from "./site-config";
import type { SpokeRootDescriptor } from "./spoke-roots";

/** The authored configuration file a declared Spoke root must carry — one spelling, from the authority. */
export function spokeConfigFilePath(descriptor: SpokeRootDescriptor): string {
  return path.join(descriptor.root, DEPLOYMENT_CONFIG_FILE_NAME);
}

/**
 * The validated `SiteConfig` of ONE declared Spoke, or a descriptive, build-time-loud error.
 *
 * The Spoke's identity is NOT read here: a configuration file never names the Spoke that owns it — the
 * Installation manifest does (`./spoke-roots`), and this reader is only told where that Spoke is authored.
 */
export function readSpokeSiteConfig(descriptor: SpokeRootDescriptor): SiteConfig {
  const file = spokeConfigFilePath(descriptor);

  let text: string;
  try {
    text = readFileSync(path.join(descriptor.root, DEPLOYMENT_CONFIG_FILE_NAME), "utf8");
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3D1A: the Spoke root "${descriptor.root}" carries no readable ` +
        `"${DEPLOYMENT_CONFIG_FILE_NAME}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3D1A: "${file}" is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // The ONE semantic authority — unchanged, and never bypassed.
  return parseSiteConfig(raw);
}

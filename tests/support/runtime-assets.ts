/**
 * WHERE A GENERATED RUNTIME FILE ACTUALLY LIVES (FOUNDATION-MULTISITE-S3E1C)
 * ========================================================================
 *
 * From S3E1C the generated runtime tree is divided into NAMESPACES: the shared platform one
 * (`public/assets/**`, served at `/assets/**`) and one per declared Spoke
 * (`public/spokes/<runtime-segment>/assets/**`, served at `/spokes/<segment>/assets/**`). A deployment
 * acceptance test that asserts "this artwork ships at runtime" must therefore ask WHERE, not assume
 * `/assets/`.
 *
 * Both answers DELEGATE to the framework layer's own resolution (`@/config/assets`), so a test follows the
 * model instead of restating it: the platform has ONE resolution order, and these are thin projections of
 * it for assertions.
 *
 * Shared by both Vitest projects (the deployment tree's own suites and the generic ones): it reads the
 * SELECTED deployment's identity, exactly as every other support module does.
 */
import path from "node:path";

import { deploymentPaths } from "@/config/deployment-root";
import { availableIconUrl, runtimeAssetPath } from "@/config/assets";

/** The absolute generated path of `<name>`, from whichever namespace holds it, or `undefined`. */
export function runtimeAssetFile(name: string): string | undefined {
  return runtimeAssetPath(name);
}

/** The same-origin URL `<name>` is served from, or `undefined` when no namespace holds it. */
export function runtimeAssetUrl(name: string): string | undefined {
  const url = availableIconUrl(name);
  return url === undefined || url === "" ? undefined : url;
}

/**
 * The AUTHORED path of the selected installation's neutral ROLE artwork
 * (`content/assets/placeholders/<name>`).
 *
 * The companion of the two runtime helpers above, for an assertion whose subject is "this INSTALLATION
 * ships role artwork". A generic-suite run serves a tree generated from the CANONICAL deployment while its
 * own selected installation is a synthetic one, so the canonical deployment's Spoke namespace is — and must
 * be — invisible there (S3F1): what an installation ships is asked of the INSTALLATION's own sources. That
 * those sources are INSTALLED into the runtime namespaces is the deployment acceptance suite's subject
 * (`deployment/tests/**`), which runs where that installation IS the selected deployment.
 */
export function shippedRoleSource(name: string): string {
  return path.join(deploymentPaths().assetSourceRoot, "placeholders", name);
}

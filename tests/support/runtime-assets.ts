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

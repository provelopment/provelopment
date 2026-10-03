/**
 * A SPOKE'S AUTHORED RESOURCE PATHS (FOUNDATION-MULTISITE-S3E1A)
 * ============================================================
 *
 * ONE question, answered from an ALREADY-RESOLVED root:
 *
 *     given this Spoke root, where are this Spoke's authored resource trees?
 *
 *     SpokeRootDescriptor  ->  SpokeResourcePaths {
 *                                spokeRoot,
 *                                dictionaryRoot,           <spokeRoot>/config/i18n
 *                                dictionaryOverrideRoot,   <spokeRoot>/config/i18n/sites
 *                                markdownPagesRoot,        <spokeRoot>/content/pages/markdown
 *                                jsonPagesRoot,            <spokeRoot>/content/pages/json
 *                                assetSourceRoot,          <spokeRoot>/content/assets
 *                              }
 *
 * It answers NOTHING else. Not which Installation this is, not which Spoke is active, not which hostname
 * was requested, not which Site is active, and not where any runtime file should be EMITTED: a path model
 * that could choose a Spoke would be a second root authority, which is exactly what S3C1/S3D1A avoided.
 *
 * ROOT IS AN INPUT, AND NOTHING IS DISCOVERED
 * ------------------------------------------
 * The root comes from a `./spoke-roots` descriptor (S3C1 resolved and validated it). This module therefore
 * calls no `process.cwd()`, reads no environment, reads no `spokes.json`, selects no deployment layout and
 * resolves no hostname or request. It also composes with the SAME separator style the path authority uses
 * (`"<root>/<relative>"`), so a legacy descriptor's answer is character-for-character the authority's own.
 *
 * ONE SPELLING AUTHORITY
 * ----------------------
 * Every relative tree comes from `DEPLOYMENT_RESOURCE_PATHS` (`./deployment-root`), which `deploymentPaths()`
 * itself composes from — no segment is restated here, and no guard has to be loosened to allow a second
 * spelling of `config/i18n`, `content/pages/**` or `content/assets`.
 *
 * PATHS ONLY: NO EXISTENCE, NO PUBLICATION, NO RUNTIME NAMESPACE
 * -------------------------------------------------------------
 * Nothing here touches the filesystem, so deriving paths SUCCEEDS for a Spoke whose resource directories are
 * empty, absent or not yet authored — existence is not a publication assertion, and what an absent tree
 * MEANS belongs to later consumers. Nothing here enumerates pages, locales, assets, dictionaries, Sites or
 * routes, and nothing here introduces a runtime asset namespace, a Spoke runtime segment, an `assetBasePath`
 * or a runtime index: those are later slices with their own owner checkpoint.
 *
 * SERVER/BUILD CONFIGURATION, AND UNWIRED (S3E1A)
 * ----------------------------------------------
 * This is infrastructure for later resource consumers; `@/core/**` stays unaware of filesystem paths, of
 * `config/i18n`, `content/pages` and `content/assets`, and of any deployment layout. Nothing in `src/app/**`,
 * `src/components/**`, `src/proxy.ts`, the config barrel or the build imports this module yet, and the
 * legacy/active runtime keeps using `deploymentPaths()` unchanged.
 */
import { DEPLOYMENT_RESOURCE_PATHS } from "./deployment-root";
import type { SpokeRootDescriptor } from "./spoke-roots";

/**
 * The authored resource trees ONE Spoke owns. AUTHORED ownership only — an entry names where material is
 * written, never a URL, a runtime location or a publication decision.
 */
export interface SpokeResourcePaths {
  /** The Spoke's authored root, exactly as the descriptor declared it (S3C1 resolved it already). */
  readonly spokeRoot: string;
  /** The Spoke's interface-string dictionaries, one file per locale. */
  readonly dictionaryRoot: string;
  /** The Spoke's OPTIONAL site+locale dictionary overrides. */
  readonly dictionaryOverrideRoot: string;
  /** The Spoke's Markdown authoring root. */
  readonly markdownPagesRoot: string;
  /** The Spoke's declarative JSON authoring root. */
  readonly jsonPagesRoot: string;
  /** The Spoke's authored artwork sources. */
  readonly assetSourceRoot: string;
}

/**
 * The authored resource paths of ONE resolved Spoke.
 *
 * The root is taken as INPUT and used verbatim: a Spoke's IDENTITY never influences a path (an id and a
 * directory spelling are independent by design), so the descriptor's `root` is the only thing consulted.
 * No existence check is made, and none is possible here — this function cannot fail for an unauthored or
 * empty Spoke resource tree.
 */
export function spokeResourcePaths(descriptor: SpokeRootDescriptor): SpokeResourcePaths {
  const spokeRoot = descriptor.root;

  return {
    spokeRoot,
    dictionaryRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.dictionary}`,
    dictionaryOverrideRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.dictionaryOverrides}`,
    markdownPagesRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.markdownPages}`,
    jsonPagesRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.jsonPages}`,
    assetSourceRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.assetSources}`,
  };
}

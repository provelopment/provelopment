/**
 * THE REAL INSTALLATION'S SPOKE CONTEXTS, FOR DEPLOYMENT-SCOPE TESTS (FOUNDATION-MULTISITE-M18)
 * ==============================================================================================
 *
 * A deployment-scope test (`deployment/tests/**`) asks about THIS deployment. Since M18 this deployment
 * declares TWO Spokes — `foundation` and `germany` — so there is no longer any installation-wide
 * configuration, content root or asset source: the accepted authorities refuse that answer LOUDLY
 * (`./deployment-root`'s `selectedSpokeOnly`, `readDeploymentConfig`), and rightly so. "The"
 * configuration of a two-Spoke Installation would be exactly the default/precedence rule the multi-Spoke
 * runtime refuses, and a test that silently read one Spoke's file while claiming to describe "the
 * deployment" would prove nothing about the other.
 *
 * This module is therefore the ONE place deployment-scope tests name a Spoke, and it resolves each one
 * through the ACCEPTED authorities:
 *
 *     installationRuntimeIndex(root)      which Spokes this Installation declares
 *     runtimeContextForSpoke(index, id)   what ONE of them IS (identity, origin, config, resources)
 *     spokeResourcePaths                  that Spoke's authored trees (via the context's own record)
 *
 * It resolves nothing itself: it parses no manifest, derives no segment, selects no default, caches no
 * context across calls and reads no configuration file of its own. An id the Installation does not
 * declare is a LOUD failure here — a test asking for a Spoke that does not exist must not silently
 * describe a different one.
 */
import path from "node:path";

import { deploymentPaths } from "@/config/deployment-root";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";
import type { SpokeResourcePaths } from "@/config/spoke-resources";
import type { SiteConfig } from "@/config";

/** The two Spokes this deployment declares, by the ids its manifest states. */
export const FOUNDATION_SPOKE_ID = "foundation";
export const GERMANY_SPOKE_ID = "germany";

/** ONE declared Spoke, as a deployment-scope test needs it: identity, context and authored trees. */
export interface DeploymentSpoke {
  /** The authored identity (`spokes.json`). */
  readonly id: string;
  /** The whole explicit runtime context — the authority's own answer, never re-derived here. */
  readonly context: SpokeRuntimeContext;
  /** Its validated configuration (the same value the context carries). */
  readonly config: SiteConfig;
  /** Its authored resource trees. */
  readonly resources: SpokeResourcePaths;
  /** The Installation root this Spoke is declared in. */
  readonly root: string;
  /** This Spoke's authored root (`<installation>/spokes/<dir>`). */
  readonly spokeRoot: string;
  /** This Spoke's authored `content/` directory — derived from its own authored page roots. */
  readonly contentRoot: string;
  /** The file this Spoke's configuration is authored in. */
  readonly siteConfigFile: string;
  /** This Spoke's authored artwork sources. */
  readonly assetSourceRoot: string;
  /** This Spoke's authored Markdown page root (`content/pages/markdown`). */
  readonly markdownPagesRoot: string;
  /** This Spoke's authored JSON page root (`content/pages/json`). */
  readonly jsonPagesRoot: string;
  /** The Installation's generated runtime base (`public/`) — Installation-wide, never per Spoke. */
  readonly publicAssetsDirectory: string;
  /** The runtime namespaces THIS Spoke's pages may serve from: platform first, then its own. */
  readonly runtimeAssetNamespaces: SpokeRuntimeContext["runtimeAssetNamespaces"];
}

/** ONE declared Spoke of the real deployment, by identity — or a loud failure. */
export function deploymentSpoke(spokeId: string): DeploymentSpoke {
  const paths = deploymentPaths();
  const index = installationRuntimeIndex(paths.root);
  const context = runtimeContextForSpoke(index, spokeId);
  if (context === null) {
    throw new Error(
      `FOUNDATION-MULTISITE-M18: this Installation declares no Spoke "${spokeId}" (declared: ` +
        `${index.spokes.map((spoke) => spoke.id).join(", ") || "(none)"}). A deployment-scope test may ` +
        "describe only Spokes that exist; nothing is substituted.",
    );
  }

  const resources = context.resources;
  return {
    id: context.id,
    context,
    config: context.siteConfig,
    resources,
    root: paths.root,
    spokeRoot: resources.spokeRoot,
    // `content/` is the parent of the authored page roots the resource record already owns
    // (`content/pages/json` → `content/pages` → `content`), so no segment is spelled twice.
    contentRoot: path.resolve(resources.jsonPagesRoot, "..", ".."),
    siteConfigFile: path.join(resources.spokeRoot, "site.config.json"),
    assetSourceRoot: resources.assetSourceRoot,
    markdownPagesRoot: resources.markdownPagesRoot,
    jsonPagesRoot: resources.jsonPagesRoot,
    publicAssetsDirectory: paths.publicAssetsDirectory,
    runtimeAssetNamespaces: context.runtimeAssetNamespaces,
  };
}

/** The Foundation Spoke: the `ww` (Global) Site, on the Foundation origin. */
export const foundationSpoke = deploymentSpoke(FOUNDATION_SPOKE_ID);
/** The Germany Spoke: the `de` (Germany) Site, on the Germany origin. */
export const germanySpoke = deploymentSpoke(GERMANY_SPOKE_ID);
/** Every declared Spoke, in declared manifest order. */
export const deploymentSpokes = [foundationSpoke, germanySpoke] as const;

/** The Foundation Spoke's configuration — the `ww` Site's own. */
export const foundationConfig = foundationSpoke.config;
/** The Germany Spoke's configuration — the `de` Site's own. */
export const germanyConfig = germanySpoke.config;

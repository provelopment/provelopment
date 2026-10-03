/**
 * THE ACTIVE DEPLOYMENT'S CONFIGURATION — the ONE-SPOKE COMPATIBILITY BINDING (FOUNDATION-MULTISITE-M16)
 * =====================================================================================================
 *
 * `siteConfig` is what this application has always exported: the validated configuration of the deployment
 * the BUILD selected. It is read (and therefore validated) at module load, exactly as before — which is why
 * it lives in its own module rather than inside `./loader`:
 *
 *   · every consumer of the SEMANTIC authority (`parseSiteConfig`) imports `./loader`, and a multi-Spoke
 *     Installation must be able to import it (the per-Spoke reader `./spoke-config` parses ONE Spoke's
 *     configuration there) WITHOUT resolving "the" deployment's configuration, which multi-Spoke mode has
 *     none of;
 *   · a caller that genuinely asks for the ONE-SPOKE compatibility value still gets it, eagerly, and still
 *     fails LOUDLY in a multi-Spoke Installation — never with a default Spoke.
 *
 * The public surface does not change: the `@/config` barrel exports `siteConfig` from HERE.
 */
import type { SiteConfig } from "./site-config";
import { activeDeploymentSiteConfig } from "./loader";

/** The validated configuration of the SELECTED (one-Spoke) deployment. */
export const siteConfig: SiteConfig = activeDeploymentSiteConfig();

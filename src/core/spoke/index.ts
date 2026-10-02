/**
 * THE OUTER DOMAIN VOCABULARY (FOUNDATION-MULTISITE-S1)
 * ====================================================
 *
 * Barrel for the pure Spoke Hub / Spoke / Hub vocabulary and the `hostname → Spoke` decision. Import
 * from `@/core/spoke`; the inner modules are not a consumer surface.
 *
 * NOTHING IS WIRED: this module is referenced by its own tests and nothing else. Configuration,
 * filesystem roots, assets, pages and the request boundary are all LATER slices, and this one
 * deliberately holds no opinion about any of them.
 */
export { normalizeHostname } from "./hostname";
export type { Hostname } from "./hostname";

export type { Hub, HubId, HubIdentity, Spoke, SpokeHub, SpokeId, SpokeIdentity } from "./model";

export { isCoherentSpokeHub, spokeHubIssues } from "./coherence";

export { hubForSiteCode } from "./site-ownership";

export { resolveSpokeFromHost, spokeById } from "./resolve";
export type { SpokeSelection, SpokeSelectionReason } from "./resolve";

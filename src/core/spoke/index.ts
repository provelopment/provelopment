/**
 * THE OUTER DOMAIN VOCABULARY (FOUNDATION-MULTISITE-S1)
 * ====================================================
 *
 * Barrel for the pure Spoke Hub / Spoke / Hub vocabulary and the `hostname → Spoke` decision. Import
 * from `@/core/spoke`; the inner modules are not a consumer surface.
 *
 * WIRING: the pure membership partition is read by the CONFIGURATION layer alone (S3B,
 * `@/config/hub-membership`), and the identity vocabulary below by the Installation's Spoke
 * collection resolver (`@/config/spoke-roots`, S3C1 — deliberately not wired into the build or the
 * request boundary yet), so the direction is `config → core` and never the reverse. Filesystem roots,
 * assets, pages and the request boundary are all LATER slices, and this one deliberately holds no
 * opinion about any of them.
 */
export { normalizeHostname } from "./hostname";
export type { Hostname } from "./hostname";

export type { Hub, HubId, HubIdentity, Spoke, SpokeHub, SpokeId, SpokeIdentity } from "./model";

export { IMPLICIT_SPOKE_ID, spokeCollectionIssues } from "./spoke-id";

export { isCoherentSpokeHub, spokeHubIssues } from "./coherence";

export { hubForSiteCode } from "./site-ownership";

export {
  HubMembershipError,
  IMPLICIT_HUB_ID,
  hubMembershipIssues,
  partitionSitesIntoHubs,
} from "./hub-membership";
export type { SiteHubAssignment } from "./hub-membership";

export { resolveSpokeFromHost, spokeById } from "./resolve";
export type { SpokeSelection, SpokeSelectionReason } from "./resolve";

/**
 * THE AUTHORED `sites[].hub` SEAM (FOUNDATION-MULTISITE-S3B)
 * ========================================================
 *
 * THE ONE interpretation of the authored `sites[].hub` leaves. Configuration validation
 * (`./schema`) and configuration normalization (`./loader`) both read the authored Hub membership
 * THROUGH here, so the two can never disagree about what an authored `hub` means.
 *
 *   authored sites[] entries
 *           ↓  siteHubAssignments(...)
 *   SiteHubAssignment[]
 *           ↓  the accepted pure partition (`@/core/spoke`)
 *   readonly Hub[]
 *
 * WHY IT LIVES IN `src/config`
 * ---------------------------
 * This is an ADAPTER: it turns authored configuration into the pure domain's input. It knows nothing
 * about filesystems, routing, hostnames, URLs or assets — a Hub is an internal grouping with no
 * public and no filesystem meaning — and it adds no authority of its own: every rule (all-or-none,
 * the reserved implicit id, blank ids, ordering, default preservation) is the accepted pure
 * mechanism's, in `@/core/spoke`.
 *
 * The Site domain stays unaware of Hubs: `resolveSites` resolves the Spoke-wide Site population
 * ONCE, and membership is layered AFTER it. Nothing here re-resolves a Site, and there is no
 * per-Hub Site population.
 */
import {
  hubMembershipIssues,
  partitionSitesIntoHubs,
  type Hub,
  type SiteHubAssignment,
} from "@/core/spoke";
import type { ResolvedSite } from "@/core/site";

/**
 * The part of an authored `sites[]` entry this seam reads. Structural on purpose: the schema's
 * validated entry and a raw authored entry both satisfy it, so the shape is described once.
 */
export interface AuthoredSiteHubLeaf {
  readonly code: string;
  readonly hub?: string | undefined;
}

/**
 * The authored membership as the pure domain's input. An entry with no `hub` leaf contributes
 * nothing — so a configuration that declares no Hub anywhere produces ZERO assignments, which the
 * partition reads as implicit mode.
 */
export function siteHubAssignments(
  entries: readonly AuthoredSiteHubLeaf[] | undefined,
): readonly SiteHubAssignment[] {
  return (entries ?? []).flatMap((entry) =>
    entry.hub === undefined ? [] : [{ site: entry.code, hub: entry.hub }],
  );
}

/** Every membership issue the authored leaves produce for an ALREADY-RESOLVED Site population. */
export function hubMembershipIssuesForAuthoredSites(
  sites: readonly ResolvedSite[],
  entries: readonly AuthoredSiteHubLeaf[] | undefined,
): readonly string[] {
  return hubMembershipIssues(sites, siteHubAssignments(entries));
}

/**
 * The resolved Hub partition of an ALREADY-RESOLVED Site population.
 *
 * Throws `HubMembershipError` when the authored membership is incoherent — the schema reports the
 * same issues at build time, so a configuration that reaches the loader has already been refused if
 * it were invalid.
 */
export function hubsForAuthoredSites(
  sites: readonly ResolvedSite[],
  entries: readonly AuthoredSiteHubLeaf[] | undefined,
): readonly Hub[] {
  return partitionSitesIntoHubs(sites, siteHubAssignments(entries));
}

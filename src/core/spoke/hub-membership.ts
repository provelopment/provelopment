/**
 * HUB MEMBERSHIP — RESOLVE ONCE, THEN PARTITION (FOUNDATION-MULTISITE-S3A)
 * =====================================================================
 *
 * THE ONE PURE OPERATION this slice adds: given a Spoke's ALREADY-RESOLVED Site population and the
 * authored membership relationship, produce the Spoke's Hubs.
 *
 *   Spoke-wide Site inputs
 *           ↓  resolveSites(...)          ← the CALLER has already done this, ONCE
 *   one ResolvedSite population            (exactly one is `isDefault`)
 *           ↓  partitionSitesIntoHubs(...) ← THIS module
 *   readonly Hub[]
 *
 * WHY THE CALLER RESOLVES, AND THIS MODULE DOES NOT
 * -------------------------------------------------
 * `sites[]` and `defaultSite` are the SPOKE's authoritative configuration, so the Site population is
 * resolved exactly once for the Spoke and then PARTITIONED among its Hubs. Resolving per Hub would
 * create two default-bearing populations, which `./coherence` already refuses — so this module never
 * calls `resolveSites`, and it never creates, moves or changes the default Site.
 *
 * TWO MODES, AND NO GUESSING BETWEEN THEM
 * ---------------------------------------
 *   no authored membership at all → ONE IMPLICIT HUB holding every resolved Site (`IMPLICIT_HUB_ID`);
 *   ANY authored membership       → EXPLICIT mode, and then EVERY Site must be assigned.
 *
 * Explicit mode is ALL OR NONE on purpose: a population where only some Sites name a Hub has no
 * correct answer for the rest, and inventing one (from Site order, from the first Hub, from a
 * "default" Hub) would silently publish a Site under a Hub its author never chose. Such a state is
 * reported, never resolved.
 *
 * THE RESERVED ID IS NOT AUTHORABLE
 * ---------------------------------
 * `IMPLICIT_HUB_ID` is the DOMAIN's own marker for "no membership was authored". An explicit
 * assignment may therefore NEVER use it: `ww → implicit` would make an authored Hub indistinguishable
 * from the reserved one. Such an assignment is REPORTED as an issue — never renamed, never rewritten
 * to another id, and never reinterpreted as implicit mode.
 *
 * A HUB IS NOT A PLACE
 * --------------------
 * There is no Hub root, no Hub path, no Hub content/dictionary/asset directory and no Hub URL
 * segment anywhere in this module: a Hub is a pure organisational container of existing
 * `ResolvedSite` values, selected through Site membership (`./site-ownership`). Nothing here touches
 * a filesystem, a configuration file or a request.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no configuration, no schema.
 */
import { normalizeSiteCode, type SiteCode } from "@/core/site-code";
import type { ResolvedSite } from "@/core/site";

import type { Hub, HubId } from "./model";

/**
 * The reserved Hub id used when NO membership is authored: every resolved Site of the Spoke belongs
 * to this one Hub.
 *
 * It is deterministic, internal, non-public and never authored — nothing derives it from Site order,
 * a deployment name, a hostname or content. Its spelling has no public and no filesystem meaning; it
 * exists so the pure domain can name the container an unpartitioned Spoke already has.
 *
 * It is RESERVED, and specifically NOT authorable: an explicit `SiteHubAssignment` may never use it
 * (`hubMembershipIssues` reports it), so an authored Hub can never be confused with this marker.
 */
export const IMPLICIT_HUB_ID: HubId = "implicit";

/**
 * ONE authored membership entry: the Site with this code belongs to the Hub with this id.
 *
 * `site` is compared in the Site domain's own canonical spelling (`normalizeSiteCode`), so `WW` and
 * `ww` name the same Site; `hub` is an opaque identity (`HubId`), and an empty or blank one is
 * refused rather than quietly accepted. The shape is deliberately plain data — a later
 * configuration adapter decides how `sites[].hub` in authored JSON becomes these entries.
 */
export interface SiteHubAssignment {
  readonly site: SiteCode;
  readonly hub: HubId;
}

/** A Site population that cannot be partitioned into coherent Hubs. */
export class HubMembershipError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid Hub membership:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "HubMembershipError";
    this.issues = issues;
  }
}

/**
 * Every reason this population and membership cannot become coherent Hubs, in reading order — empty
 * when the partition is valid. Nothing throws here: a caller that must not proceed on a doubt asks
 * for the issues and decides for itself.
 *
 * Site VALIDITY and Spoke-wide Site-code uniqueness are deliberately NOT re-checked: the Site domain
 * refuses a malformed or duplicated site loudly when the population is resolved (`resolveSites`), and
 * `./coherence` owns the Spoke-wide rules. This function answers only the MEMBERSHIP question — which
 * includes refusing the RESERVED `IMPLICIT_HUB_ID`, so an authored Hub can never collide with the
 * marker the implicit path uses. The reserved id is compared on the trimmed spelling, so padding it
 * cannot launder a reserved word into an authored Hub identity.
 */
export function hubMembershipIssues(
  sites: readonly ResolvedSite[],
  assignments: readonly SiteHubAssignment[] = [],
): readonly string[] {
  const issues: string[] = [];

  if (sites.length === 0) {
    issues.push("a Hub partition needs at least one Site");
  }
  if (assignments.length === 0) return issues; // implicit mode: nothing more to decide

  const declared = new Set(sites.map((site) => site.code));
  const assignedTo = new Map<string, HubId>();

  assignments.forEach((assignment, index) => {
    const site = normalizeSiteCode(assignment.site);
    const where = `assignment #${index + 1}`;

    if (assignment.hub.trim() === "") {
      issues.push(`${where} gives Site "${assignment.site}" an empty Hub id`);
    }
    if (assignment.hub.trim() === IMPLICIT_HUB_ID) {
      issues.push(
        `${where}: Hub id "${IMPLICIT_HUB_ID}" is reserved for the implicit Hub and cannot be ` +
          "explicitly assigned",
      );
    }
    if (!declared.has(site)) {
      issues.push(`${where} names Site "${assignment.site}", which is not in the Site population`);
      return;
    }
    const previous = assignedTo.get(site);
    if (previous !== undefined) {
      issues.push(
        `Site "${site}" is assigned more than once (to "${previous}", then to "${assignment.hub}")`,
      );
      return;
    }
    assignedTo.set(site, assignment.hub);
  });

  for (const site of sites) {
    if (!assignedTo.has(site.code)) {
      issues.push(
        `Site "${site.code}" has no Hub assignment while another Site does: explicit Hub mode ` +
          "requires EVERY Site to be assigned (all or none)",
      );
    }
  }

  return issues;
}

/**
 * The Hubs of one Spoke: its resolved Sites partitioned by the authored membership.
 *
 * The SAME `ResolvedSite` values are carried through untouched — no clone, no re-resolution, so
 * every leaf (locales, `defaultLocale`, `fallback`, and `isDefault`) is preserved exactly. Hubs
 * appear in the order their first Site appears in the population, and each Hub's Sites keep the
 * population's order, so the result is deterministic and independent of the assignment order.
 *
 * Throws `HubMembershipError` listing every issue when the membership is incoherent — never a guess.
 */
export function partitionSitesIntoHubs(
  sites: readonly ResolvedSite[],
  assignments: readonly SiteHubAssignment[] = [],
): readonly Hub[] {
  const issues = hubMembershipIssues(sites, assignments);
  if (issues.length > 0) throw new HubMembershipError(issues);

  if (assignments.length === 0) {
    return [{ identity: { id: IMPLICIT_HUB_ID }, sites }];
  }

  const hubIdBySite = new Map<string, HubId>();
  for (const assignment of assignments) {
    hubIdBySite.set(normalizeSiteCode(assignment.site), assignment.hub);
  }

  // `hubMembershipIssues` has already refused an unassigned Site, so this always answers; it throws
  // rather than returning a guess if that invariant is ever broken.
  const hubIdOf = (site: ResolvedSite): HubId => {
    const hubId = hubIdBySite.get(site.code);
    if (hubId === undefined) {
      throw new HubMembershipError([`Site "${site.code}" has no Hub assignment`]);
    }
    return hubId;
  };

  const buckets = new Map<HubId, ResolvedSite[]>();
  for (const site of sites) {
    const hubId = hubIdOf(site);
    const bucket = buckets.get(hubId);
    if (bucket === undefined) buckets.set(hubId, [site]);
    else bucket.push(site);
  }

  return [...buckets].map(([id, hubSites]) => ({ identity: { id }, sites: hubSites }));
}

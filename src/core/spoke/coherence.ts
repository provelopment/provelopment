/**
 * THE SPOKE-HUB COHERENCE CONTRACT (FOUNDATION-MULTISITE-S1)
 * ========================================================
 *
 * The pure rules that make `hostname → Spoke` a TOTAL decision. Every defect below would make a
 * request either ambiguous (two Spokes answering for one host) or silently unresolvable (a hostname
 * no claim can ever match). None of them is filesystem state — they are properties of CONSTRUCTED
 * VALUES — so they belong in `@/core` and the checks are pure.
 *
 * ONE SITE CODE BELONGS TO ONE HUB IN ITS SPOKE (S2)
 * --------------------------------------------------
 * A public URL is `/<site>/<locale>/<route>` and carries NO Hub segment, so once the hostname has
 * chosen the Spoke the Site code alone must identify the Site. Two Hubs of the same Spoke therefore
 * may not claim the same code. The uniqueness boundary is the SPOKE, not the installation: the same
 * code in two DIFFERENT Spokes is perfectly valid, because the hostname already told them apart.
 *
 * ONE DEFAULT SITE PER SPOKE (S2A)
 * --------------------------------
 * A Spoke is ONE public domain and a Hub never appears in a public URL, so `/` has no Site segment
 * from which to infer a Hub: there must be EXACTLY ONE default Site across ALL of a Spoke's Hubs.
 * The default stays the Site domain's own flag (`ResolvedSite.isDefault`, `@/core/site`); only the
 * uniqueness of the designation is decided here, and it is NEVER inferred from Hub order or Site
 * order. The designation is Spoke-wide, and each Spoke has its own.
 *
 * WHY "AT LEAST ONE" IS DECIDED HERE AND NOT ON DISK
 * --------------------------------------------------
 * The resolved domain model is `1..*` at every level: a Spoke Hub coordinates at least one Spoke, a
 * Spoke owns at least one Hub, and a Hub owns at least one Site. An empty DIRECTORY
 * proves nothing — authored material may be incomplete and still valid — so emptiness is never a
 * filesystem error. It is a defect only in the RESOLVED model, which is exactly what these checks
 * describe.
 *
 * ONE EXACT HOSTNAME BELONGS TO ONE SPOKE
 * ---------------------------------------
 * Ownership is exact, so a conflict is simple: the SAME hostname named by two different Spokes. No
 * match-space reasoning is needed — a claim for `example.com` never reaches `sub.example.com` — so the
 * only ambiguity two Spokes can create is naming the identical hostname.
 *
 * EVERY ISSUE IS REPORTED, IN ORDER
 * ---------------------------------
 * `spokeHubIssues` collects all of them, in reading order, so one message names every field to repair
 * — the same shape `@/core/foundation-release` and `@/core/foundation-installation` use for their own
 * contracts. Nothing here throws: a caller that must not proceed on a doubt asks for the issues and
 * decides for itself.
 *
 * Framework-neutral: pure data and pure functions.
 */
import { normalizeHostname, type Hostname } from "./hostname";
import type { Spoke, SpokeHub } from "./model";

/** Whether a configured hostname value is already in the ONE normalized spelling. */
function isNormalizedHostname(value: string): boolean {
  return normalizeHostname(value) === value;
}

/** One Spoke's own issues: identity, canonical host, Hubs and claims. */
function spokeIssues(spoke: Spoke): readonly string[] {
  const issues: string[] = [];
  const { id, canonicalHostname, hostnameClaims } = spoke.identity;

  if (hostnameClaims.length === 0) {
    issues.push(`Spoke "${id}" claims no hostname, so no request can ever reach it`);
  }
  if (!isNormalizedHostname(canonicalHostname)) {
    issues.push(
      `Spoke "${id}": canonicalHostname "${canonicalHostname}" is not a normalized hostname ` +
        "(lowercase, no port, no trailing dot)",
    );
  }
  const claimsCanonical = hostnameClaims.includes(canonicalHostname);
  if (!claimsCanonical) {
    issues.push(
      `Spoke "${id}": canonicalHostname "${canonicalHostname}" is not one of its own hostname claims`,
    );
  }
  for (const hostname of hostnameClaims) {
    if (!isNormalizedHostname(hostname)) {
      issues.push(
        `Spoke "${id}": hostname claim "${hostname}" is not a normalized hostname ` +
          "(lowercase, no port, no trailing dot)",
      );
    }
  }

  if (spoke.hubs.length === 0) {
    issues.push(`Spoke "${id}" owns no Hub`);
  }
  const seenHubs = new Set<string>();
  for (const hub of spoke.hubs) {
    if (seenHubs.has(hub.identity.id)) {
      issues.push(`Spoke "${id}": duplicate Hub id "${hub.identity.id}"`);
    }
    seenHubs.add(hub.identity.id);
  }

  // S2 — Sites. A Hub owns at least one Site, and a Site CODE occurs at most once across the WHOLE
  // Spoke: a public URL is `/<site>/<locale>/<route>` with no Hub segment, so once the hostname has
  // chosen the Spoke, the code alone must identify the Site. The uniqueness boundary is the SPOKE —
  // the same code in two different Spokes is valid, because the hostname already separates them.
  // (Site VALIDITY stays the Site domain's business: `@/core/site` refuses a bad code loudly when a
  // deployment's sites are resolved, so it is deliberately not re-implemented here.)
  const claimingHubsBySiteCode = new Map<string, string[]>();
  for (const hub of spoke.hubs) {
    if (hub.sites.length === 0) {
      issues.push(`Spoke "${id}": Hub "${hub.identity.id}" owns no Site`);
    }
    for (const site of hub.sites) {
      const claimants = claimingHubsBySiteCode.get(site.code) ?? [];
      claimants.push(hub.identity.id);
      claimingHubsBySiteCode.set(site.code, claimants);
    }
  }
  for (const [code, hubIds] of claimingHubsBySiteCode) {
    if (hubIds.length === 1) continue;
    const distinct = [...new Set(hubIds)];
    if (distinct.length === 1) {
      issues.push(
        `Spoke "${id}": Hub "${distinct[0]}" states the site code "${code}" more than once`,
      );
      continue;
    }
    issues.push(
      `Spoke "${id}": site code "${code}" appears in more than one Hub (${distinct.join(", ")}): ` +
        "a Site code must be unique across the whole Spoke, because a public URL has no Hub segment",
    );
  }

  // S2A — the DEFAULT Site is a SPOKE-wide fact. A Spoke is one public domain and a Hub never appears
  // in a public URL, so `/` has no Site segment from which to infer a Hub: exactly ONE Site across
  // ALL of the Spoke's Hubs must be the domain's default. The flag itself belongs to the Site domain
  // (`ResolvedSite.isDefault`); only its uniqueness is decided here — never inferred from Hub order
  // or Site order.
  const defaultSites = spoke.hubs.flatMap((hub) =>
    hub.sites
      .filter((site) => site.isDefault)
      .map((site) => ({ hubId: hub.identity.id, code: site.code })),
  );
  if (defaultSites.length === 0) {
    issues.push(
      `Spoke "${id}" has no default Site: exactly one of its Hubs' Sites must be the domain's default`,
    );
  } else if (defaultSites.length > 1) {
    const named = defaultSites.map((site) => `"${site.code}" in Hub "${site.hubId}"`).join(", ");
    issues.push(
      `Spoke "${id}" has ${defaultSites.length} default Sites (${named}): a Spoke is ONE public ` +
        "domain, so exactly one default Site is allowed across all of its Hubs",
    );
  }

  return issues;
}

/**
 * Every coherence issue in a Spoke Hub, in reading order — empty when the model is coherent.
 *
 * The rules are: the Spoke Hub coordinates at least one Spoke; Spoke ids are unique; every Spoke
 * claims at least one hostname, its canonical host among them, and in the normalized spelling; every
 * Spoke owns at least one Hub with a unique id; no hostname is claimed by more than one Spoke; every
 * Hub owns at least one Site; no Site code occurs twice within one Spoke (while the same code in
 * two DIFFERENT Spokes is allowed); and exactly ONE of a Spoke's Sites is its default (the
 * designation is Spoke-wide, and each Spoke has its own).
 */
export function spokeHubIssues(spokeHub: SpokeHub): readonly string[] {
  const issues: string[] = [];
  const { spokes } = spokeHub;

  if (spokes.length === 0) {
    issues.push("The Spoke Hub coordinates no Spoke");
  }

  const seenSpokes = new Set<string>();
  for (const spoke of spokes) {
    if (seenSpokes.has(spoke.identity.id)) {
      issues.push(`duplicate Spoke id "${spoke.identity.id}"`);
    }
    seenSpokes.add(spoke.identity.id);
    issues.push(...spokeIssues(spoke));
  }

  const claimantsByHostname = new Map<Hostname, string[]>();
  for (const spoke of spokes) {
    for (const hostname of spoke.identity.hostnameClaims) {
      const claimants = claimantsByHostname.get(hostname) ?? [];
      claimants.push(spoke.identity.id);
      claimantsByHostname.set(hostname, claimants);
    }
  }

  for (const [hostname, claimants] of claimantsByHostname) {
    if (claimants.length === 1) continue;
    const distinct = [...new Set(claimants)];
    if (distinct.length === 1) {
      issues.push(
        `Spoke "${distinct[0]}": the hostname claim "${hostname}" is stated more than once`,
      );
      continue;
    }
    issues.push(
      `hostname "${hostname}" is claimed by more than one Spoke (${distinct.join(", ")}): ` +
        "one host can belong to only one Spoke",
    );
  }

  return issues;
}

/** True when a Spoke Hub satisfies every coherence rule. */
export function isCoherentSpokeHub(spokeHub: SpokeHub): boolean {
  return spokeHubIssues(spokeHub).length === 0;
}

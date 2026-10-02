/**
 * HOSTNAME → SPOKE RESOLUTION (FOUNDATION-MULTISITE-S1)
 * ====================================================
 *
 * THE ONE PURE DECISION of the outer layer: given a raw request host, which Spoke answers — or none.
 *
 *   1. a host claimed EXPLICITLY by a Spoke → that Spoke;
 *   2. otherwise                            → no result (`null`).
 *
 * Ownership is EXACT: a Spoke that claims `example.com` does NOT answer `sub.example.com`, and a
 * Spoke may claim several exact hostnames — its canonical host plus any aliases.
 *
 * `null` is a RESULT, not an error. An unclaimed hostname must eventually be answered with nothing at
 * all rather than with a default domain, because serving one domain's identity, content and assets
 * under another domain's hostname is the failure this layer exists to prevent. This module therefore
 * never guesses and never falls back; the fail-closed answer belongs to whatever calls it, and that
 * caller is a later slice — the request boundary is deliberately untouched here.
 *
 * WHY THERE IS NO DEVELOPMENT/PREVIEW BRANCH
 * ------------------------------------------
 * Whether a development or a preview host should resolve to a particular Spoke is a POLICY decision
 * that a later slice owns (this repository's existing `FOUNDATION_DEPLOYMENT_ROOT` build-time override
 * is the current, build-time mechanism). This slice implements the pure MECHANISM only, so a selection
 * carries the single reason it can actually justify today.
 *
 * The decision is PURE: no filesystem, no request object, no configuration import — so the same
 * function is valid at a request boundary, in a test and at build time.
 */
import { normalizeHostname, type Hostname } from "./hostname";
import type { Spoke, SpokeHub, SpokeId } from "./model";

/**
 * How a Spoke was selected.
 *
 * Exactly one reason exists in this slice. A development/preview reason is deliberately absent until a
 * later slice decides that policy; adding it then WIDENS this union rather than changing a caller.
 */
export type SpokeSelectionReason = "registered-hostname";

/** WHICH Spoke answers a request host, and the normalized hostname the decision was made from. */
export interface SpokeSelection {
  readonly spokeId: SpokeId;
  readonly hostname: Hostname;
  readonly reason: SpokeSelectionReason;
}

/**
 * The Spoke that answers this request host, or `null` when none does.
 *
 * Total and pure: it never throws and never guesses. The first Spoke with a matching claim wins, and
 * `./coherence` is what guarantees a second can never exist — a hostname claimed by two Spokes is a
 * REPORTED defect, not a race settled here.
 */
export function resolveSpokeFromHost(
  spokeHub: SpokeHub,
  host: string | null | undefined,
): SpokeSelection | null {
  const hostname = normalizeHostname(host);
  if (hostname === null) return null;

  for (const spoke of spokeHub.spokes) {
    if (spoke.identity.hostnameClaims.includes(hostname)) {
      return { spokeId: spoke.identity.id, hostname, reason: "registered-hostname" };
    }
  }

  return null;
}

/** The Spoke with this id, or `null` — an undeclared id answers nothing. */
export function spokeById(spokeHub: SpokeHub, id: SpokeId): Spoke | null {
  return spokeHub.spokes.find((spoke) => spoke.identity.id === id) ?? null;
}

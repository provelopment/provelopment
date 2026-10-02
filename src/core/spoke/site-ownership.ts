/**
 * SITE OWNERSHIP WITHIN ONE SPOKE (FOUNDATION-MULTISITE-S2)
 * =======================================================
 *
 * THE ONE PURE DECISION this slice adds to the outer layer: given an already-selected Spoke and a
 * Site code, which Hub owns that Site?
 *
 *   the Hub whose Sites contain that code   → that Hub
 *   otherwise                               → `null`
 *
 * WHY THE SPOKE IS THE CALLER'S INPUT
 * -----------------------------------
 * The outer decision is `hostname → Spoke` (`./resolve`); this module is the step after it. Keeping
 * the two apart is what lets the eventual request model stay
 *
 *     hostname   → Spoke
 *     /<site>    → Site → its owning Hub
 *
 * with NO Hub segment in a public URL. The Site code alone must therefore identify the Site within
 * its Spoke, which is exactly what `./coherence` enforces spoke-wide.
 *
 * IT DOES NOT REPLACE THE SITE DOMAIN
 * -----------------------------------
 * Site semantics, locale policy and Site resolution stay where they are (`@/core/site`); this module
 * answers only WHICH HUB a Site belongs to. A code is compared in the Site domain's own canonical
 * spelling (`normalizeSiteCode`, `@/core/site-code`) — the same rule `siteByCode` applies — so the
 * two lookups agree by construction rather than by convention.
 *
 * `null` is a RESULT, not an error: a Site no Hub owns answers nothing, and this module never guesses
 * and never falls back to a Hub. Coherence is what guarantees a duplicate Site code — the one thing
 * that could make the answer ambiguous — cannot exist in a valid Spoke.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no request, no URL parsing.
 */
import { normalizeSiteCode, type SiteCode } from "@/core/site-code";

import type { Hub, Spoke } from "./model";

/**
 * The Hub that owns this Site code inside ONE Spoke, or `null` when no Hub of that Spoke owns it.
 *
 * The first matching Hub wins; `./coherence` is what guarantees a second can never exist within one
 * Spoke. The same code in ANOTHER Spoke is irrelevant here — the Spoke is the caller's input, and
 * the hostname is what chose it.
 */
export function hubForSiteCode(spoke: Spoke, siteCode: SiteCode): Hub | null {
  const wanted = normalizeSiteCode(siteCode);
  for (const hub of spoke.hubs) {
    if (hub.sites.some((site) => site.code === wanted)) return hub;
  }
  return null;
}

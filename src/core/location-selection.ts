/**
 * THE PER-SITE LOCATION-SELECTION POLICY (FOUNDATION-LOC1)
 * =======================================================
 *
 * A **Location** is physical/business context INSIDE one **Site** (`@/core/region`), and until this
 * policy existed every Site had exactly two visitor states: a Location, or the explicit *unspecified*
 * one. Some Sites are not like that. Every page they publish belongs to a place, and an unspecified
 * visitor state is not something their adopter wants to offer at all — so the adopter must be able to
 * say so, once, about that one Site:
 *
 *     "sites": [
 *       { "code": "ww", "locationSelection": { "mode": "required", "default": "<location id>" } }
 *     ]
 *
 * WHAT THE POLICY IS — AND WHAT IT IS NOT
 * ---------------------------------------
 *   · it is a decision about ONE Site's own Location dimension: never another Site's, never a Spoke's,
 *     never a page's, never a language's and never the deployment's;
 *   · it is EXPLICIT. The default Location is the adopter's configured choice and is NEVER inferred —
 *     not from alphabetical order, binding order, locale, timezone, country, a browser, "the first
 *     region" or "the first binding";
 *   · it is OPTIONAL, and its absence is a first-class state: a Site that declares no policy keeps the
 *     established optional behaviour EXACTLY (the Location selector keeps its explicit unspecified
 *     option, and non-regional routes stay valid). No Installation becomes required-Location by
 *     accident, and no existing configuration needs migrating;
 *   · it stores NOTHING: the Location stays URL-authoritative, so a required Site reaches its default
 *     Location through a PUBLIC REDIRECT, and every later request already names its Location. There is
 *     no cookie, no session, no client state and no environment variable in this model;
 *   · it is per Site and scoped by Site. A Location belongs to one Site's page tree, so a Location of
 *     another Site can never satisfy a Site's requirement, enter its routing or enter its selector.
 *
 * ONE MODEL, NO SECOND ONE
 * ------------------------
 * Every rule below is COMPOSED from the accepted Location domain (`@/core/regional-pages`:
 * `bindingsForSite`, `regionsForSite`, `isRegionBoundToLocale`, `regionDefaultLocale`,
 * `resolveLocationDestination`, `regionalPath`). This module adds no Location-routing model, no second
 * default-locale rule and no second ordering rule — it states WHICH Location a required Site must use,
 * and the accepted rules answer WHERE that Location's page is.
 *
 * WHAT IT REFUSES, AND WHY IT REFUSES IT EARLY
 * -------------------------------------------
 * A policy that cannot be honoured is a CONFIGURATION DEFECT, never a runtime 404: `required` mode is
 * validated at build time. A default that names no configured Location, one that belongs to another
 * Site's inventory, a Site that binds no Location at all, and a default whose landing destination does
 * not exist are each refused with the Site, the configured default Location and the violated rule named
 * (`locationSelectionIssues`). Nothing is guessed on the visitor's behalf, and nothing is repaired
 * silently.
 *
 * Framework-free and pure: no React, no Next.js, no filesystem, no configuration read, no request
 * object.
 */

import type { OperationalRegion, PageRegionBinding } from "./region";
import {
  bindingsForSite,
  hasPageEntry,
  isRegionBoundToLocale,
  regionDefaultLocale,
  regionsForSite,
  regionalPath,
  resolveLocationDestination,
} from "./regional-pages";

/** The ONE supported mode. A Site either REQUIRES a Location, or declares no policy at all. */
export const REQUIRED_LOCATION_SELECTION_MODE = "required";

/**
 * A Site's authored `locationSelection` block, exactly as a configuration file may spell it.
 *
 * Deliberately permissive in TYPE: the ONE shape rule is `locationSelectionIssue` below, which the
 * configuration schema and the site resolver BOTH apply, so an author sees one message and the two
 * cannot drift apart.
 */
export interface AuthoredLocationSelection {
  readonly mode?: string;
  readonly default?: string;
}

/** The ONE supported policy: a Site whose visitors are always inside one of its Locations. */
export interface LocationSelectionPolicy {
  readonly mode: typeof REQUIRED_LOCATION_SELECTION_MODE;
  /** The Location this Site requires — a configured Location of THIS Site's own inventory. */
  readonly default: string;
}

/**
 * THE ONE SHAPE RULE for an authored `locationSelection` block — or `null` when it is exactly the one
 * supported policy.
 *
 * Applied by the configuration schema (`./schema`) AND by the Site resolver (`./site`), which is how
 * "validation and resolution cannot disagree" is kept: one predicate, one message.
 */
export function locationSelectionIssue(value: AuthoredLocationSelection): string | null {
  if (value.mode !== REQUIRED_LOCATION_SELECTION_MODE) {
    return (
      `"locationSelection.mode" must be "${REQUIRED_LOCATION_SELECTION_MODE}" (got ` +
      `${typeof value.mode === "string" ? `"${value.mode}"` : "nothing"}) — a Site either requires a ` +
      'Location, or omits the whole "locationSelection" block for the established optional behaviour ' +
      "(there is no second mode and no default)."
    );
  }

  if (typeof value.default !== "string" || value.default.trim() === "") {
    return (
      '"locationSelection.default" must name the Location this Site requires — a non-empty id of an ' +
      'operating Location configured in "business.regions" for THIS Site. The default Location is ' +
      "never inferred from order, locale, timezone or country."
    );
  }

  return null;
}

/** True when an authored value is EXACTLY the one supported policy (never for an absent block). */
export function isLocationSelectionPolicy(value: unknown): value is LocationSelectionPolicy {
  if (typeof value !== "object" || value === null) return false;
  return locationSelectionIssue(value as AuthoredLocationSelection) === null;
}

/**
 * The OPERATING LOCATIONS a required-Location decision reads: the accepted `regionDefaultLocale` rule
 * reads nothing but `defaultLocale`, so this is the narrow structural view both callers already have —
 * the runtime's normalized regions and the configuration schema's raw ones.
 */
export type LocationSelectionRegions = Readonly<
  Record<string, Pick<OperationalRegion, "defaultLocale">>
>;

export interface RequiredLocationDestinationOptions {
  /** The Site's policy, or `null`/absent for the established optional behaviour. */
  readonly policy: LocationSelectionPolicy | null | undefined;
  /** The Site the request resolved to — its code scopes every lookup below. */
  readonly siteCode: string;
  /** The Site's PUBLIC prefix (`""` for the deployment's default Site) — from `@/core/site`. */
  readonly sitePrefix: string;
  /** The locale path key the request resolved to. */
  readonly localePath: string;
  /** The route path INSIDE the Site+locale — `""` for `/<site>/<locale>`. */
  readonly routePath: string;
  readonly regions: LocationSelectionRegions;
  /** Every configured page binding; the Site's own are selected here, once. */
  readonly bindings: readonly PageRegionBinding[];
}

/**
 * THE PUBLIC DESTINATION of a NON-REGIONAL request in a required-Location Site, or `null` when the
 * request must be answered exactly as it is.
 *
 * `null` means one of two things, and both are "leave it alone":
 *
 *   · the Site declares no policy — the established optional behaviour, untouched; or
 *   · the request ALREADY names one of THIS Site's Locations for its locale — including a Location
 *     other than the default, because a visitor who deliberately chose a place stays in it.
 *
 * Otherwise the destination is the accepted deterministic Location rule
 * (`resolveLocationDestination`), asked for the configured default Location and the current route:
 *
 *   /<site>/<locale>            → /<site>/<locale>/<default>          (the Location's landing)
 *   /<site>/<locale>/<page>     → /<site>/<locale>/<default>/<page>   (when that page exists there)
 *   /<site>/<locale>/<page>     → the default Location's landing      (the accepted fallback)
 *   /<site>/<locale not bound>  → /<site>/<region defaultLocale>/<default>
 *
 * A second locale rule is deliberately NOT introduced: the requested locale is kept whenever the
 * default Location is bound to it, and otherwise the accepted `regionDefaultLocale` decides — exactly
 * as the Location selector and the language switcher already do.
 */
export function requiredLocationDestination(
  options: RequiredLocationDestinationOptions,
): string | null {
  const { policy, siteCode, sitePrefix, localePath, routePath, regions, bindings } = options;
  if (policy === null || policy === undefined) return null;

  // ONE scoping step, the accepted one: a binding of another Site can never answer here.
  const entries = bindingsForSite(bindings, siteCode);

  // A request that already names a Location of THIS Site+locale is not completed at all.
  const first = routePath.split("/")[0];
  if (routePath !== "" && isRegionBoundToLocale(entries, localePath, first)) return null;

  const destination = resolveLocationDestination({
    entries,
    locale: localePath,
    targetRegion: policy.default,
    currentSlug: routePath === "" ? null : routePath,
    defaultLocale: regionDefaultLocale(regions, entries, policy.default),
  });
  if (destination === null) return null;

  return regionalPath(destination.locale, destination.region, destination.slug, sitePrefix);
}

/**
 * THE SELECTOR'S ORDER for one Site's own Location inventory.
 *
 * Optional behaviour is returned UNCHANGED — a Site with no policy keeps the accepted ordering
 * exactly. A required Site leads with its configured default Location (the Location its visitors are
 * in), and the remaining Locations follow in the order the caller already computed (the accepted
 * deterministic label sort the selector has always applied). Nothing else is reordered.
 */
export function orderedLocationIdsForSelector(
  regionIds: readonly string[],
  policy: LocationSelectionPolicy | null | undefined,
): readonly string[] {
  if (policy === null || policy === undefined) return regionIds;
  if (!regionIds.includes(policy.default)) return regionIds;
  return [policy.default, ...regionIds.filter((regionId) => regionId !== policy.default)];
}

/** ONE refused policy: the Site, the configured default Location and the violated rule. */
export interface LocationSelectionIssue {
  /** The Site the policy belongs to, so a caller can point at the authored entry. */
  readonly siteCode: string;
  readonly message: string;
}

export interface LocationSelectionValidationOptions {
  /** The deployment's sites, in configuration order, with the policy each resolved. */
  readonly sites: readonly {
    readonly code: string;
    readonly locationSelection?: LocationSelectionPolicy | null;
  }[];
  /** `business.regions` — every configured operating Location, deployment-wide. */
  readonly regions: LocationSelectionRegions;
  /** Every configured page binding, in NORMALIZED form (see `normalizePageRegionBindings`). */
  readonly bindings: readonly PageRegionBinding[];
}

/**
 * EVERY required-Location policy that cannot be honoured, as actionable issues.
 *
 * The four rules are the four ways a Site can promise a Location it does not have. They are checked in
 * the order an author would fix them, so ONE policy reports ONE issue rather than a cascade:
 *
 *   1. the configured default must be an operating Location of `business.regions`;
 *   2. the Site must actually HAVE Locations (bindings of its own that name a region);
 *   3. the default must belong to THIS Site's Location inventory — a Location of another Site never
 *      satisfies it;
 *   4. the default must have a usable landing destination in THIS Site, so the visitor a required Site
 *      redirects can actually land somewhere (the accepted `regionDefaultLocale` rule decides the
 *      locale, and the accepted landing rule decides the page).
 */
export function locationSelectionIssues(
  options: LocationSelectionValidationOptions,
): readonly LocationSelectionIssue[] {
  const { sites, regions, bindings } = options;
  const issues: LocationSelectionIssue[] = [];

  for (const site of sites) {
    const policy = site.locationSelection ?? null;
    if (policy === null) continue;

    const entries = bindingsForSite(bindings, site.code);
    const locationIds = regionsForSite(bindings, site.code);
    const where = `Site "${site.code}" (locationSelection.default "${policy.default}")`;

    if (!Object.hasOwn(regions, policy.default)) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: the default Location is not an operating Location — no such entry exists in ` +
          '"business.regions", so this Site would require a Location that does not exist. ' +
          `Configured Locations: ${Object.keys(regions).join(", ") || "(none)"}.`,
      });
      continue;
    }

    if (locationIds.length === 0) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: this Site binds NO Location at all (no "business.pages" binding of this Site ` +
          "names a region), so there is no Location a visitor could be required to reach. Add a " +
          `landing binding for this Site (e.g. { "site": "${site.code}", "locale": "…", "region": ` +
          `"${policy.default}" }), or remove the policy.`,
      });
      continue;
    }

    if (!locationIds.includes(policy.default)) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: the default Location is not part of THIS Site's Location inventory ` +
          `(${locationIds.join(", ")}) — a Location belongs to one Site's page tree, so another ` +
          "Site's Location can never satisfy this Site's requirement.",
      });
      continue;
    }

    const defaultLocale = regionDefaultLocale(regions, entries, policy.default);
    if (defaultLocale === null || !hasPageEntry(entries, defaultLocale, policy.default, null)) {
      issues.push({
        siteCode: site.code,
        message:
          `${where}: the default Location has no usable landing destination in this Site — the ` +
          "accepted default-locale rule resolves to " +
          `${defaultLocale === null ? "no locale at all" : `"${defaultLocale}"`}` +
          ", and this Site has no landing entry for it, so a visitor redirected into the default " +
          `Location would land on nothing. Add a landing binding (e.g. { "site": "${site.code}", ` +
          `"locale": "${defaultLocale ?? "…"}", "region": "${policy.default}" }), or point ` +
          '"locationSelection.default" at a Location that is reachable in this Site.',
      });
    }
  }

  return issues;
}

/**
 * THE ONE REFUSAL: a required-Location policy that cannot be honoured is a configuration defect, and it
 * fails at build time — loudly, with every violated rule and the Site it belongs to named. It is never
 * allowed to become a runtime 404.
 */
export function assertLocationSelectionValid(options: LocationSelectionValidationOptions): void {
  const issues = locationSelectionIssues(options);
  if (issues.length === 0) return;

  throw new Error(
    "FOUNDATION-LOC1: invalid location-selection configuration:\n" +
      issues.map((issue) => `  - ${issue.message}`).join("\n"),
  );
}
